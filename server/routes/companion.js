import express from 'express';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

let model;
const getModel = () => {
  if (!model && process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }
  return model;
};

const VIBE_PROMPTS = {
  chill: 'You are relaxed, supportive, and calm — like a chill friend who listens first.',
  hype: 'You are energetic, funny, and hype — celebrate wins and motivate with enthusiasm.',
  mentor: 'You are wise and practical — give clear advice without being preachy.',
  bestie: 'You are their best friend — warm, loyal, uses light humor, remembers personal details.'
};

router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('aiCompanion username');
    res.json({
      username: user.username,
      companion: user.aiCompanion || {}
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { nickname, vibe } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.aiCompanion) user.aiCompanion = {};
    if (nickname) user.aiCompanion.nickname = nickname;
    if (vibe && VIBE_PROMPTS[vibe]) user.aiCompanion.vibe = vibe;
    await user.save();
    res.json(user.aiCompanion);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/chat', auth, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'Message required' });

    const ai = getModel();
    const user = await User.findById(req.user.id);
    if (!user.aiCompanion) user.aiCompanion = { vibe: 'bestie', memories: [], chatHistory: [] };

    const vibe = user.aiCompanion.vibe || 'bestie';
    const memories = (user.aiCompanion.memories || []).slice(-8).map((m) => m.text).join('\n');
    const history = (user.aiCompanion.chatHistory || []).slice(-12)
      .map((h) => `${h.role === 'user' ? user.username : user.aiCompanion.nickname || 'Kane'}: ${h.content}`)
      .join('\n');

    const bond = user.aiCompanion.bondLevel || 1;
    const prompt = `${VIBE_PROMPTS[vibe] || VIBE_PROMPTS.bestie}

You are ${user.aiCompanion.nickname || 'Kane'}, a personalized AI companion in ChatFlow messenger.
User's name: ${user.username}. Bond level: ${bond}/10 (higher = more inside jokes and familiarity).

Long-term memories about the user:
${memories || 'No memories yet — learn about them naturally.'}

Recent conversation:
${history || 'Starting fresh.'}

${context ? `Context: ${context}` : ''}

User says: "${message}"

Reply in 2-4 sentences like a real friend texting. Be specific, caring, and modern. If they share something personal, remember it briefly for next time. No markdown.`;

    let reply = "I'm here for you — tell me what's on your mind.";
    if (ai) {
      const result = await ai.generateContent(prompt);
      reply = result.response.text().trim();
    }

    user.aiCompanion.chatHistory = [
      ...(user.aiCompanion.chatHistory || []),
      { role: 'user', content: message },
      { role: 'assistant', content: reply }
    ].slice(-40);

    user.aiCompanion.lastChatAt = new Date();
    if (user.aiCompanion.chatHistory.length % 6 === 0) {
      user.aiCompanion.bondLevel = Math.min(10, (user.aiCompanion.bondLevel || 1) + 1);
    }

    const memoryTriggers = ['i am', "i'm", 'my name', 'i love', 'i hate', 'birthday', 'work at', 'study'];
    if (memoryTriggers.some((t) => message.toLowerCase().includes(t))) {
      user.aiCompanion.memories = [
        ...(user.aiCompanion.memories || []),
        { text: `${user.username} said: ${message.slice(0, 120)}` }
      ].slice(-20);
    }

    await user.save();

    res.json({
      reply,
      bondLevel: user.aiCompanion.bondLevel,
      vibe: user.aiCompanion.vibe,
      nickname: user.aiCompanion.nickname
    });
  } catch (err) {
    console.error('Companion chat error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/parse-reminder', auth, async (req, res) => {
  try {
    const { transcript, messageSnippet } = req.body;
    const ai = getModel();
    if (!ai) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return res.json({
        note: 'Reminder from Kane',
        remindAt: tomorrow.toISOString(),
        parsed: false
      });
    }

    const prompt = `Parse this voice command for a message reminder. Today is ${new Date().toString()}.
Command: "${transcript}"
Message context: "${messageSnippet || ''}"
Return ONLY JSON: { "note": "short reminder text", "remindAt": "ISO datetime in UTC", "confidence": 0-1 }
Examples: "remind me tomorrow" -> tomorrow 9am local; "in 2 hours" -> now+2h`;

    const result = await ai.generateContent(prompt);
    let text = result.response.text().trim().replace(/```json|```/g, '');
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    res.json(json);
  } catch (err) {
    const { transcript: t = '' } = req.body;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    res.json({
      note: t.slice(0, 80) || 'Reminder',
      remindAt: tomorrow.toISOString(),
      parsed: false
    });
  }
});

export default router;
