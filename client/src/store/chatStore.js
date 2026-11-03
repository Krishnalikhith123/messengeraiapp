import { create } from 'zustand';
import axios from 'axios';
import { normalizeChatsList, normalizeMessagesList } from '../utils/apiNormalize';

export { normalizeChatsList, normalizeMessagesList } from '../utils/apiNormalize';

export const useChatStore = create((set) => ({
  chats: [],
  currentChat: null,
  messages: [],
  isLoading: false,

  fetchChats: async () => {
    set({ isLoading: true });
    try {
      const response = await axios.get('/api/chats');
      const list = normalizeChatsList(response.data);
      set({ chats: list, isLoading: false });
      return list;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  getOrCreateChat: async (userId, isSecretChat = false) => {
    try {
      const response = await axios.post('/api/chats/get-or-create', { userId, isSecretChat });
      const chat = response.data;
      set((state) => {
        const prev = normalizeChatsList(state.chats);
        return {
          chats: [chat, ...prev.filter((c) => c._id !== chat._id)]
        };
      });
      return chat;
    } catch (error) {
      throw error;
    }
  },

  createGroup: async (groupData) => {
    try {
      const response = await axios.post('/api/chats/group', groupData);
      const chat = response.data;
      set((state) => ({
        chats: [chat, ...normalizeChatsList(state.chats)]
      }));
      return chat;
    } catch (error) {
      throw error;
    }
  },

  fetchMessages: async (chatId) => {
    set({ isLoading: true });
    try {
      const response = await axios.get(`/api/messages/${chatId}`);
      const list = normalizeMessagesList(response.data);
      set({ messages: list, isLoading: false });
      return list;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  setMessages: (messages) => set({ messages: normalizeMessagesList(messages) }),

  addMessage: (message) => {
    if (!message) return;
    set((state) => ({
      messages: [...normalizeMessagesList(state.messages), message]
    }));
  },

  updateMessage: (updatedMsg) => {
    if (!updatedMsg?._id) return;
    set((state) => {
      const prev = normalizeMessagesList(state.messages);
      return {
        messages: prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m))
      };
    });
  },

  setCurrentChat: (chat) => set({ currentChat: chat }),
  
  setChats: (chats) => set({ chats: normalizeChatsList(chats) }),

  removeMessage: (messageId) => {
    set((state) => ({
      messages: normalizeMessagesList(state.messages).filter((m) => m._id !== messageId)
    }));
  },

  updateChats: (updatedChat) => {
    if (!updatedChat?._id) return;
    set((state) => {
      const prev = normalizeChatsList(state.chats);
      return {
        chats: prev.map((c) => (c._id === updatedChat._id ? updatedChat : c))
      };
    });
  },

  deleteChat: async (chatId) => {
    try {
      await axios.delete(`/api/chats/${chatId}`);
      set((state) => ({
        chats: normalizeChatsList(state.chats).filter((c) => c._id !== chatId),
        currentChat: null
      }));
    } catch (error) {
      throw error;
    }
  },

  leaveGroup: async (chatId) => {
    try {
      await axios.post(`/api/chats/${chatId}/leave`);
      set((state) => ({
        chats: normalizeChatsList(state.chats).filter((c) => c._id !== chatId),
        currentChat: null
      }));
    } catch (error) {
      throw error;
    }
  }
}));