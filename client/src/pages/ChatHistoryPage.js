import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore, normalizeChatsList } from '../store/chatStore';
import { FiArrowLeft, FiSearch, FiTrash2 } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import axios from 'axios';
import '../styles/ChatHistoryPage.css';

function ChatHistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chats, fetchChats } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const filteredChats = normalizeChatsList(chats).filter((chat) => {
    const participant = chat.participants.find(p => p._id !== user.id);
    const name = participant?.username || chat.groupName || 'Unknown';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const sortedChats = [...filteredChats].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    } else if (sortBy === 'oldest') {
      return new Date(a.lastMessageTime) - new Date(b.lastMessageTime);
    } else if (sortBy === 'name') {
      const nameA = a.participants.find(p => p._id !== user.id)?.username || a.groupName || 'Unknown';
      const nameB = b.participants.find(p => p._id !== user.id)?.username || b.groupName || 'Unknown';
      return nameA.localeCompare(nameB);
    }
    return 0;
  });

  const handleClearChat = async (chatId) => {
    if (window.confirm('Are you sure you want to clear this chat? Messages will be deleted.')) {
      try {
        setIsLoading(true);
        await axios.delete(`/api/chats/${chatId}/messages`);
        toast.success('Messages cleared successfully');
        await fetchChats();
      } catch (error) {
        toast.error('Failed to clear chat');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (window.confirm('Delete this chat permanently? This cannot be undone.')) {
      try {
        setIsLoading(true);
        await axios.delete(`/api/chats/${chatId}`);
        toast.success('Chat deleted successfully');
        await fetchChats();
      } catch (error) {
        toast.error('Failed to delete chat');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="chat-history-page">
      <div className="history-header">
        <button className="history-back-btn" onClick={() => navigate('/chats')}>
          <FiArrowLeft size={24} /> Back
        </button>
        <h1>Chat History</h1>
      </div>

      <div className="history-controls">
        <div className="search-bar-history">
          <FiSearch size={20} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="sort-dropdown">
          <option value="recent">Most Recent</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name (A-Z)</option>
        </select>
      </div>

      <div className="history-list">
        {sortedChats.length === 0 ? (
          <div className="no-history">
            <span className="no-history-icon">📭</span>
            <p>No chat history found</p>
          </div>
        ) : (
          sortedChats.map(chat => {
            const participant = chat.participants.find(p => p._id !== user.id);
            const chatName = participant?.username || chat.groupName || 'Unknown User';
            const chatImage = participant?.profilePicture || '/default-avatar.png';

            return (
              <div key={chat._id} className="history-item">
                <img src={chatImage} alt={chatName} className="history-avatar" />
                <div className="history-info">
                  <h3>{chatName}</h3>
                  <p>{chat.lastMessage?.content || 'No messages'}</p>
                  <span className="history-date">
                    {chat.lastMessageTime ? formatDistanceToNow(new Date(chat.lastMessageTime), { addSuffix: true }) : 'No messages yet'}
                  </span>
                </div>
                <div className="history-actions">
                  <button
                    className="clear-chat-btn"
                    onClick={() => handleClearChat(chat._id)}
                    title="Clear chat"
                    disabled={isLoading}
                  >
                    <FiTrash2 size={18} />
                    Clear
                  </button>
                  <button
                    className="delete-chat-btn"
                    onClick={() => handleDeleteChat(chat._id)}
                    title="Delete chat"
                    disabled={isLoading}
                  >
                    <FiTrash2 size={18} />
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ChatHistoryPage;