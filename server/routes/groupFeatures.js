import express from 'express';
import { auth } from '../middleware/auth.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import {
  getMemberRole,
  canSendMessages,
  canModerate,
  pushAudit,
  generateInviteCode,
  postWelcomeMessage
} from '../utils/groupPermissions.js';
import { broadcastToChatParticipants } from '../utils/messageBroadcast.js';
import { emitToUser } from '../socket.js';

const router = express.Router();

const FEATURES = {
  101: 'Group roles (moderator, member, read-only)',
  102: 'Join via expiring invite link',
  103: 'Public group discovery by topic',
  104: 'Anonymous poll voting',
  105: 'Group rules & welcome bot',
  106: 'Slow mode rate limit',
  107: 'Admin audit log'
};

router.get('/catalog', auth, (req, res) => {
  res.json(FEATURES);
});

async function loadGroup(chatId, userId) {
  const chat = await Chat.findById(chatId).populate('participants', 'username profilePicture');
  if (!chat?.isGroupChat) return { error: 'Not a group chat', status: 400 };
  if (!chat.participants.some((p) => p._id.toString() === userId)) {
    return { error: 'Not a member', status: 403 };
  }
  return { chat };
}

// #101 Roles
router.get('/:chatId/roles', auth, async (req, res) => {
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });

  const roles = chat.participants.map((p) => ({
    user: p,
    role: getMemberRole(chat, p._id),
    isAdmin: chat.admin?.toString() === p._id.toString()
  }));
  res.json({ roles, myRole: getMemberRole(chat, req.user.id) });
});

router.put('/:chatId/roles', auth, async (req, res) => {
  const { userId, role } = req.body;
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });
  if (!canModerate(chat, req.user.id)) {
    return res.status(403).json({ message: 'Only moderators can change roles (#101)' });
  }
  if (!['moderator', 'member', 'readonly'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  chat.memberRoles = (chat.memberRoles || []).filter((r) => r.user.toString() !== userId);
  chat.memberRoles.push({ user: userId, role });
  pushAudit(chat, {
    action: 'role_changed',
    actorId: req.user.id,
    targetUserId: userId,
    details: `Set role to ${role}`
  });
  await chat.save();
  await broadcastToChatParticipants(chat._id, req.user.id, 'group-settings-updated', { chatId: chat._id });
  res.json({ message: 'Role updated', memberRoles: chat.memberRoles });
});

// #102 Invite links
router.post('/:chatId/invite', auth, async (req, res) => {
  const { expiresInHours = 24, maxUses = 50 } = req.body;
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });
  if (!canModerate(chat, req.user.id)) {
    return res.status(403).json({ message: 'Only moderators can create invites (#102)' });
  }

  const code = generateInviteCode();
  const link = {
    code,
    expiresAt: new Date(Date.now() + expiresInHours * 3600000),
    createdBy: req.user.id,
    maxUses,
    uses: 0
  };
  chat.inviteLinks = [...(chat.inviteLinks || []), link];
  pushAudit(chat, { action: 'invite_created', actorId: req.user.id, details: `Link expires in ${expiresInHours}h` });
  await chat.save();

  res.status(201).json({
    code,
    expiresAt: link.expiresAt,
    joinUrl: `/join/${code}`,
    feature: 102
  });
});

router.get('/invite/:code/preview', async (req, res) => {
  const chat = await Chat.findOne({ 'inviteLinks.code': req.params.code })
    .select('groupName groupImage groupDescription participants topics isPublic');
  if (!chat) return res.status(404).json({ message: 'Invalid or expired invite' });

  const link = chat.inviteLinks.find((l) => l.code === req.params.code);
  if (!link || new Date() > link.expiresAt || link.uses >= link.maxUses) {
    return res.status(410).json({ message: 'Invite link expired or max uses reached' });
  }

  res.json({
    groupName: chat.groupName,
    groupImage: chat.groupImage,
    description: chat.groupDescription,
    memberCount: chat.participants.length,
    topics: chat.topics
  });
});

router.post('/invite/:code/join', auth, async (req, res) => {
  const chat = await Chat.findOne({ 'inviteLinks.code': req.params.code });
  if (!chat) return res.status(404).json({ message: 'Invalid invite' });

  const linkIdx = chat.inviteLinks.findIndex((l) => l.code === req.params.code);
  const link = chat.inviteLinks[linkIdx];
  if (!link || new Date() > link.expiresAt || link.uses >= link.maxUses) {
    return res.status(410).json({ message: 'Invite expired (#102)' });
  }

  if (chat.participants.some((p) => p.toString() === req.user.id)) {
    return res.json({ message: 'Already a member', chatId: chat._id });
  }

  chat.participants.push(req.user.id);
  chat.memberRoles = chat.memberRoles || [];
  chat.memberRoles.push({ user: req.user.id, role: 'member' });
  chat.inviteLinks[linkIdx].uses += 1;

  pushAudit(chat, {
    action: 'member_joined',
    actorId: req.user.id,
    details: `Joined via invite ${req.params.code}`
  });

  if (chat.welcomeBotEnabled) {
    const bot = await User.findOne({ username: 'Kane', isBot: true });
    await postWelcomeMessage(chat, bot?._id || chat.admin);
  }

  await chat.save();
  await chat.populate('participants', 'username profilePicture');

  chat.participants.forEach((p) => {
    emitToUser(p._id.toString(), 'group-member-joined', { chatId: chat._id, userId: req.user.id });
  });

  res.json({ message: 'Joined group', chat, feature: 102 });
});

