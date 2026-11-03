import express from 'express';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { auth } from '../middleware/auth.js';
import { broadcastToChatParticipants } from '../utils/messageBroadcast.js';

const router = express.Router();

const STICKER_CATALOG = [
  { id: 's1', label: 'Fire', emoji: '🔥', category: 'Vibes' },
  { id: 's2', label: 'Love', emoji: '❤️', category: 'Vibes' },
  { id: 's3', label: 'LOL', emoji: '😂', category: 'Vibes' },
  { id: 's4', label: 'Cool', emoji: '😎', category: 'Vibes' },
  { id: 's5', label: 'Party', emoji: '🎉', category: 'Fun' },
  { id: 's6', label: 'GG', emoji: '🏆', category: 'Games' },
  { id: 's7', label: 'Think', emoji: '🤔', category: 'Chat' },
  { id: 's8', label: '100', emoji: '💯', category: 'Chat' },
  { id: 's9', label: 'Music', emoji: '🎵', category: 'Fun' },
  { id: 's10', label: 'Snap', emoji: '📸', category: 'Fun' },
  { id: 's11', label: 'Ghost', emoji: '👻', category: 'Fun' },
  { id: 's12', label: 'Rocket', emoji: '🚀', category: 'Fun' }
];

const THEME_PRESETS = [
  { id: 'midnight', name: 'Midnight', bubbleSent: '#667eea', bubbleReceived: '#1e293b', font: 'Outfit' },
  { id: 'sunset', name: 'Sunset', bubbleSent: '#f97316', bubbleReceived: '#431407', font: 'Outfit' },
  { id: 'forest', name: 'Forest', bubbleSent: '#22c55e', bubbleReceived: '#14532d', font: 'Outfit' },
  { id: 'rose', name: 'Rose Gold', bubbleSent: '#ec4899', bubbleReceived: '#500724', font: 'Georgia' },
  { id: 'ocean', name: 'Ocean', bubbleSent: '#06b6d4', bubbleReceived: '#0c4a6e', font: 'Outfit' },
  { id: 'neon', name: 'Neon', bubbleSent: '#a855f7', bubbleReceived: '#18181b', font: 'Verdana' }
];

// #32 Mood status
router.get('/mood', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('moodStatus username');
  res.json(user?.moodStatus || {});
});

router.put('/mood', auth, async (req, res) => {
  const { emoji, text, hours } = req.body;
  const expiresAt = hours ? new Date(Date.now() + hours * 3600000) : null;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { moodStatus: { emoji: emoji || '😊', text: text || '', expiresAt } },
    { new: true }
  );
  res.json(user.moodStatus);
});

router.get('/mood/:userId', auth, async (req, res) => {
  const user = await User.findById(req.params.userId).select('moodStatus username status');
  if (!user) return res.status(404).json({ message: 'Not found' });
  if (user.moodStatus?.expiresAt && new Date() > user.moodStatus.expiresAt) {
    return res.json({ emoji: '😊', text: 'Available', expired: true });
  }
  res.json(user.moodStatus);
});

// #38 Chat themes
router.get('/themes', auth, (req, res) => {
  res.json(THEME_PRESETS);
});

router.put('/themes/me', auth, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { chatTheme: req.body },
    { new: true }
  );
  res.json(user.chatTheme);
});

router.put('/themes/chat/:chatId', auth, async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat?.participants.some((p) => p.toString() === req.user.id)) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  chat.chatTheme = req.body;
  await chat.save();
  await broadcastToChatParticipants(chat._id, req.user.id, 'chat-theme-updated', {
    chatId: chat._id,
    chatTheme: chat.chatTheme
  });
  res.json(chat.chatTheme);
});

// #36 Watch party
router.post('/watch-party/:chatId/start', auth, async (req, res) => {
  const { videoUrl, title } = req.body;
  const chat = await Chat.findById(req.params.chatId);
  if (!chat?.participants.some((p) => p.toString() === req.user.id)) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  chat.watchParty = {
    active: true,
    hostId: req.user.id,
    videoUrl: videoUrl || '',
    title: title || 'Watch Party',
    currentTime: 0,
    isPlaying: false
  };
  await chat.save();
  await broadcastToChatParticipants(chat._id, req.user.id, 'watch-party-started', chat.watchParty);
  res.json(chat.watchParty);
});

router.put('/watch-party/:chatId/sync', auth, async (req, res) => {
  const { currentTime, isPlaying } = req.body;
  const chat = await Chat.findById(req.params.chatId);
  if (!chat) return res.status(404).json({ message: 'Chat not found' });
  if (chat.watchParty?.hostId?.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Only host can sync' });
  }
  chat.watchParty.currentTime = currentTime ?? chat.watchParty.currentTime;
  chat.watchParty.isPlaying = isPlaying ?? chat.watchParty.isPlaying;
  await chat.save();
  await broadcastToChatParticipants(chat._id, req.user.id, 'watch-party-sync', {
    chatId: chat._id,
    currentTime: chat.watchParty.currentTime,
    isPlaying: chat.watchParty.isPlaying
  });
  res.json(chat.watchParty);
});

router.delete('/watch-party/:chatId', auth, async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat) return res.status(404).json({ message: 'Not found' });
  chat.watchParty = { active: false, videoUrl: '', title: '', currentTime: 0, isPlaying: false };
  await chat.save();
  await broadcastToChatParticipants(chat._id, req.user.id, 'watch-party-ended', { chatId: chat._id });
  res.json({ message: 'Watch party ended' });
});

