import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore, normalizeMessagesList } from '../store/chatStore';
import { formatTime } from '../utils/dateUtils';
import { FiTrash2, FiX, FiCornerUpLeft, FiSmile, FiCopy, FiEdit2, FiShare2, FiStar, FiMapPin, FiClock } from 'react-icons/fi';
import axios from 'axios';
import toast from 'react-hot-toast';
import { decryptMessage } from '../utils/encryption';
import {
  canEditMessage, copyToClipboard, formatDeliveryStatus, highlightMentions, highlightSearchText
} from '../utils/chatMessaging';
import ForwardMessageModal from './ForwardMessageModal';
import '../styles/MessageList.css';
import '../styles/MessagingFeatures.css';

function MessageList({
  messages, currentUserId, otherUser, onReply, onMessageDeleted, vanishTimers, onSendSmartReply,
  searchQuery = '', chats = [], messageRefs, onJumpToMessage, multiSelectMode = false,
  selectedMessageIds = [], onToggleSelect, onEnterMultiSelect, onPinChange
}) {
  const endOfMessagesRef = useRef(null);
  const { user } = useAuthStore();
  const { messages: storeMessages, addMessage, currentChat } = useChatStore();
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [reactionMenuId, setReactionMenuId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [displayMessages, setDisplayMessages] = useState(messages);
  const [summaries, setSummaries] = useState({});  // messageId -> summary text
  const [summarizingId, setSummarizingId] = useState(null);

  const [transcriptions, setTranscriptions] = useState({});
  const [transcribingId, setTranscribingId] = useState(null);
  const [translations, setTranslations] = useState({});
  const [translatingId, setTranslatingId] = useState(null);
  const [activeLangMenuId, setActiveLangMenuId] = useState(null);

  // Ephemeral Direct Snaps
  const [activeSnapMessage, setActiveSnapMessage] = useState(null);
  const [snapCountdown, setSnapCountdown] = useState(8);
  const countdownIntervalRef = useRef(null);

  // Smart Replies State
  const [smartReplies, setSmartReplies] = useState([]);
  const [lastCheckedMsgId, setLastCheckedMsgId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [forwardMessage, setForwardMessage] = useState(null);
  const [voiceSpeeds, setVoiceSpeeds] = useState({});
  const audioRefs = useRef({});

  const lastMessage = displayMessages[displayMessages.length - 1];

  const isStarred = (msg) => msg.starredBy?.some((u) => (u._id || u).toString() === currentUserId.toString());

  const getDisplayText = (msg) => {
    let text = currentChat?.isSecretChat
      ? decryptMessage(msg.content, currentChat._id)
      : msg.content;
    if (searchQuery) text = highlightSearchText(text, searchQuery);
    if (currentChat?.isGroupChat) text = highlightMentions(text, true);
    return text;
  };

  const handleCopy = async (msg) => {
    const text = currentChat?.isSecretChat
      ? decryptMessage(msg.content, currentChat._id)
      : msg.content;
    await copyToClipboard(text || '');
    toast.success('Copied to clipboard');
  };

  const handleEdit = async (messageId) => {
    if (!editText.trim()) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`/api/messaging/${messageId}/edit`, { content: editText }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      useChatStore.getState().updateMessage(res.data);
      setEditingId(null);
      setEditText('');
      toast.success('Message edited');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Edit failed');
    }
  };

  const handleStar = async (msg) => {
    try {
      const token = localStorage.getItem('token');
      const starred = isStarred(msg);
      const res = starred
        ? await axios.delete(`/api/messaging/${msg._id}/star`, { headers: { Authorization: `Bearer ${token}` } })
        : await axios.post(`/api/messaging/${msg._id}/star`, {}, { headers: { Authorization: `Bearer ${token}` } });
      useChatStore.getState().updateMessage(res.data);
      toast.success(starred ? 'Removed from starred' : 'Message starred');
    } catch (err) {
      console.error('Star error:', err);
      toast.error(err.response?.data?.message || 'Failed to update star');
    }
  };

  const handleRemindMessage = async (msg, preset = 'tomorrow') => {
    try {
      const snippet = msg.content?.slice(0, 120) || 'Chat message';
      window.__chatflowPendingReminder = {
        messageId: msg._id,
        chatId: currentChat?._id,
        snippet
      };
      let remindAt = new Date();
      if (preset === 'tomorrow') {
        remindAt.setDate(remindAt.getDate() + 1);
        remindAt.setHours(9, 0, 0, 0);
      } else if (preset === '1h') {
        remindAt.setHours(remindAt.getHours() + 1);
      }
      await axios.post('/api/reminders', {
        messageId: msg._id,
        chatId: currentChat?._id,
        note: `Follow up: ${snippet.slice(0, 60)}`,
        remindAt: remindAt.toISOString()
      });
      toast.success(`Reminder set for ${remindAt.toLocaleString()}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reminder failed');
    }
  };

  const handleVoiceRemind = (msg) => {
    const snippet = msg.content?.slice(0, 120) || '';
    window.__chatflowPendingReminder = {
      messageId: msg._id,
      chatId: currentChat?._id,
      snippet
    };
    toast('Say to Kane: "Remind me about this message tomorrow"', { icon: '🎤', duration: 6000 });
  };

  const handlePin = async (msg) => {
    try {
      const token = localStorage.getItem('token');
      if (msg.isPinned) {
        await axios.delete(`/api/messaging/${msg._id}/pin`, { headers: { Authorization: `Bearer ${token}` } });
        useChatStore.getState().updateMessage({ ...msg, isPinned: false });
        toast.success('Message unpinned');
      } else {
        const res = await axios.post(`/api/messaging/${msg._id}/pin`, {}, { headers: { Authorization: `Bearer ${token}` } });
        const updated = res.data?.message || res.data;
        if (updated?._id) useChatStore.getState().updateMessage(updated);
        toast.success('Message pinned');
      }
      onPinChange?.();
    } catch (err) {
      console.error('Pin error:', err);
      toast.error(err.response?.data?.message || 'Pin failed');
    }
  };

  const handleDelete = async (msg, forEveryone) => {
    try {
      const token = localStorage.getItem('token');
      if (forEveryone) {
        const res = await axios.delete(`/api/messaging/${msg._id}?forEveryone=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.data) useChatStore.getState().updateMessage(res.data.data);
        else removeFromDisplay(msg._id);
      } else {
        await axios.delete(`/api/messaging/${msg._id}`, { headers: { Authorization: `Bearer ${token}` } });
        removeFromDisplay(msg._id);
      }
      toast.success(forEveryone ? 'Deleted for everyone' : 'Deleted for you');
      onMessageDeleted?.(msg._id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const removeFromDisplay = (id) => {
    setDisplayMessages((prev) => prev.filter((m) => m._id !== id));
    useChatStore.getState().removeMessage(id);
  };

  useEffect(() => {
    if (!lastMessage) {
      setSmartReplies([]);
      return;
    }
    const lastSenderId = lastMessage.senderId?._id || lastMessage.senderId;
    if (lastSenderId !== currentUserId && lastMessage.messageType === 'text' && lastMessage._id !== lastCheckedMsgId) {
      setLastCheckedMsgId(lastMessage._id);
      axios.get(`/api/messages/${lastMessage._id}/smart-replies`)
        .then(res => {
          setSmartReplies(res.data.suggestions || []);
        })
        .catch(() => {
          setSmartReplies([]);
        });
    } else if (lastSenderId === currentUserId) {
      setSmartReplies([]);
    }
  }, [lastMessage, currentUserId, lastCheckedMsgId]);

  const handleOpenSnap = (msg) => {
    setActiveSnapMessage(msg);
    setSnapCountdown(8);
    
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setSnapCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownIntervalRef.current);
          handleBurnSnap(msg._id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleBurnSnap = async (msgId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`/api/messages/${msgId}/open-snap`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      useChatStore.getState().updateMessage(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setActiveSnapMessage(null);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }
  };

  const closeAndBurnSnap = () => {
    if (activeSnapMessage) {
      handleBurnSnap(activeSnapMessage._id);
    }
  };

  const handleDownloadSnap = async (url, username) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${username}_snap_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Snap saved successfully!');
    } catch (err) {
      toast.error('Failed to download snap.');
    }
  };

  useEffect(() => {
    const activeMessages = normalizeMessagesList(messages).filter((msg) => !msg.isDeleted);
    setDisplayMessages(activeMessages);
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDeleteMessage = async (messageId) => {
    try {
      const response = await axios.delete(`/api/messages/${messageId}`);
      
      if (response.status === 200) {
        // Remove message from local state
        setDisplayMessages(prevMessages => 
          prevMessages.filter(msg => msg._id !== messageId)
        );
        toast.success('Message deleted successfully');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error.response?.data?.message || 'Failed to delete message');
    }
  };

  const handleImageClick = (imageUrl) => {
    setSelectedImage(imageUrl);
  };

  const handleReact = async (messageId, emoji) => {
    try {
      setReactionMenuId(null);
      const res = await axios.post(`/api/messages/${messageId}/react`, { emoji });
      useChatStore.getState().updateMessage(res.data);
    } catch (error) {
      toast.error('Failed to add reaction');
    }
  };

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const handleSummarizeVoice = async (message) => {
    if (summarizingId) return;
    setSummarizingId(message._id);
    try {
      // We use browser's SpeechRecognition to transcribe is not feasible server-side without Whisper.
      // Instead, we'll call our AI endpoint with metadata and use Gemini to generate a mock summary.
      // In a real app this would use Whisper API.
      const res = await axios.post('/api/messages/ai/summarize', {
        messages: [{ senderName: message.senderId?.username || 'User', content: `[Voice message, ${message.duration}s long]` }]
      });
      setSummaries(prev => ({ ...prev, [message._id]: res.data.summary }));
    } catch (e) {
      toast.error('Could not summarize voice note.');
    } finally {
      setSummarizingId(null);
    }
  };

  const handleTranscribeAudio = async (messageId) => {
    setTranscribingId(messageId);
    try {
      const response = await axios.post(`/api/messages/${messageId}/transcribe`);
      setTranscriptions(prev => ({ ...prev, [messageId]: response.data.transcription }));
      toast.success('Audio transcribed!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to transcribe audio note.');
    } finally {
      setTranscribingId(null);
    }
  };

  const handleTranslateText = async (messageId, targetLang) => {
    setTranslatingId(messageId);
    setActiveLangMenuId(null);
    try {
      const response = await axios.post(`/api/messages/${messageId}/translate`, {
        targetLanguage: targetLang
      });
      setTranslations(prev => ({ ...prev, [messageId]: response.data.translatedText }));
      toast.success(`Translated to ${targetLang}!`);
    } catch (err) {
      console.error(err);
      toast.error('Translation failed.');
    } finally {
      setTranslatingId(null);
    }
  };

  // Helper to group reactions
  const groupReactions = (reactions) => {
    if (!reactions) return [];
    const grouped = {};
    reactions.forEach(r => {
      const e = r.emoji;
      if (!grouped[e]) grouped[e] = { count: 0, hasReacted: false };
      grouped[e].count++;
      if (r.user?._id === currentUserId) grouped[e].hasReacted = true;
    });
    return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
  };

  const renderReadReceipt = (message) => {
    const senderId = message.senderId?._id || message.senderId;
    if (senderId?.toString() !== currentUserId.toString()) return null;

    const status = message.isRead || (message.readBy?.length > 0)
      ? 'read'
      : (message.deliveryStatus || 'sent');
    const { icon, className } = formatDeliveryStatus(status);
    return <span className={`read-receipt ${className}`}>{icon}</span>;
  };

  const renderMetaBadges = (message) => (
    <div className="message-meta-badges">
      {message.editedAt && <span className="msg-badge edited">edited</span>}
      {message.isScheduled && <span className="msg-badge scheduled">scheduled</span>}
      {message.wasScheduled && <span className="msg-badge scheduled">was scheduled</span>}
      {message.forwardFrom && <span className="msg-badge forwarded">forwarded</span>}
      {message.isPinned && <span className="msg-badge pinned">📌 pinned</span>}
    </div>
  );

  const renderLinkPreview = (message) => {
    if (!message.linkPreview?.url) return null;
    const lp = message.linkPreview;
    return (
      <a href={lp.url} target="_blank" rel="noopener noreferrer" className="link-preview-card">
        {lp.image && <img src={lp.image} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
        <div className="link-preview-body">
          <h5>{lp.title}</h5>
          {lp.description && <p>{lp.description}</p>}
        </div>
      </a>
    );
  };

  return (
    <>
      <div className="messages-container">
        {displayMessages.length === 0 ? (
          <div className="no-messages">
            <div className="no-messages-content">
              <span className="no-messages-icon">💬</span>
              <p>No messages yet. Start a conversation!</p>
            </div>
          </div>
        ) : (
          displayMessages.map((message) => {
            const matchesSearch = searchQuery && (
              message.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              message.fileName?.toLowerCase().includes(searchQuery.toLowerCase())
            );
            return (
            <div
              key={message._id}
              ref={(el) => { if (messageRefs) messageRefs.current[message._id] = el; }}
              className={`message ${message.senderId._id === currentUserId ? 'sent' : 'received'} ${message.replyTo ? 'has-reply' : ''} ${message.isVanish ? 'is-vanish' : ''} ${message.messageEffect && message.messageEffect !== 'none' ? `effect-${message.messageEffect}` : ''} ${matchesSearch ? 'search-match' : ''} ${multiSelectMode && selectedMessageIds.includes(message._id) ? 'multi-selected' : ''}`}
              onMouseEnter={() => setHoveredMessageId(message._id)}
              onMouseLeave={() => {
                setHoveredMessageId(null);
                setReactionMenuId(null);
              }}
            >
              {multiSelectMode && (
                <input
                  type="checkbox"
                  className="msg-select-checkbox"
                  checked={selectedMessageIds.includes(message._id)}
                  onChange={() => onToggleSelect?.(message._id)}
                />
              )}
              {isStarred(message) && <span className="starred-indicator">⭐</span>}
              {message.senderId._id !== currentUserId && (
                <img 
                  src={message.senderId.profilePicture || '/default-avatar.png'} 
                  alt={message.senderId.username}
                  className="message-avatar"
                />
              )}

              <div className="message-content-wrapper">
                {message.replyTo && (
                  <div
                    className="quoted-reply clickable"
                    onClick={() => {
                      const replyId = message.replyTo._id || message.replyTo;
                      onJumpToMessage?.(replyId);
                    }}
                    title="Jump to quoted message"
                  >
                    <div className="quoted-user">{message.replyTo.senderId?.username || 'User'}</div>
                    <div className="quoted-text">
                      {message.replyTo.messageType === 'text' 
                        ? message.replyTo.content 
                        : `📷 ${message.replyTo.messageType}`}
                    </div>
                  </div>
                )}
                {renderMetaBadges(message)}
                {message.messageType === 'call' ? (
                  <div className="call-message">
                    <span className="call-icon">📞</span>
                    <p>{message.content}</p>
                  </div>
                ) : message.isSticker ? (
                  <div className="message-content sticker-bubble">
                    <div className="sticker-svg-container" dangerouslySetInnerHTML={{ __html: message.stickerSvg }} />
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.isAdHocBill ? (
                  <div className="message-content adhoc-bill-card">
                    <div className="bill-card-header">
                      <span className="bill-card-icon">💸</span>
                      <div>
                        <h4>Bill Split: {message.billDescription}</h4>
                        <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Total Bill Cost</span>
                          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#f87171' }}>${message.billTotal}</span>
                          <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: '600' }}>
                            Your Share: ${(message.billTotal / (currentChat?.participants?.length || message.billSplits?.length || 1)).toFixed(2)}
                          </span>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>
                            (Equally split among {currentChat?.participants?.length || message.billSplits?.length || 1} members)
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bill-splits-list">
                      {message.billSplits?.map((split, sIdx) => {
                        const isUserSplit = split.user?._id === currentUserId;
                        return (
                          <div key={sIdx} className={`bill-split-row ${split.paid ? 'paid' : 'pending'}`}>
                            <span className="bill-split-username">{split.user?.username}</span>
                            <div className="row-right">
                              <span className="share-amt">${split.share?.toFixed(2)}</span>
                              {split.paid ? (
                                <span className="settled-lbl">✅ Settled</span>
                              ) : isUserSplit ? (
                                <button 
                                  className="settle-split-btn"
                                  onClick={async () => {
                                    try {
                                      const token = localStorage.getItem('token');
                                      const response = await axios.post(`/api/messages/${message._id}/settle-split`, {}, {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      toast.success('Share settled!');
                                      setDisplayMessages(prev => 
                                        prev.map(m => m._id === message._id ? response.data : m)
                                      );
                                    } catch (err) {
                                      toast.error('Failed to settle share.');
                                    }
                                  }}
                                >
                                  Settle
                                </button>
                              ) : (
                                <span className="unpaid-lbl">⏳ Unpaid</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.isWorkspaceMessage ? (
                  <div className="message-content text-message workspace-matte-bubble">
                    <div className="workspace-matte-header">🤖 Kane Study Coach</div>
                    <p>{message.content}</p>
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.messageType === 'gif' ? (
                  <div className="message-content gif-message">
                    <img src={message.mediaUrl} alt="GIF" />
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.messageType === 'document' ? (
                  <div className="message-content document-message-card">
                    <span className="document-icon">📄</span>
                    <div className="document-info">
                      <strong>{message.fileName || 'Document'}</strong>
                      {message.fileSize && <p>{(message.fileSize / 1024).toFixed(1)} KB</p>}
                      {message.mediaUrl && (
                        <a href={message.mediaUrl} download={message.fileName}>Download</a>
                      )}
                    </div>
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.messageType === 'text' ? (
                  <div className="message-content text-message">
                    {editingId === message._id ? (
                      <div className="edit-message-inline">
                        <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} />
                        <div className="edit-actions">
                          <button onClick={() => handleEdit(message._id)}>Save</button>
                          <button onClick={() => { setEditingId(null); setEditText(''); }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p dangerouslySetInnerHTML={{ __html: getDisplayText(message) }} />
                    )}
                    {renderLinkPreview(message)}

                    {/* Translation Overlay Result */}
                    {translations[message._id] && (
                      <div className="translation-result animate-slide-down">
                        <span className="translation-label">🌐 Translated:</span>
                        <p className="translation-text">{translations[message._id]}</p>
                      </div>
                    )}

                    {/* Tiny inline translation selector */}
                    <div className="translation-trigger-container">
                      <button
                        className="bubble-action-btn-tiny"
                        onClick={() => setActiveLangMenuId(activeLangMenuId === message._id ? null : message._id)}
                        disabled={translatingId === message._id}
                      >
                        {translatingId === message._id ? 'Translating...' : '🌐 Translate'}
                      </button>
                      
                      {activeLangMenuId === message._id && (
                        <div className="lang-picker-dropdown">
                          <button onClick={() => handleTranslateText(message._id, 'Telugu')}>Telugu</button>
                          <button onClick={() => handleTranslateText(message._id, 'Hindi')}>Hindi</button>
                          <button onClick={() => handleTranslateText(message._id, 'Spanish')}>Spanish</button>
                          <button onClick={() => handleTranslateText(message._id, 'French')}>French</button>
                        </div>
                      )}
                    </div>

                    {message.isVanish && (
                      <div className="vanish-bubble-timer">
                        ⏳ {vanishTimers && vanishTimers[message._id] !== undefined ? vanishTimers[message._id] : 60}s
                      </div>
                    )}

                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.messageType === 'image' ? (
                  message.isSnap ? (
                    (() => {
                      const isSender = message.senderId._id === currentUserId || message.senderId === currentUserId;
                      const hasOpened = message.snapOpenedBy && message.snapOpenedBy.some(id => id.toString() === currentUserId.toString());
                      
                      // Sender view
                      if (isSender) {
                        const recipientOpened = message.snapOpenedBy && message.snapOpenedBy.length > 0;
                        return (
                          <div className={`message-content direct-snap-bubble ${recipientOpened ? 'opened' : 'unopened'}`}>
                            <div className="snap-bubble-card">
                              <span>{recipientOpened ? 'Opened snap ✔' : '📷 Snap Sent'}</span>
                            </div>
                            <span className="message-time">
                              {formatTime(message.createdAt)}
                              {renderReadReceipt(message)}
                            </span>
                          </div>
                        );
                      }

                      // Recipient view
                      return (
                        <div 
                          className={`message-content direct-snap-bubble recipient ${hasOpened ? 'opened' : 'unopened'}`}
                          onClick={() => !hasOpened && handleOpenSnap(message)}
                          style={{ cursor: hasOpened ? 'default' : 'pointer' }}
                        >
                          <div className={`snap-bubble-card ${hasOpened ? '' : 'pulse-glow'}`}>
                            <span>{hasOpened ? 'Opened snap ✔' : '📷 Snap Sent (Click to view!)'}</span>
                          </div>
                          <span className="message-time">
                            {formatTime(message.createdAt)}
                            {renderReadReceipt(message)}
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="message-content image-message">
                      <img 
                        src={message.mediaUrl} 
                        alt="Message" 
                        onClick={() => handleImageClick(message.mediaUrl)}
                      />
                      {message.isVanish && (
                        <div className="vanish-bubble-timer image-vanish-timer">
                          ⏳ {vanishTimers && vanishTimers[message._id] !== undefined ? vanishTimers[message._id] : 60}s
                        </div>
                      )}
                      <span className="message-time">
                        {formatTime(message.createdAt)}
                        {renderReadReceipt(message)}
                      </span>
                    </div>
                  )
                ) : message.messageType === 'voice' ? (
                  <div className="message-content voice-message">
                    <audio
                      ref={(el) => { audioRefs.current[message._id] = el; }}
                      controls
                      className="modern-audio-player"
                      onLoadedMetadata={(e) => {
                        const speed = voiceSpeeds[message._id] || 1;
                        e.target.playbackRate = speed;
                      }}
                    >
                      <source src={message.mediaUrl} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                    <div className="voice-speed-controls">
                      {[0.75, 1, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          className={`voice-speed-btn ${(voiceSpeeds[message._id] || 1) === s ? 'active' : ''}`}
                          onClick={() => {
                            setVoiceSpeeds((prev) => ({ ...prev, [message._id]: s }));
                            if (audioRefs.current[message._id]) {
                              audioRefs.current[message._id].playbackRate = s;
                            }
                          }}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                    <div className="voice-meta">
                      <span className="duration">{message.duration}s</span>
                      
                      <button
                        className="ai-summarize-btn"
                        onClick={() => handleSummarizeVoice(message)}
                        disabled={summarizingId === message._id}
                        title="Summarize with AI"
                      >
                        {summarizingId === message._id ? '⏳' : '🤖'} {summarizingId === message._id ? 'Analyzing...' : 'AI Summary'}
                      </button>

                      <button
                        className="ai-summarize-btn transcribe-btn"
                        onClick={() => handleTranscribeAudio(message._id)}
                        disabled={transcribingId === message._id}
                        title="Transcribe Audio Note"
                        style={{ marginLeft: '6px' }}
                      >
                        {transcribingId === message._id ? '⏳' : '📝'} {transcribingId === message._id ? 'Transcribing...' : 'Transcribe'}
                      </button>

                      {message.isVanish && (
                        <div className="vanish-bubble-timer">
                          ⏳ {vanishTimers && vanishTimers[message._id] !== undefined ? vanishTimers[message._id] : 60}s
                        </div>
                      )}

                      <span className="message-time">
                        {formatTime(message.createdAt)}
                        {renderReadReceipt(message)}
                      </span>
                    </div>

                    {transcriptions[message._id] && (
                      <div className="voice-transcription-result">
                        <span className="transcription-label">📝 Transcription:</span>
                        <p>{transcriptions[message._id]}</p>
                      </div>
                    )}

                    {summaries[message._id] && (
                      <div className="voice-summary">
                        <span className="voice-summary-label">🤖 Kane says:</span>
                        <p>{summaries[message._id]}</p>
                      </div>
                    )}
                  </div>
                                ) : message.messageType === 'poll' ? (
                  <div className="message-content poll-message-card">
                    <div className="poll-header">
                      <span className="poll-icon">📊</span>
                      <h4>{message.pollQuestion}</h4>
                      {message.pollAnonymous && (
                        <span className="poll-anonymous-badge">Anonymous (#104)</span>
                      )}
                    </div>
                    <div className="poll-options-list">
                      {message.pollOptions?.map((opt, optIdx) => {
                        const optVotes = opt.voteCount ?? opt.votes?.length ?? 0;
                        const totalVotes = message.pollOptions.reduce(
                          (acc, o) => acc + (o.voteCount ?? o.votes?.length ?? 0),
                          0
                        );
                        const percentage = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                        const hasVoted = !message.pollAnonymous && opt.votes?.some(v => v.toString() === currentUserId.toString());
                        
                        return (
                          <div 
                            key={optIdx} 
                            className={`poll-option-row ${hasVoted ? 'voted' : ''}`}
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem('token');
                                const response = await axios.post(`/api/messages/${message._id}/vote`, { optionIndex: optIdx }, {
                                  headers: { 'Authorization': `Bearer ${token}` }
                                });
                                useChatStore.getState().updateMessage(response.data);
                              } catch (err) {
                                toast.error(err.response?.data?.message || 'Failed to vote');
                              }
                            }}
                          >
                            <div className="poll-option-fill" style={{ width: `${percentage}%` }} />
                            <span className="poll-option-label">{opt.label}</span>
                            <span className="poll-option-pct">{percentage}% ({optVotes})</span>
                          </div>
                        );
                      })}
                    </div>
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.messageType === 'location' ? (
                  <div className="message-content location-message-card">
                    <div className="location-header">
                      <span className="location-icon">📍</span>
                      <div>
                        <h4>Shared Location</h4>
                        <p>{message.locationLabel || 'Shared live coordinates'}</p>
                      </div>
                    </div>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${message.latitude},${message.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-map-link-btn"
                    >
                      View on Google Maps 🗺️
                    </a>
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : message.messageType === 'giftcard' ? (
                  <div className={`message-content giftcard-message-card ${message.giftRedeemed ? 'redeemed' : 'unredeemed'}`}>
                    <div className="giftcard-hologram">
                      <span className="gift-emoji">🎁</span>
                      <h3>₹{message.giftAmount}</h3>
                      <p>"{message.giftMessage}"</p>
                    </div>
                    {message.giftRedeemed ? (
                      <div className="gift-redeemed-banner">
                        Redeemed to Wallet ✅
                      </div>
                    ) : (
                      (message.recipientId?._id || message.recipientId)?.toString() === currentUserId.toString() && (
                        <button 
                          className="redeem-giftcard-btn"
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('token');
                              const response = await axios.post(`/api/giftcards/${message._id}/redeem`, {}, {
                                headers: { 'Authorization': `Bearer ${token}` }
                              });
                              useChatStore.getState().updateMessage(response.data);
                              toast.success('Successfully redeemed to KanePay!');
                            } catch (err) {
                              toast.error(err.response?.data?.message || 'Failed to redeem');
                            }
                          }}
                        >
                          Redeem to KanePay 💳
                        </button>
                      )
                    )}
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                      {renderReadReceipt(message)}
                    </span>
                  </div>
                ) : null}
                
                {message.reactions && message.reactions.length > 0 && (
                  <div className="message-reactions">
                    {groupReactions(message.reactions).map((r, i) => (
                      <span key={i} className={`reaction-pill ${r.hasReacted ? 'active' : ''}`} onClick={() => handleReact(message._id, r.emoji)}>
                        {r.emoji} <small>{r.count}</small>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {hoveredMessageId === message._id && !multiSelectMode && (
                <div className="message-actions-menu expanded">
                  {reactionMenuId === message._id ? (
                    <div className="reaction-picker">
                      {QUICK_EMOJIS.map(em => (
                        <span key={em} onClick={() => handleReact(message._id, em)}>{em}</span>
                      ))}
                    </div>
                  ) : (
                    <>
                      <button className="action-icon-btn" onClick={() => setReactionMenuId(message._id)} title="React"><FiSmile size={16} /></button>
                      <button className="action-icon-btn" onClick={() => onReply(message)} title="Reply"><FiCornerUpLeft size={16} /></button>
                      {message.messageType === 'text' && (
                        <button className="action-icon-btn" onClick={() => handleCopy(message)} title="Copy"><FiCopy size={16} /></button>
                      )}
                      {message.senderId._id === currentUserId && message.messageType === 'text' && canEditMessage(message) && (
                        <button className="action-icon-btn" onClick={() => { setEditingId(message._id); setEditText(message.content); }} title="Edit"><FiEdit2 size={16} /></button>
                      )}
                      <button className="action-icon-btn" onClick={() => setForwardMessage(message)} title="Forward"><FiShare2 size={16} /></button>
                      <button className="action-icon-btn" onClick={() => handleStar(message)} title="Star"><FiStar size={16} fill={isStarred(message) ? 'gold' : 'none'} /></button>
                      <button className="action-icon-btn" onClick={() => handleRemindMessage(message, 'tomorrow')} title="Remind tomorrow"><FiClock size={16} /></button>
                      <button className="action-icon-btn" onClick={() => handleVoiceRemind(message)} title="Voice remind via Kane">🎤</button>
                      <button className="action-icon-btn" onClick={() => handlePin(message)} title="Pin"><FiMapPin size={16} /></button>
                      <button className="action-icon-btn" onClick={() => onEnterMultiSelect?.(message._id)} title="Select">☑️</button>
                      {message.senderId._id === currentUserId && (
                        <button
                          className="action-icon-btn delete-btn"
                          onClick={() => {
                            const forEveryone = window.confirm('Delete for everyone? (Cancel = delete for you only)');
                            handleDelete(message, forEveryone);
                          }}
                          title="Delete"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
          })
        )}
        {smartReplies.length > 0 && (
          <div className="smart-replies-container">
            {smartReplies.map((reply, idx) => (
              <button
                key={idx}
                className="smart-reply-chip"
                onClick={() => {
                  if (onSendSmartReply) {
                    onSendSmartReply(reply);
                    setSmartReplies([]);
                  }
                }}
              >
                {reply}
              </button>
            ))}
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {selectedImage && (
        <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedImage(null)}>
              <FiX size={28} />
            </button>
            <img src={selectedImage} alt="Full view" className="modal-image" />
          </div>
        </div>
      )}

      {forwardMessage && (
        <ForwardMessageModal
          message={forwardMessage}
          chats={chats}
          currentChatId={currentChat?._id}
          onClose={() => setForwardMessage(null)}
        />
      )}

      {/* Ephemeral Snap Viewer Modal */}
      {activeSnapMessage && (
        <div className="fullscreen-snap-overlay">
          <div className="snap-viewer-card glass-panel animate-pop">
            <div className="snap-viewer-header">
              <div className="flex-row-align">
                <img 
                  src={activeSnapMessage.senderId?.profilePicture || '/default-avatar.png'} 
                  alt={activeSnapMessage.senderId?.username} 
                  className="snap-viewer-avatar"
                />
                <div>
                  <span className="snap-viewer-username">@{activeSnapMessage.senderId?.username}</span>
                  <p className="snap-viewer-subtitle">One-View Snap</p>
                </div>
              </div>
              <div className="snap-viewer-timer-container">
                <svg className="timer-ring-svg" viewBox="0 0 36 36">
                  <path
                    className="timer-ring-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="timer-ring-fill"
                    strokeDasharray={`${(snapCountdown / 8) * 100}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="snap-countdown-digit">{snapCountdown}</span>
              </div>
            </div>
            
            <div className="snap-viewer-body">
              <img src={activeSnapMessage.mediaUrl} alt="One-View Ephemeral Snap" className="snap-viewer-image" />
            </div>

            <div className="snap-viewer-footer">
              <button 
                className="snap-action-btn save-btn" 
                onClick={() => handleDownloadSnap(activeSnapMessage.mediaUrl, activeSnapMessage.senderId?.username || 'friend')}
              >
                💾 Save to Device
              </button>
              <button className="snap-action-btn close-btn" onClick={closeAndBurnSnap}>
                Burn Snap 🔥
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MessageList;