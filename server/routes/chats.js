import express from 'express';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { auth } from '../middleware/auth.js';
import { pushAudit, postWelcomeMessage } from '../utils/groupPermissions.js';
import User from '../models/User.js';

const router = express.Router();

// Helper to check and decay SnapStreaks and Friendship Snap Scores
const checkStreakDecay = (chat) => {
  const obj = chat.toObject ? chat.toObject() : chat;
  if (obj.isGroupChat) return obj;

  let dbUpdate = {};
  let updated = false;

  // 1. Classic SnapStreak (🔥) Decay Check
  if (obj.snapStreakCount > 0 && obj.lastStreakUpdate) {
    const diffHours = (Date.now() - new Date(obj.lastStreakUpdate).getTime()) / (60 * 60 * 1000);
    let newStreak = obj.snapStreakCount;
    let showHourglass = false;
    
    if (diffHours >= 36) {
      newStreak = 0;
      updated = true;
    } else if (diffHours >= 20) {
      showHourglass = true;
    }
    
    obj.snapStreakCount = newStreak;
    obj.showStreakHourglass = showHourglass;
    if (updated) {
      dbUpdate.snapStreakCount = newStreak;
    }
  }

  // 2. Friendship Snap Scores (⚠️ warning, decay, reset) Check
  if (obj.snapScoreDetails) {
    const now = new Date();
    const detailsObj = obj.snapScoreDetails instanceof Map 
      ? Object.fromEntries(obj.snapScoreDetails) 
      : obj.snapScoreDetails;
    let scoresUpdated = false;

    Object.keys(detailsObj).forEach(userIdStr => {
      const details = detailsObj[userIdStr];
      if (!details || !details.lastSnapSent) return;

      const diffHours = (now.getTime() - new Date(details.lastSnapSent).getTime()) / (1000 * 60 * 60);
      let newStatus = 'active';
      let warningActive = false;
      let newScore = details.score || 0;

      if (diffHours > 72) {
        // 3 days: reset to 0
        newScore = 0;
        newStatus = 'reset';
      } else if (diffHours > 48) {
        // 2 days: decrease to some amount
        const decayAmt = 5;
        newScore = Math.max(0, (details.score || 0) - decayAmt);
        newStatus = 'decayed';
      } else if (diffHours > 24) {
        // 1 day: warning
        warningActive = true;
        newStatus = 'warning';
      }

      if (details.status !== newStatus || details.score !== newScore || details.warningActive !== warningActive) {
        details.status = newStatus;
        details.score = newScore;
        details.warningActive = warningActive;
        scoresUpdated = true;
      }
    });

    if (scoresUpdated) {
      dbUpdate.snapScoreDetails = detailsObj;
      updated = true;
    }
    obj.snapScoreDetails = detailsObj;
  }

  if (updated && Object.keys(dbUpdate).length > 0) {
    Chat.findByIdAndUpdate(chat._id, dbUpdate).catch(err => console.error('Error in background decay save:', err));
  }

  return obj;
};

// Get all chats for user
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user.id })
      .populate('participants', 'username profilePicture status snapScore')
      .populate('lastMessage')
      .sort({ lastMessageTime: -1 });

    // Add unread count and check streaks
    const chatsWithUnread = chats.map(chat => {
      const unreadCount = chat.unreadCount?.get(req.user.id) || 0;
      const streakChat = checkStreakDecay(chat);
      return {
        ...streakChat,
        unreadCount
      };
    });

    res.status(200).json(chatsWithUnread);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get or create chat
