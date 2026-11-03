import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore, normalizeChatsList } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import toast from 'react-hot-toast';
import '../styles/ChatPage.css';

function ChatPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chats, currentChat, messages, fetchChats, getOrCreateChat, fetchMessages, setCurrentChat, setMessages } = useChatStore();
  const { socket } = useSocketStore();
  const [selectedChat, setSelectedChat] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadChats = async () => {
      try {
        await fetchChats();
      } catch (error) {
        toast.error('Failed to load chats');
      }
    };
    loadChats();
  }, [fetchChats]);

  useEffect(() => {
    if (chatId) {
      const chat = normalizeChatsList(chats).find((c) => c._id === chatId);
      if (chat) {
        setSelectedChat(chat);
        setCurrentChat(chat);
        fetchMessages(chatId).catch(() => {
          toast.error('Failed to load messages');
        });
      }
    } else {
      setSelectedChat(null);
      setCurrentChat(null);
      setMessages([]);
    }
  }, [chatId, chats, fetchMessages, setCurrentChat, setMessages]);

  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    navigate(`/chat/${chat._id}`);
    try {
      await fetchMessages(chat._id);
    } catch (error) {
      toast.error('Failed to load messages');
    }
  };

  const handleNewChat = async (userId) => {
    setIsLoading(true);
    try {
      const chat = await getOrCreateChat(userId);
      setSelectedChat(chat);
      navigate(`/chat/${chat._id}`);
      await fetchMessages(chat._id);
    } catch (error) {
      toast.error('Failed to create chat');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`chat-page ${selectedChat ? 'chat-active' : ''}`}>
      <ChatList chats={chats} selectedChat={selectedChat} onSelectChat={handleSelectChat} />
      {selectedChat ? (
        <ChatWindow chat={selectedChat} />
      ) : (
        <div className="no-chat-selected">
          <div className="empty-state">
            <span className="empty-icon">💬</span>
            <h2>Welcome to ChatFlow</h2>
            <p>Select a chat to start messaging or create a new one</p>
            <div className="empty-decoration">
              <div className="dot dot-1"></div>
              <div className="dot dot-2"></div>
              <div className="dot dot-3"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatPage;