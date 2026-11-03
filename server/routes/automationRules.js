import express from 'express';
import AutomationRule from '../models/AutomationRule.js';
import MessageReminder from '../models/MessageReminder.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

const STOPWORDS = new Set([
  'if', 'when', 'then', 'me', 'my', 'a', 'an', 'the', 'about', 'after', 'before',
  'from', 'messages', 'message', 'says', 'say', 'remind', 'reminder', 'minutes',
  'minute', 'hours', 'hour', 'to', 'for', 'of', 'on', 'in'
]);

const cleanKeyword = (word) => word.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();

export function parseAutomationRule(text = '') {
  const lower = text.toLowerCase();
  const delayMatch = lower.match(/(?:after|in)\s+(\d{1,4})\s*(minute|minutes|min|hour|hours|hr|hrs|day|days)/);
  let delayMinutes = 30;
  if (delayMatch) {
    const amount = Number(delayMatch[1]);
    const unit = delayMatch[2];
    if (unit.startsWith('hour') || unit.startsWith('hr')) delayMinutes = amount * 60;
    else if (unit.startsWith('day')) delayMinutes = amount * 1440;
    else delayMinutes = amount;
  }

  const senderMatch = lower.match(/(?:from|if)\s+@?([a-z0-9_.-]{2,40})\s+(?:messages|message|says|mentions|texts|about)/);
  const senderName = senderMatch?.[1] || '';

  const aboutMatch = lower.match(/(?:about|mentions|contains)\s+(.+?)(?:,\s*|\s+then|\s+remind|\s+after|\s+in\s+\d|$)/);
  const keywordSource = aboutMatch?.[1] || lower;
  const keywords = [...new Set(
    keywordSource
      .split(/\s+/)
      .map(cleanKeyword)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
  )].slice(0, 8);

  const note = keywords.length
    ? `Automation reminder: ${keywords.join(', ')}`
    : 'Automation reminder from Kane';

  return {
    trigger: {
      type: 'incoming_message',
      senderName,
      keywords,
      matchMode: 'any'
    },
    action: {
      type: 'reminder',
      delayMinutes: Math.min(Math.max(delayMinutes, 1), 10080),
      note
    }
  };
}

router.get('/', auth, async (req, res) => {
  try {
    const rules = await AutomationRule.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/preview', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Rule text is required' });
  res.json(parseAutomationRule(text));
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, naturalLanguage, trigger, action } = req.body;
    if (!naturalLanguage?.trim()) {
      return res.status(400).json({ message: 'Automation text is required' });
    }

    const parsed = parseAutomationRule(naturalLanguage);
    const rule = await AutomationRule.create({
      userId: req.user.id,
      name: name?.trim() || naturalLanguage.slice(0, 80),
      naturalLanguage: naturalLanguage.trim(),
      trigger: { ...parsed.trigger, ...(trigger || {}) },
      action: { ...parsed.action, ...(action || {}) }
    });

    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const allowed = {};
    if (typeof req.body.enabled === 'boolean') allowed.enabled = req.body.enabled;
    if (req.body.name) allowed.name = req.body.name;

    const rule = await AutomationRule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      allowed,
      { new: true }
    );
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await AutomationRule.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'Automation deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export async function evaluateAutomationRules(message) {
  if (!message?.recipientId || !message?.content || message.messageType !== 'text') return;

  const sender = await User.findById(message.senderId).select('username');
  const senderName = sender?.username?.toLowerCase() || '';
  const content = message.content.toLowerCase();

  const rules = await AutomationRule.find({
    userId: message.recipientId,
    enabled: true,
    'trigger.type': 'incoming_message'
  }).limit(100);

  for (const rule of rules) {
    const expectedSender = rule.trigger?.senderName?.toLowerCase()?.trim();
    if (expectedSender && senderName !== expectedSender && !senderName.includes(expectedSender)) {
      continue;
    }

    const keywords = rule.trigger?.keywords || [];
    const keywordMatch = keywords.length === 0
      ? true
      : rule.trigger.matchMode === 'all'
        ? keywords.every((keyword) => content.includes(keyword.toLowerCase()))
        : keywords.some((keyword) => content.includes(keyword.toLowerCase()));

    if (!keywordMatch) continue;

    const remindAt = new Date(Date.now() + (rule.action.delayMinutes || 30) * 60 * 1000);
    await MessageReminder.create({
      userId: message.recipientId,
      messageId: message._id,
      chatId: message.chatId,
      note: rule.action.note || rule.name,
      originalSnippet: message.content.slice(0, 200),
      remindAt,
      createdViaVoice: false
    });

    rule.stats.runCount += 1;
    rule.stats.lastRunAt = new Date();
    await rule.save();
  }
}

export default router;
