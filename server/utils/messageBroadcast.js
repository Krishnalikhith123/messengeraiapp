import Chat from '../models/Chat.js';
import { emitToUser } from '../socket.js';

export async function broadcastToChatParticipants(chatId, senderId, event, payload, excludeSender = false) {
  const chat = await Chat.findById(chatId);
  if (!chat) return;
  chat.participants.forEach((pId) => {
    const id = pId.toString();
    if (excludeSender && id === senderId?.toString()) return;
    emitToUser(id, event, payload);
  });
}

export async function getChatParticipantIds(chatId) {
  const chat = await Chat.findById(chatId);
  return chat ? chat.participants.map((p) => p.toString()) : [];
}
