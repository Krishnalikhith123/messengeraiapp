import express from 'express';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { broadcastToChatParticipants } from '../utils/messageBroadcast.js';
import { emitToUser, getOnlineUsers } from '../socket.js';
import { fetchLinkPreview } from '../utils/linkPreview.js';

const router = express.Router();
const MAX_PINS = 3;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

async function assertChatMember(chatId, userId) {
  const id = chatId?._id || chatId;
  const chat = await Chat.findById(id);
  const uid = userId?.toString();
  if (!chat || !chat.participants.some((p) => p.toString() === uid)) {
    return null;
  }
  return chat;
}

async function populateMessage(msg) {
  await msg.populate('senderId', 'username profilePicture');
  if (msg.reactions?.length) {
    await msg.populate('reactions.user', 'username');
  }
  if (msg.starredBy?.length) {
    await msg.populate('starredBy', 'username');
  }
  if (msg.replyTo) {
    await msg.populate({
      path: 'replyTo',
      select: 'content messageType senderId',
      populate: { path: 'senderId', select: 'username' }
    });
  }
  return msg;
}

// Link preview
router.get('/link-preview', auth, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ message: 'URL required' });
    const preview = await fetchLinkPreview(url);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Search messages in chat
router.get('/chat/:chatId/search', auth, async (req, res) => {
  try {
    const chat = await assertChatMember(req.params.chatId, req.user.id);
    if (!chat) return res.status(403).json({ message: 'Not authorized' });

    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const messages = await Message.find({
      chatId: req.params.chatId,
      isDeleted: false,
      deletedFor: { $nin: [req.user.id] },
      $or: [
        { content: { $regex: q, $options: 'i' } },
        { fileName: { $regex: q, $options: 'i' } },
        { pollQuestion: { $regex: q, $options: 'i' } }
      ]
    })
      .populate('senderId', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Starred messages (must be before /:messageId routes)
router.get('/starred/all', auth, async (req, res) => {
  try {
    const messages = await Message.find({
      starredBy: req.user.id,
      isDeleted: false
    })
      .populate('senderId', 'username profilePicture')
      .populate('chatId', 'groupName isGroupChat participants')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Schedule message (must be before /:messageId routes — "schedule" was mistaken for a messageId)
router.post('/schedule', auth, async (req, res) => {
  try {
    const {
      chatId, recipientId, content, messageType, mediaUrl, duration,
      scheduledFor, replyTo, messageEffect, mentions
    } = req.body;

    if (!chatId || !scheduledFor) {
      return res.status(400).json({ message: 'chatId and scheduledFor required' });
    }
    const scheduleDate = new Date(scheduledFor);
    if (scheduleDate <= new Date()) {
      return res.status(400).json({ message: 'Scheduled time must be in the future' });
    }

    const chat = await assertChatMember(chatId, req.user.id);
    if (!chat) return res.status(403).json({ message: 'Not authorized' });

    const message = new Message({
      chatId,
      senderId: req.user.id,
      recipientId,
      content: content || '',
      messageType: messageType || 'text',
      mediaUrl,
      duration,
      replyTo: replyTo || null,
      scheduledFor: scheduleDate,
      isScheduled: true,
      messageEffect: messageEffect || 'none',
      mentions: mentions || [],
      deliveryStatus: 'sent'
    });
    await message.save();
    await populateMessage(message);
    res.status(201).json(message);
  } catch (err) {
    console.error('Schedule message error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Pinned messages
router.get('/chat/:chatId/pinned', auth, async (req, res) => {
  try {
    const chat = await assertChatMember(req.params.chatId, req.user.id);
    if (!chat) return res.status(403).json({ message: 'Not authorized' });

    const pinned = await Message.find({
      _id: { $in: chat.pinnedMessageIds || [] },
      isDeleted: false
    })
      .populate('senderId', 'username profilePicture')
      .sort({ pinnedAt: -1 });

    res.json(pinned);
  } catch (err) {
    console.error('Pin message error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/:messageId/pin', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const chat = await assertChatMember(message.chatId?._id || message.chatId, req.user.id);
    if (!chat) return res.status(403).json({ message: 'Not authorized' });

    const pins = [...(chat.pinnedMessageIds || [])];
    if (!pins.some((id) => id.toString() === message._id.toString())) {
      if (pins.length >= MAX_PINS) {
        const oldestId = pins[0];
        await Message.findByIdAndUpdate(oldestId, { isPinned: false, pinnedAt: null });
        pins.shift();
      }
      pins.push(message._id);
      message.isPinned = true;
      message.pinnedAt = new Date();
      await message.save();
      chat.pinnedMessageIds = pins;
      await chat.save();
    }

    await populateMessage(message);
    await broadcastToChatParticipants(message.chatId, req.user.id, 'message-pinned', message.toObject());
    res.json({ message, pinnedIds: pins });
  } catch (err) {
    console.error('Pin message error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:messageId/pin', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const chat = await Chat.findById(message.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    chat.pinnedMessageIds = (chat.pinnedMessageIds || []).filter(
      (id) => id.toString() !== message._id.toString()
    );
    message.isPinned = false;
    message.pinnedAt = null;
    await Promise.all([chat.save(), message.save()]);

    await broadcastToChatParticipants(message.chatId, req.user.id, 'message-unpinned', { messageId: message._id });
    res.json({ messageId: message._id, pinnedIds: chat.pinnedMessageIds });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Edit message
router.put('/:messageId/edit', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: 'Content required' });

    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.senderId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (message.messageType !== 'text') {
      return res.status(400).json({ message: 'Only text messages can be edited' });
    }
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > EDIT_WINDOW_MS) {
      return res.status(400).json({ message: 'Edit window expired (15 minutes)' });
    }

    message.content = content.trim();
    message.editedAt = new Date();
    await message.save();
    await populateMessage(message);

    await broadcastToChatParticipants(message.chatId, req.user.id, 'message-edited', message.toObject());
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Forward message
router.post('/:messageId/forward', auth, async (req, res) => {
  try {
    const { targetChatIds } = req.body;
    if (!targetChatIds?.length) return res.status(400).json({ message: 'Target chats required' });

    const original = await Message.findById(req.params.messageId);
    if (!original) return res.status(404).json({ message: 'Message not found' });

    const sourceChat = await assertChatMember(original.chatId, req.user.id);
    if (!sourceChat) return res.status(403).json({ message: 'Not authorized' });

    const forwarded = [];
    for (const chatId of targetChatIds) {
      const targetChat = await assertChatMember(chatId, req.user.id);
      if (!targetChat) continue;

      const recipientId = targetChat.isGroupChat
        ? undefined
        : targetChat.participants.find((p) => p.toString() !== req.user.id)?.toString();

      const fwd = new Message({
        chatId,
        senderId: req.user.id,
        recipientId,
        content: original.content || `Forwarded ${original.messageType}`,
        messageType: original.messageType === 'text' ? 'text' : original.messageType,
        mediaUrl: original.mediaUrl,
        duration: original.duration,
        fileName: original.fileName,
        fileSize: original.fileSize,
        latitude: original.latitude,
        longitude: original.longitude,
        locationLabel: original.locationLabel,
        stickerSvg: original.stickerSvg,
        isSticker: original.isSticker,
        forwardFrom: original._id,
        forwardFromChat: original.chatId,
        deliveryStatus: 'sent'
      });
      await fwd.save();
      await populateMessage(fwd);

      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: fwd._id,
        lastMessageTime: new Date(),
        ...(recipientId ? { $inc: { [`unreadCount.${recipientId}`]: 1 } } : {})
      });

      await broadcastToChatParticipants(chatId, req.user.id, 'receive-message', {
        ...fwd.toObject(),
        recipientId
      });
      forwarded.push(fwd);
    }

    res.json({ forwarded, count: forwarded.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Star / unstar
router.post('/:messageId/star', auth, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.messageId,
      { $addToSet: { starredBy: req.user.id } },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: 'Message not found' });
    await populateMessage(message);
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:messageId/star', auth, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.messageId,
      { $pull: { starredBy: req.user.id } },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete for me / for everyone
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const { forEveryone } = req.query;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (forEveryone === 'true') {
      if (message.senderId.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Only sender can delete for everyone' });
      }
      const deleted = await Message.findByIdAndUpdate(
        req.params.messageId,
        {
          isDeleted: true,
          deletedAt: new Date(),
          content: 'This message was deleted'
        },
        { new: true }
      );

      const chat = await Chat.findById(message.chatId);
      if (chat?.pinnedMessageIds) {
        chat.pinnedMessageIds = chat.pinnedMessageIds.filter(
          (id) => id.toString() !== message._id.toString()
        );
        await chat.save();
      }

      await broadcastToChatParticipants(message.chatId, req.user.id, 'message-deleted', {
        messageId: message._id,
        forEveryone: true,
        data: deleted
      });
      return res.json({ message: 'Deleted for everyone', data: deleted });
    }

    await Message.findByIdAndUpdate(req.params.messageId, {
      $addToSet: { deletedFor: req.user.id }
    });

    res.json({ message: 'Deleted for you', messageId: message._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Chat wallpaper
router.put('/chat/:chatId/wallpaper', auth, async (req, res) => {
  try {
    const { wallpaperUrl } = req.body;
    const chat = await assertChatMember(req.params.chatId, req.user.id);
    if (!chat) return res.status(403).json({ message: 'Not authorized' });

    chat.wallpaperUrl = wallpaperUrl || '';
    await chat.save();
    await broadcastToChatParticipants(req.params.chatId, req.user.id, 'chat-wallpaper-updated', {
      chatId: chat._id,
      wallpaperUrl: chat.wallpaperUrl
    });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark delivered (called when recipient receives message)
router.put('/:messageId/delivered', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.deliveryStatus === 'read') return res.json(message);

    message.deliveryStatus = 'delivered';
    await message.save();

    emitToUser(message.senderId.toString(), 'message-delivery-update', {
      messageId: message._id,
      deliveryStatus: 'delivered'
    });
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export async function processScheduledMessages() {
  const due = await Message.find({
    isScheduled: true,
    scheduledFor: { $lte: new Date() }
  });

  for (const msg of due) {
    msg.isScheduled = false;
    msg.wasScheduled = true;
    msg.scheduledFor = undefined;
    await msg.save();
    await msg.populate('senderId', 'username profilePicture');

    const chat = await Chat.findById(msg.chatId);
    if (!chat) continue;

    const recipientId = chat.isGroupChat
      ? undefined
      : chat.participants.find((p) => p.toString() !== msg.senderId.toString())?.toString();

    await Chat.findByIdAndUpdate(msg.chatId, {
      lastMessage: msg._id,
      lastMessageTime: new Date(),
      ...(recipientId ? { $inc: { [`unreadCount.${recipientId}`]: 1 } } : {})
    });

    const onlineUsers = getOnlineUsers?.() || new Map();
    chat.participants.forEach((pId) => {
      const id = pId.toString();
      const payload = { ...msg.toObject(), recipientId: id };
      emitToUser(id, 'receive-message', payload);
      if (id !== msg.senderId.toString() && onlineUsers.has(id)) {
        msg.deliveryStatus = 'delivered';
      }
    });
    await msg.save();

    if (msg.senderId) {
      emitToUser(msg.senderId.toString(), 'scheduled-message-sent', msg.toObject());
    }
  }
}

export default router;
