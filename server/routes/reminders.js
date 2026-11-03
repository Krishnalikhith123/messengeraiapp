import express from 'express';
import MessageReminder from '../models/MessageReminder.js';
import Message from '../models/Message.js';
import { auth } from '../middleware/auth.js';
import { emitToUser } from '../socket.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const reminders = await MessageReminder.find({
      userId: req.user.id,
      status: 'pending',
      remindAt: { $gte: new Date() }
    }).sort({ remindAt: 1 }).limit(50);
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { messageId, chatId, note, remindAt, createdViaVoice } = req.body;
    if (!remindAt) return res.status(400).json({ message: 'remindAt is required' });

    const remindDate = new Date(remindAt);
    if (remindDate <= new Date()) {
      return res.status(400).json({ message: 'Reminder must be in the future' });
    }

    let snippet = note || '';
    if (messageId) {
      const msg = await Message.findById(messageId);
      if (msg) snippet = msg.content?.slice(0, 200) || snippet;
    }

    const reminder = await MessageReminder.create({
      userId: req.user.id,
      messageId: messageId || null,
      chatId: chatId || null,
      note: note || 'Follow up on this message',
      originalSnippet: snippet,
      remindAt: remindDate,
      createdViaVoice: !!createdViaVoice
    });

    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await MessageReminder.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { status: 'cancelled' }
    );
    res.json({ message: 'Reminder cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export async function processDueReminders() {
  const due = await MessageReminder.find({
    status: 'pending',
    remindAt: { $lte: new Date() }
  }).populate('userId', 'username');

  for (const r of due) {
    r.status = 'sent';
    await r.save();

    const uid = r.userId?._id?.toString() || r.userId?.toString();
    if (uid) {
      emitToUser(uid, 'message-reminder', {
        reminderId: r._id,
        note: r.note,
        snippet: r.originalSnippet,
        chatId: r.chatId,
        messageId: r.messageId,
        remindAt: r.remindAt
      });
      emitToUser(uid, 'kane-voice-alert', {
        text: `Hey! Reminder: ${r.note}. ${r.originalSnippet ? `About: ${r.originalSnippet.slice(0, 80)}` : ''}`
      });
    }
  }
}

export default router;
