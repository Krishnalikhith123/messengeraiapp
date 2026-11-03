import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiX } from 'react-icons/fi';
import { normalizeChatsList } from '../store/chatStore';
import '../styles/MessagingFeatures.css';

function ForwardMessageModal({ message, chats, currentChatId, onClose, onForwarded }) {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  const available = normalizeChatsList(chats).filter((c) => c._id !== currentChatId);

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleForward = async () => {
    if (!selected.length) {
      toast.error('Select at least one chat');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/messaging/${message._id}/forward`,
        { targetChatIds: selected },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Forwarded to ${selected.length} chat(s)`);
      onForwarded?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Forward failed');
    } finally {
      setLoading(false);
    }
  };

  const getChatLabel = (c) => {
    if (c.isGroupChat) return c.groupName || 'Group';
    const other = c.participants?.find((p) => p._id !== message.senderId?._id);
    return other?.username || 'Chat';
  };

  return (
    <div className="messaging-modal-overlay" onClick={onClose}>
      <div className="messaging-modal" onClick={(e) => e.stopPropagation()}>
        <div className="messaging-modal-header">
          <h4>↪️ Forward Message</h4>
          <button type="button" onClick={onClose}><FiX size={20} /></button>
        </div>
        <div className="forward-chat-list">
          {available.length === 0 ? (
            <p className="muted-text">No other chats available</p>
          ) : (
            available.map((c) => (
              <label key={c._id} className={`forward-chat-item ${selected.includes(c._id) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(c._id)}
                  onChange={() => toggle(c._id)}
                />
                <span>{getChatLabel(c)}</span>
              </label>
            ))
          )}
        </div>
        <div className="messaging-modal-footer">
          <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="confirm-btn" onClick={handleForward} disabled={loading || !selected.length}>
            {loading ? 'Forwarding...' : `Forward (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ForwardMessageModal;
