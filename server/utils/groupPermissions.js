import crypto from 'crypto';

export function getMemberRole(chat, userId) {
  const uid = userId?.toString();
  if (chat.admin?.toString() === uid) return 'moderator';
  const entry = chat.memberRoles?.find((r) => r.user?.toString() === uid);
  return entry?.role || 'member';
}

export function canSendMessages(role) {
  return role !== 'readonly';
}

export function canModerate(chat, userId) {
  const role = getMemberRole(chat, userId);
  return role === 'moderator' || chat.admin?.toString() === userId?.toString();
}

export function pushAudit(chat, { action, actorId, targetUserId, details }) {
  if (!chat.auditLog) chat.auditLog = [];
  chat.auditLog.unshift({
    action,
    actorId,
    targetUserId,
    details: details || '',
    createdAt: new Date()
  });
  chat.auditLog = chat.auditLog.slice(0, 100);
}

export function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex');
}

export async function postWelcomeMessage(chat, botUserId) {
  const Message = (await import('../models/Message.js')).default;
  const rules = chat.groupRules || 'Be kind and stay on topic.';
  const msg = new Message({
    chatId: chat._id,
    senderId: botUserId || chat.admin,
    content: `👋 Welcome to **${chat.groupName}**!\n\n📜 **Group rules:**\n${rules}\n\n— Welcome bot (#105)`,
    messageType: 'text'
  });
  await msg.save();
  await msg.populate('senderId', 'username profilePicture');
  chat.lastMessage = msg._id;
  chat.lastMessageTime = new Date();
  await chat.save();
  return msg;
}