// #103 Discovery
router.get('/discover', auth, async (req, res) => {
  const topic = (req.query.topic || '').trim().toLowerCase();
  const query = { isGroupChat: true, isPublic: true };
  if (topic) query.topics = { $regex: topic, $options: 'i' };

  const groups = await Chat.find(query)
    .select('groupName groupImage groupDescription topics participants admin')
    .populate('admin', 'username profilePicture')
    .limit(30);

  res.json(groups.map((g) => ({
    _id: g._id,
    groupName: g.groupName,
    groupImage: g.groupImage,
    groupDescription: g.groupDescription,
    topics: g.topics || [],
    memberCount: g.participants.length,
    admin: g.admin,
    feature: 103
  })));
});

router.post('/discover/:chatId/join', auth, async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat?.isPublic) return res.status(403).json({ message: 'Group is not public' });
  if (chat.participants.some((p) => p.toString() === req.user.id)) {
    return res.json({ message: 'Already joined', chatId: chat._id });
  }

  chat.participants.push(req.user.id);
  chat.memberRoles = chat.memberRoles || [];
  chat.memberRoles.push({ user: req.user.id, role: 'member' });
  pushAudit(chat, { action: 'member_joined', actorId: req.user.id, details: 'Joined from discovery' });

  if (chat.welcomeBotEnabled) {
    const bot = await User.findOne({ username: 'Kane', isBot: true });
    await postWelcomeMessage(chat, bot?._id || chat.admin);
  }

  await chat.save();
  res.json({ chatId: chat._id, message: 'Joined public group' });
});

// #105 Settings (rules, welcome bot, slow mode, public)
router.get('/:chatId/settings', auth, async (req, res) => {
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });

  res.json({
    groupRules: chat.groupRules,
    welcomeBotEnabled: chat.welcomeBotEnabled,
    slowModeSeconds: chat.slowModeSeconds,
    isPublic: chat.isPublic,
    topics: chat.topics || [],
    inviteLinks: (chat.inviteLinks || []).filter((l) => new Date() < l.expiresAt),
    myRole: getMemberRole(chat, req.user.id)
  });
});

router.put('/:chatId/settings', auth, async (req, res) => {
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });
  if (!canModerate(chat, req.user.id)) {
    return res.status(403).json({ message: 'Moderators only' });
  }

  const prev = { rules: chat.groupRules, slow: chat.slowModeSeconds, public: chat.isPublic };
  if (req.body.groupRules !== undefined) chat.groupRules = req.body.groupRules;
  if (req.body.welcomeBotEnabled !== undefined) chat.welcomeBotEnabled = !!req.body.welcomeBotEnabled;
  if (req.body.slowModeSeconds !== undefined) chat.slowModeSeconds = Math.max(0, Number(req.body.slowModeSeconds));
  if (req.body.isPublic !== undefined) chat.isPublic = !!req.body.isPublic;
  if (req.body.topics !== undefined) chat.topics = req.body.topics;

  pushAudit(chat, {
    action: 'settings_updated',
    actorId: req.user.id,
    details: `Rules/slow/public updated (was slow ${prev.slow}s)`
  });
  await chat.save();
  await broadcastToChatParticipants(chat._id, req.user.id, 'group-settings-updated', { chatId: chat._id });
  res.json(chat);
});

router.post('/:chatId/welcome', auth, async (req, res) => {
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });
  if (!canModerate(chat, req.user.id)) return res.status(403).json({ message: 'Moderators only' });

  const bot = await User.findOne({ username: 'Kane', isBot: true });
  const msg = await postWelcomeMessage(chat, bot?._id || req.user.id);
  await broadcastToChatParticipants(chat._id, req.user.id, 'receive-message', msg.toObject());
  res.json({ message: 'Welcome posted', msg });
});

// #107 Audit log
router.get('/:chatId/audit', auth, async (req, res) => {
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });
  if (!canModerate(chat, req.user.id)) {
    return res.status(403).json({ message: 'Audit log is for moderators (#107)' });
  }

  const logs = await Chat.findById(chat._id)
    .populate('auditLog.actorId', 'username')
    .populate('auditLog.targetUserId', 'username')
    .select('auditLog');

  res.json(logs?.auditLog || []);
});

// #106 Slow mode check (called before send)
router.get('/:chatId/slow-mode', auth, async (req, res) => {
  const { chat, error, status } = await loadGroup(req.params.chatId, req.user.id);
  if (error) return res.status(status).json({ message: error });

  const role = getMemberRole(chat, req.user.id);
  if (!canSendMessages(role)) {
    return res.json({ canSend: false, reason: 'Read-only members cannot send messages (#101)' });
  }

  const seconds = chat.slowModeSeconds || 0;
  if (seconds <= 0 || canModerate(chat, req.user.id)) {
    return res.json({ canSend: true, slowModeSeconds: seconds });
  }

  const last = chat.slowModeLastSent?.get?.(req.user.id) || chat.slowModeLastSent?.[req.user.id];
  if (!last) return res.json({ canSend: true, slowModeSeconds: seconds });

  const elapsed = (Date.now() - new Date(last).getTime()) / 1000;
  if (elapsed < seconds) {
    return res.json({
      canSend: false,
      waitSeconds: Math.ceil(seconds - elapsed),
      slowModeSeconds: seconds,
      feature: 106
    });
  }
  res.json({ canSend: true, slowModeSeconds: seconds });
});

export default router;
