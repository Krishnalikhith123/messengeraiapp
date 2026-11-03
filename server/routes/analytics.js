import express from 'express';
import { auth } from '../middleware/auth.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import HealthHabitPlan from '../models/HealthHabitPlan.js';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * GET /api/analytics/me
 * Returns personal stats for the authenticated user.
 */
router.get('/me', auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Messages sent per day (last 30 days)
    const messagesPerDay = await Message.aggregate([
      { $match: { senderId: userId, createdAt: { $gte: thirtyDaysAgo }, messageType: { $ne: 'poll' } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 2. Total messages sent
    const totalSent = await Message.countDocuments({ senderId: userId });

    // 3. Total snaps sent
    const totalSnapsSent = await Message.countDocuments({ senderId: userId, isSnap: true });

    // 4. Most messaged friends (top 5)
    const topFriends = await Message.aggregate([
      { $match: { senderId: userId, recipientId: { $exists: true, $ne: null } } },
      { $group: { _id: '$recipientId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $project: { count: 1, username: '$user.username', profilePicture: '$user.profilePicture' } }
    ]);

    // 5. Most active hour of day (by messages sent)
    const activeHours = await Message.aggregate([
      { $match: { senderId: userId } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 6. Total polls created
    const totalPolls = await Message.countDocuments({ senderId: userId, messageType: 'poll' });

    // 7. Snap streaks (collect from chats)
    const chats = await Chat.find({ participants: userId }).select('snapStreakCount participants');
    const maxStreak = chats.reduce((max, c) => Math.max(max, c.snapStreakCount || 0), 0);
    const totalStreakDays = chats.reduce((sum, c) => sum + (c.snapStreakCount || 0), 0);

    res.json({
      messagesPerDay,
      totalSent,
      totalSnapsSent,
      topFriends,
      activeHours,
      totalPolls,
      maxStreak,
      totalStreakDays
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/today', auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [messagesSent, snapsSent, pollsCreated, habitPlans] = await Promise.all([
      Message.countDocuments({ senderId: userId, createdAt: { $gte: start }, messageType: { $ne: 'poll' } }),
      Message.countDocuments({ senderId: userId, createdAt: { $gte: start }, isSnap: true }),
      Message.countDocuments({ senderId: userId, createdAt: { $gte: start }, messageType: 'poll' }),
      HealthHabitPlan.find({ userId: req.user.id }).select('title checkIns currentStreak completedDays')
    ]);

    const todayKey = start.toISOString().slice(0, 10);
    const habitCheckIns = habitPlans
      .map((plan) => {
        const checkIn = plan.checkIns?.find((item) => item.dateKey === todayKey);
        return checkIn ? {
          title: plan.title,
          status: checkIn.status,
          streak: plan.currentStreak
        } : null;
      })
      .filter(Boolean);

    res.json({
      date: todayKey,
      messagesSent,
      snapsSent,
      pollsCreated,
      habitCheckIns,
      summary: `Today you sent ${messagesSent} message${messagesSent === 1 ? '' : 's'}, sent ${snapsSent} snap${snapsSent === 1 ? '' : 's'}, created ${pollsCreated} poll${pollsCreated === 1 ? '' : 's'}, and checked in on ${habitCheckIns.length} health habit${habitCheckIns.length === 1 ? '' : 's'}.`
    });
  } catch (err) {
    console.error('Today analytics error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/relationships', auth, async (req, res) => {
  try {
    const myId = req.user.id;
    const chats = await Chat.find({ participants: myId, isGroupChat: false })
      .populate('participants', 'username profilePicture')
      .sort({ lastMessageTime: -1 })
      .limit(20);

    const summaries = [];
    for (const chat of chats) {
      const friend = chat.participants.find((p) => p._id.toString() !== myId);
      if (!friend) continue;

      const [sent, received, recent] = await Promise.all([
        Message.countDocuments({ chatId: chat._id, senderId: myId, isDeleted: false }),
        Message.countDocuments({ chatId: chat._id, senderId: friend._id, isDeleted: false }),
        Message.find({ chatId: chat._id, isDeleted: false }).sort({ createdAt: -1 }).limit(1)
      ]);

      const total = sent + received;
      const balance = total > 0 ? Math.round((Math.min(sent, received) / Math.max(sent, received)) * 100) : 0;
      summaries.push({
        chatId: chat._id,
        friendId: friend._id,
        friendName: friend.username,
        sent,
        received,
        totalMessages: total,
        snapStreak: chat.snapStreakCount || 0,
        chemistryIndex: Math.min(100, Math.round((balance * 0.55) + Math.min(total, 100) * 0.25 + Math.min(chat.snapStreakCount || 0, 20))),
        lastActiveAt: recent[0]?.createdAt || chat.lastMessageTime
      });
    }

    summaries.sort((a, b) => b.chemistryIndex - a.chemistryIndex);
    res.json({ relationships: summaries });
  } catch (err) {
    console.error('Relationship summaries error:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