// #35 Voice lounge toggle
router.put('/voice-lounge/:chatId', auth, async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat?.isGroupChat) return res.status(400).json({ message: 'Voice lounge is for group chats' });
  if (!chat.participants.some((p) => p.toString() === req.user.id)) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  chat.voiceLoungeActive = !!req.body.active;
  await chat.save();
  await broadcastToChatParticipants(chat._id, req.user.id, 'voice-lounge-changed', {
    chatId: chat._id,
    active: chat.voiceLoungeActive
  });
  res.json({ voiceLoungeActive: chat.voiceLoungeActive });
});

// #39 Reaction insights
router.get('/reactions/:chatId', auth, async (req, res) => {
  const messages = await Message.find({
    chatId: req.params.chatId,
    'reactions.0': { $exists: true },
    isDeleted: false
  }).select('reactions senderId').populate('reactions.user', 'username').limit(200);

  const emojiCounts = {};
  const userCounts = {};
  messages.forEach((m) => {
    m.reactions?.forEach((r) => {
      emojiCounts[r.emoji] = (emojiCounts[r.emoji] || 0) + 1;
      const uid = r.user?._id?.toString() || r.user?.toString();
      if (uid) userCounts[uid] = (userCounts[uid] || 0) + 1;
    });
  });

  const topEmojis = Object.entries(emojiCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topReactors = Object.entries(userCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  res.json({ topEmojis, topReactors, totalReactions: Object.values(emojiCounts).reduce((a, b) => a + b, 0) });
});

// #42 Friend suggestions
router.get('/friend-suggestions', auth, async (req, res) => {
  const me = await User.findById(req.user.id).populate('contacts', 'username profilePicture bio');
  const contactIds = new Set([
    req.user.id,
    ...(me.contacts || []).map((c) => c._id.toString())
  ]);

  const suggestions = await User.find({
    _id: { $nin: [...contactIds] },
    isBot: { $ne: true }
  })
    .select('username profilePicture bio snapScore')
    .limit(12);

  const scored = suggestions.map((u) => {
    let score = u.snapScore || 0;
    const mutual = (me.contacts || []).filter((c) =>
      c.bio && u.bio && c.bio.split(' ').some((w) => u.bio.toLowerCase().includes(w.toLowerCase()))
    ).length;
    score += mutual * 10;
    return { user: u, score, reason: mutual ? 'Similar interests' : 'Active on ChatFlow' };
  }).sort((a, b) => b.score - a.score);

  res.json(scored.slice(0, 8));
});

// #76 Smart inbox folders
router.get('/inbox', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('inboxPrefs');
  const chats = await Chat.find({ participants: req.user.id })
    .populate('participants', 'username profilePicture status moodStatus')
    .populate('lastMessage')
    .sort({ lastMessageTime: -1 });

  const prefs = user.inboxPrefs || { pinnedChatIds: [], archivedChatIds: [], mutedChatIds: [] };
  const pinSet = new Set((prefs.pinnedChatIds || []).map((id) => id.toString()));
  const archSet = new Set((prefs.archivedChatIds || []).map((id) => id.toString()));

  const enriched = chats.map((c) => ({
    ...c.toObject(),
    folder: archSet.has(c._id.toString()) ? 'archived' : pinSet.has(c._id.toString()) ? 'pinned' : 'inbox',
    unread: c.unreadCount?.get?.(req.user.id) || c.unreadCount?.[req.user.id] || 0
  }));

  res.json({
    prefs,
    chats: enriched,
    folders: {
      all: enriched.filter((c) => c.folder !== 'archived'),
      unread: enriched.filter((c) => c.unread > 0 && c.folder !== 'archived'),
      groups: enriched.filter((c) => c.isGroupChat && c.folder !== 'archived'),
      pinned: enriched.filter((c) => c.folder === 'pinned'),
      archived: enriched.filter((c) => c.folder === 'archived')
    }
  });
});

router.put('/inbox/chat/:chatId', auth, async (req, res) => {
  const { action } = req.body;
  const user = await User.findById(req.user.id);
  if (!user.inboxPrefs) user.inboxPrefs = { pinnedChatIds: [], archivedChatIds: [], mutedChatIds: [] };

  const id = req.params.chatId;
  const pullAll = () => {
    user.inboxPrefs.pinnedChatIds = user.inboxPrefs.pinnedChatIds.filter((x) => x.toString() !== id);
    user.inboxPrefs.archivedChatIds = user.inboxPrefs.archivedChatIds.filter((x) => x.toString() !== id);
    user.inboxPrefs.mutedChatIds = user.inboxPrefs.mutedChatIds.filter((x) => x.toString() !== id);
  };

  pullAll();
  if (action === 'pin') user.inboxPrefs.pinnedChatIds.push(id);
  else if (action === 'archive') user.inboxPrefs.archivedChatIds.push(id);
  else if (action === 'mute') user.inboxPrefs.mutedChatIds.push(id);

  await user.save();
  res.json(user.inboxPrefs);
});

// #88 Sticker studio
router.get('/stickers', auth, (req, res) => {
  res.json(STICKER_CATALOG);
});

router.post('/stickers/favorite', auth, async (req, res) => {
  const sticker = req.body;
  const user = await User.findById(req.user.id);
  const exists = user.stickerFavorites?.some((s) => s.id === sticker.id);
  if (!exists) {
    user.stickerFavorites = [sticker, ...(user.stickerFavorites || [])].slice(0, 24);
    await user.save();
  }
  res.json(user.stickerFavorites);
});

export default router;
