// File: server/routes/snaps.js
import express from 'express';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { updateSnapScoresOnSend } from './messages.js';

const router = express.Router();

/**
 * POST /api/snaps/send
 * Body: {
 *   recipients: [userId1, userId2, ...] // can be a single-element array for one recipient
 *   mediaUrl: String,
 *   duration: Number,
 *   content: String (optional caption)
 * }
 *
 * Creates (or re‑uses) a private chat with each recipient, stores a snap message,
 * and updates snap scores.
 */
router.post('/send', auth, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { recipients, mediaUrl, duration, content = '' } = req.body;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ message: 'Recipients array is required.' });
    }
    const createdMessages = [];
    for (const recipientId of recipients) {
      // Find existing private chat or create a new one
      let chat = await Chat.findOne({
        participants: { $all: [senderId, recipientId] },
        isGroupChat: false
      });
      if (!chat) {
        chat = new Chat({
          participants: [senderId, recipientId],
          isGroupChat: false,
          unreadCount: new Map()
        });
        await chat.save();
      }
      const message = new Message({
        chatId: chat._id,
        senderId,
        recipientId,
        content,
        mediaUrl,
        duration,
        messageType: 'snap',
        isSnap: true,
        isRead: false
      });
      await message.save();
      // Update chat last message and unread count for the recipient
      await Chat.findByIdAndUpdate(chat._id, {
        lastMessage: message._id,
        lastMessageTime: new Date(),
        $inc: { [`unreadCount.${recipientId}`]: 1 }
      });
      // Increment snap scores for the sender
      await updateSnapScoresOnSend(senderId, chat._id);
      createdMessages.push(message);
    }
    res.status(201).json({ messages: createdMessages });
  } catch (error) {
    console.error('Error sending snap:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/snaps/score/:userId
 * Returns the user's global snapScore and per‑chat friendship scores.
 */
router.get('/score/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    // Only allow self‑view (or extend with permission checks as needed)
    if (req.user.id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const user = await User.findById(userId).select('snapScore');
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Gather friendship snap scores from all chats the user participates in
    const chats = await Chat.find({ participants: userId }).select('snapScoreDetails');
    const friendScores = {};
    chats.forEach(chat => {
      if (chat.snapScoreDetails && chat.snapScoreDetails instanceof Map) {
        const details = Object.fromEntries(chat.snapScoreDetails);
        Object.entries(details).forEach(([friendId, data]) => {
          if (friendId !== userId) {
            friendScores[friendId] = data;
          }
        });
      }
    });
    res.json({ snapScore: user.snapScore, friendScores });
  } catch (err) {
    console.error('Error fetching snap score:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