router.post('/get-or-create', auth, async (req, res) => {
  try {
    const { userId, isSecretChat } = req.body;
    
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, userId] },
      isGroupChat: false,
      isSecretChat: !!isSecretChat
    }).populate('participants', 'username profilePicture status snapScore')
      .populate('lastMessage');

    if (!chat) {
      chat = new Chat({
        participants: [req.user.id, userId],
        isGroupChat: false,
        isSecretChat: !!isSecretChat,
        unreadCount: new Map()
      });
      await chat.save();
      await chat.populate('participants', 'username profilePicture status snapScore');
    }

    const unreadCount = chat.unreadCount?.get(req.user.id) || 0;
    const response = checkStreakDecay(chat);
    response.unreadCount = unreadCount;

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get chat by ID
router.get('/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', 'username profilePicture status snapScore')
      .populate('lastMessage');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const unreadCount = chat.unreadCount?.get(req.user.id) || 0;
    const response = checkStreakDecay(chat);
    response.unreadCount = unreadCount;

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all messages in a chat (clear chat)
router.delete('/:chatId/messages', auth, async (req, res) => {
  try {
    await Message.deleteMany({ chatId: req.params.chatId });
    
    await Chat.findByIdAndUpdate(
      req.params.chatId,
      {
        lastMessage: null,
        lastMessageTime: new Date(),
        $set: { 'unreadCount.$[]': 0 }
      }
    );

    res.status(200).json({ message: 'All messages deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete chat completely
router.delete('/:chatId', auth, async (req, res) => {
  try {
    await Message.deleteMany({ chatId: req.params.chatId });
    await Chat.findByIdAndDelete(req.params.chatId);

    res.status(200).json({ message: 'Chat deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create group chat
router.post('/group', auth, async (req, res) => {
  try {
    const { groupName, participantIds, groupImage, groupDescription } = req.body;

    const chat = new Chat({
      isGroupChat: true,
      groupName,
      groupImage,
      groupDescription,
      participants: [req.user.id, ...participantIds],
      admin: req.user.id,
      unreadCount: new Map()
    });

    await chat.save();
    await chat.populate('participants', 'username profilePicture status');

    res.status(201).json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Leave group chat
router.post('/:chatId/leave', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    if (!chat.isGroupChat) {
      return res.status(400).json({ message: 'Only group chats can be left' });
    }
    
    const isParticipant = chat.participants.some(p => p.toString() === req.user.id);
    if (!isParticipant) {
      return res.status(400).json({ message: 'You are not a participant of this group' });
    }

    // Filter out the current user
    chat.participants = chat.participants.filter(p => p.toString() !== req.user.id);

    // If leaving user is the admin
    if (chat.admin?.toString() === req.user.id) {
      if (chat.participants.length > 0) {
        // Appoint first remaining participant as the new admin
        chat.admin = chat.participants[0];
      } else {
        // No participants left, delete group and all its messages
        await Message.deleteMany({ chatId: req.params.chatId });
        await Chat.findByIdAndDelete(req.params.chatId);
        return res.status(200).json({ message: 'Group deleted since no members remain' });
      }
    }

    await chat.save();
    await chat.populate('participants', 'username profilePicture status');

    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add participants to group chat
router.post('/:chatId/add-participants', auth, async (req, res) => {
  try {
    const { participantIds } = req.body;
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    if (!chat.isGroupChat) {
      return res.status(400).json({ message: 'Only group chats can have members added' });
    }
    if (chat.admin?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the group admin can add members' });
    }

    // Filter out users who are already participants
    const newParticipants = participantIds.filter(
      id => !chat.participants.some(p => p.toString() === id)
    );

    if (newParticipants.length > 0) {
      chat.participants.push(...newParticipants);
      await chat.save();
    }

    await chat.populate('participants', 'username profilePicture status');
    
    if (chat.lastMessage) {
      await chat.populate('lastMessage');
    }

    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove participant from group chat
router.post('/:chatId/remove-participant', auth, async (req, res) => {
  try {
    const { participantId } = req.body;
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    if (!chat.isGroupChat) {
      return res.status(400).json({ message: 'Only group chats can have members removed' });
    }
    if (chat.admin?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the group admin can remove members' });
    }
    if (participantId === req.user.id) {
      return res.status(400).json({ message: 'Admin cannot be removed. Use Leave Group instead.' });
    }

    const isParticipant = chat.participants.some(p => p.toString() === participantId);
    if (!isParticipant) {
      return res.status(400).json({ message: 'User is not a participant of this group' });
    }

    chat.participants = chat.participants.filter(p => p.toString() !== participantId);
    chat.memberRoles = (chat.memberRoles || []).filter((r) => r.user.toString() !== participantId);
    pushAudit(chat, {
      action: 'member_removed',
      actorId: req.user.id,
      targetUserId: participantId,
      details: 'Removed from group'
    });
    await chat.save();

    await chat.populate('participants', 'username profilePicture status');
    
    if (chat.lastMessage) {
      await chat.populate('lastMessage');
    }

    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create dedicated Roommate Billing Split Group
router.post('/split-vault', auth, async (req, res) => {
  try {
    const { groupName, participantIds, fixedSplits, splitDueDate, groupImage, groupDescription } = req.body;

    const chat = new Chat({
      isGroupChat: true,
      isSplitGroup: true,
      groupName,
      groupImage,
      groupDescription,
      participants: [req.user.id, ...participantIds],
      admin: req.user.id,
      fixedSplits: fixedSplits || [],
      splitDueDate: splitDueDate || 5,
      unreadCount: new Map(),
      payments: []
    });

    await chat.save();
    await chat.populate('participants', 'username profilePicture status');

    const itemsList = (fixedSplits || []).map(s => `• ${s.title}: $${s.amount}`).join('\n');
    const shareTotal = (fixedSplits || []).reduce((acc, curr) => acc + curr.amount, 0) / (participantIds.length + 1);
    
    const botUser = await User.findOne({ username: 'Kane' }) || { _id: req.user.id };
    const introMsg = new Message({
      chatId: chat._id,
      senderId: botUser._id,
      content: `🏠 Welcome to your dedicated Split Group & Roommate Billing Vault!\n\nFixed Monthly Splits Set:\n${itemsList || 'None set'}\n\n📅 Monthly Due Date: **Day ${splitDueDate || 5}**\n💵 Each roommate's split: **$${shareTotal.toFixed(2)} / month**.\n\n⚠️ Chatting is disabled. This vault is dedicated exclusively to bill payments and splits. Use the Ledger Dashboard above to settle your dues!`,
      messageType: 'text'
    });

    await introMsg.save();
    chat.lastMessage = introMsg._id;
    chat.lastMessageTime = new Date();
    await chat.save();

    res.status(201).json(chat);
  } catch (error) {
    console.error('Split vault creation error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Settle roommate monthly split bills
router.post('/:chatId/split/settle', auth, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) {
      return res.status(400).json({ message: 'Month is required' });
    }

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const existingIdx = chat.payments.findIndex(
      p => p.user.toString() === req.user.id && p.month === month
    );

    if (existingIdx !== -1) {
      chat.payments[existingIdx].paid = true;
      chat.payments[existingIdx].date = new Date();
    } else {
      chat.payments.push({
        user: req.user.id,
        month,
        paid: true,
        date: new Date()
      });
    }

    await chat.save();
    await chat.populate('participants', 'username profilePicture status');
    
    if (chat.lastMessage) {
      await chat.populate('lastMessage');
    }

    const botUser = await User.findOne({ username: 'Kane' }) || { _id: req.user.id };
    const payer = chat.participants.find(p => p._id.toString() === req.user.id);
    const payMsg = new Message({
      chatId: chat._id,
      senderId: botUser._id,
      content: `✅ transaction: ${payer ? payer.username : 'A roommate'} settled their split share for the month of ${month}!`,
      messageType: 'text'
    });

    await payMsg.save();
    chat.lastMessage = payMsg._id;
    chat.lastMessageTime = new Date();
    await chat.save();

    const { emitToUser } = await import('../socket.js');
    chat.participants.forEach(p => {
      emitToUser(p._id, 'receive-message', { ...payMsg.toObject(), recipientId: p._id });
    });

    res.status(200).json(chat);
  } catch (error) {
    console.error('Settle share error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;