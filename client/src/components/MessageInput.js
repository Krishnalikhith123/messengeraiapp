import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiImage, FiMic, FiX, FiPlus, FiClock, FiFile, FiCpu } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocketStore } from '../store/socketStore';
import StoryCreator from './StoryCreator';
import SmartComposer from './SmartComposer';
import toast from 'react-hot-toast';
import axios from 'axios';
import { encryptMessage } from '../utils/encryption';
import { saveDraft, loadDraft, MESSAGE_EFFECTS, CURATED_GIFS } from '../utils/chatMessaging';
import '../styles/MessageInput.css';
import '../styles/MessagingFeatures.css';

function MessageInput({ chat, replyingTo, onCancelReply, isVanishActive, groupPerms, onMessageSent }) {
  const { user } = useAuthStore();
  const { addMessage } = useChatStore();
  const { socket } = useSocketStore();
  const [message, setMessage] = useState(() => loadDraft(chat?._id));
  const [isRecording, setIsRecording] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [messageEffect, setMessageEffect] = useState('none');
  const [showComposer, setShowComposer] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Direct Ephemeral Snaps
  const [showSnapCreator, setShowSnapCreator] = useState(false);

  // AI Vector Sticker states
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [stickerPrompt, setStickerPrompt] = useState('');
  const [isGeneratingSticker, setIsGeneratingSticker] = useState(false);
  const [catalogStickers, setCatalogStickers] = useState([]);
  const [stickerFavorites, setStickerFavorites] = useState([]);

  // Ad-Hoc split bill states
  const [showBillModal, setShowBillModal] = useState(false);
  const [billDesc, setBillDesc] = useState('');
  const [billTotal, setBillTotal] = useState('');
  const [isCreatingBill, setIsCreatingBill] = useState(false);

  // Poll States
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollAnonymous, setPollAnonymous] = useState(false);

  // Gift Card States
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftAmount, setGiftAmount] = useState('');
  const [giftMessage, setGiftMessage] = useState('');

  useEffect(() => {
    if (chat?._id) setMessage(loadDraft(chat._id));
  }, [chat?._id]);

  useEffect(() => {
    const t = setTimeout(() => saveDraft(chat?._id, message), 400);
    return () => clearTimeout(t);
  }, [message, chat?._id]);

  useEffect(() => {
    if (!showStickerModal) return;
    const token = localStorage.getItem('token');
    axios.get('/api/features/stickers', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setCatalogStickers(r.data))
      .catch(() => {});
    axios.get('/api/users/profile/' + user.id, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setStickerFavorites(r.data.stickerFavorites || []))
      .catch(() => {});
  }, [showStickerModal, user?.id]);

  const sendCatalogSticker = async (sticker) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/features/stickers/favorite', sticker, { headers: { Authorization: `Bearer ${token}` } });
      const { recipientId } = getRecipientPayload();
      const payload = {
        chatId: chat._id,
        senderId: user.id,
        recipientId,
        content: sticker.emoji,
        messageType: 'text'
      };
      const res = await axios.post('/api/messages', payload, { headers: { Authorization: `Bearer ${token}` } });
      addMessage(res.data);
      emitMessage(res.data);
      setShowStickerModal(false);
      toast.success(`Sent ${sticker.label} (#88)`);
    } catch {
      toast.error('Could not send sticker');
    }
  };

  const getRecipientPayload = () => {
    const myId = user.id?.toString();
    const recipient = chat.participants?.find(
      (p) => (p._id || p).toString() !== myId
    );
    const recipientId = recipient?._id || recipient;
    const participantIds = chat.participants?.map((p) => (p._id || p).toString());
    return { recipientId, participantIds };
  };

  const emitMessage = (msgData) => {
    if (!socket) return;
    const { recipientId, participantIds } = getRecipientPayload();
    socket.emit('send-message', {
      ...msgData,
      recipientId,
      participantIds: chat.isGroupChat ? participantIds : undefined
    });
  };

  // Handle prompt-to-SVG sticker generation
  const handleGenerateSticker = async (e) => {
    e.preventDefault();
    if (!stickerPrompt.trim()) return;

    setIsGeneratingSticker(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/messages/sticker/generate', {
        chatId: chat._id,
        prompt: stickerPrompt
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      addMessage(response.data);

      if (socket) {
        socket.emit('send-message', {
          ...response.data,
          recipientId: chat.participants.find(p => p._id !== user.id)?._id
        });
      }

      toast.success('AI Sticker dispatched successfully!');
      setShowStickerModal(false);
      setStickerPrompt('');
    } catch (err) {
      console.error(err);
      toast.error('Kane encountered drawing block. Try another sticker prompt!');
    } finally {
      setIsGeneratingSticker(false);
    }
  };

  // Handle ad-hoc restaurant bill splits
  const handleCreateBillSplit = async (e) => {
    e.preventDefault();
    if (!billDesc.trim() || !billTotal.trim() || isNaN(billTotal) || Number(billTotal) <= 0) {
      toast.error('Enter valid bill details.');
      return;
    }

    setIsCreatingBill(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/messages', {
        chatId: chat._id,
        recipientId: chat.participants.find(p => p._id !== user.id)?._id,
        content: `💸 Bill Split Request: ${billDesc}`,
        messageType: 'text',
        isAdHocBill: true,
        billDescription: billDesc,
        billTotal: Number(billTotal),
        replyTo: replyingTo ? replyingTo._id : undefined
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      addMessage(response.data);

      if (socket) {
        socket.emit('send-message', {
          ...response.data,
          recipientId: chat.participants.find(p => p._id !== user.id)?._id
        });
      }

      toast.success('Bill split request posted!');
      setShowBillModal(false);
      setBillDesc('');
      setBillTotal('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to create split request.');
    } finally {
      setIsCreatingBill(false);
    }
  };

  const handleSendDirectSnap = async (caption, mediaUrl, mediaType) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/messages', {
        chatId: chat._id,
        recipientId: chat.participants.find(p => p._id !== user.id)?._id,
        content: `📷 Sent a snap: ${caption || 'Moment Captured'}`,
        messageType: 'image',
        mediaUrl: mediaUrl,
        isSnap: true,
        replyTo: replyingTo ? replyingTo._id : undefined
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      addMessage(response.data);

      if (socket) {
        socket.emit('send-message', {
          ...response.data,
          recipientId: chat.participants.find(p => p._id !== user.id)?._id
        });
      }

      toast.success('One-View Snap sent successfully!');
      setShowSnapCreator(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to send One-View Snap.');
    }
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    toast.loading('Fetching location...', { id: 'location-loader' });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const token = localStorage.getItem('token');
          const response = await axios.post('/api/messages', {
            chatId: chat._id,
            recipientId: chat.participants.find(p => p._id !== user.id)?._id,
            content: `📍 Location Shared`,
            messageType: 'location',
            latitude,
            longitude,
            locationLabel: 'Live Coordinates'
          }, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          addMessage(response.data);

          if (socket) {
            socket.emit('send-message', {
              ...response.data,
              recipientId: chat.participants.find(p => p._id !== user.id)?._id
            });
          }

          toast.success('Location shared successfully!', { id: 'location-loader' });
        } catch (err) {
          toast.error('Failed to send location message', { id: 'location-loader' });
        }
      },
      (err) => {
        toast.error('Failed to get your location', { id: 'location-loader' });
      }
    );
  };

  const isReadOnly = groupPerms?.myRole === 'readonly';
  const canSendNow = groupPerms ? groupPerms.canSend !== false : true;

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    if (isReadOnly) return toast.error('Read-only members cannot create polls');
    const filteredOptions = pollOptions.filter(opt => opt.trim() !== '');
    if (!pollQuestion.trim() || filteredOptions.length < 2) {
      toast.error('Please enter a question and at least 2 options');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/messages/poll', {
        chatId: chat._id,
        recipientId: chat.participants.find(p => p._id !== user.id)?._id,
        pollQuestion,
        pollOptions: filteredOptions,
        pollDurationHours: 24,
        pollAnonymous: chat.isGroupChat ? pollAnonymous : false
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      addMessage(response.data);

      if (socket) {
        socket.emit('send-message', {
          ...response.data,
          recipientId: chat.participants.find(p => p._id !== user.id)?._id
        });
      }

      toast.success('Poll created successfully!');
      setShowPollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollAnonymous(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create poll');
    }
  };

  const handleSendGiftCard = async (e) => {
    e.preventDefault();
    const amt = parseFloat(giftAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid gift amount');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/giftcards/send', {
        chatId: chat._id,
        recipientId: chat.participants.find(p => p._id !== user.id)?._id,
        giftAmount: amt,
        giftMessage: giftMessage || '🎉 A little gift for you!'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      addMessage(response.data);

      if (socket) {
        socket.emit('send-message', {
          ...response.data,
          recipientId: chat.participants.find(p => p._id !== user.id)?._id
        });
      }

      toast.success('Gift card sent successfully!');
      setShowGiftModal(false);
      setGiftAmount('');
      setGiftMessage('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send gift card');
    }
  };

  const handleSendMessage = async () => {
    if (isReadOnly) return toast.error('You have read-only access in this group');
    if (!canSendNow) return toast.error(`Slow mode — wait ${groupPerms?.waitSeconds || 0}s`);
    if (message.trim()) {
      try {
        const textContent = chat.isSecretChat ? encryptMessage(message, chat._id) : message;
        const { recipientId } = getRecipientPayload();
        const token = localStorage.getItem('token');
        const response = await axios.post('/api/messages', {
          chatId: chat._id,
          recipientId,
          content: textContent,
          messageType: 'text',
          replyTo: replyingTo ? replyingTo._id : undefined,
          isVanish: isVanishActive,
          messageEffect: messageEffect !== 'none' ? messageEffect : undefined
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        addMessage(response.data);
        emitMessage(response.data);
        
        setMessage('');
        saveDraft(chat._id, '');
        setMessageEffect('none');
        if (onCancelReply) onCancelReply();
        onMessageSent?.();
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to send message');
        onMessageSent?.();
      }
    }
  };

  const handleScheduleMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || !scheduleDate) {
      toast.error('Enter message and schedule time');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const { recipientId } = getRecipientPayload();
      const res = await axios.post('/api/messaging/schedule', {
        chatId: chat._id,
        recipientId,
        content: chat.isSecretChat ? encryptMessage(message, chat._id) : message,
        messageType: 'text',
        scheduledFor: new Date(scheduleDate).toISOString(),
        replyTo: replyingTo?._id,
        messageEffect: messageEffect !== 'none' ? messageEffect : 'none'
      }, { headers: { Authorization: `Bearer ${token}` } });
      addMessage(res.data);
      toast.success('Message scheduled!');
      setMessage('');
      saveDraft(chat._id, '');
      setShowScheduleModal(false);
      setScheduleDate('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Schedule failed');
    }
  };

  const handleSendGif = async (gifUrl) => {
    try {
      const token = localStorage.getItem('token');
      const { recipientId } = getRecipientPayload();
      const res = await axios.post('/api/messages', {
        chatId: chat._id,
        recipientId,
        content: 'GIF',
        messageType: 'gif',
        mediaUrl: gifUrl
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      addMessage(res.data);
      emitMessage(res.data);
      setShowGifPicker(false);
      toast.success('GIF sent!');
    } catch (err) {
      console.error('GIF send error:', err);
      toast.error(err.response?.data?.message || 'Failed to send GIF');
    }
  };

  const handleDocumentUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const token = localStorage.getItem('token');
        const { recipientId } = getRecipientPayload();
        const res = await axios.post('/api/messages', {
          chatId: chat._id,
          recipientId,
          content: `📄 ${file.name}`,
          messageType: 'document',
          mediaUrl: event.target.result,
          fileName: file.name,
          fileSize: file.size
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        addMessage(res.data);
        emitMessage(res.data);
        toast.success('Document sent!');
      } catch (err) {
        console.error('Document send error:', err);
        toast.error(err.response?.data?.message || 'Failed to send document');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMentionSelect = (username) => {
    const words = message.split(' ');
    words[words.length - 1] = `@${username} `;
    setMessage(words.join(' '));
    setShowMentions(false);
    setMentionQuery('');
  };

  const handleMessageChange = (e) => {
    const val = e.target.value;
    setMessage(val);
    if (chat.isGroupChat) {
      const match = val.match(/@(\w*)$/);
      if (match) {
        setMentionQuery(match[1].toLowerCase());
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
    }
  };

  const mentionCandidates = chat.isGroupChat
    ? chat.participants.filter((p) => {
        const uname = (p.username || '').toLowerCase();
        return uname.includes(mentionQuery) && p._id !== user.id;
      })
    : [];

  const chatName = chat.isGroupChat
    ? chat.groupName
    : chat.participants?.find((p) => (p._id || p).toString() !== user.id?.toString())?.username;

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const response = await axios.post('/api/messages', {
            chatId: chat._id,
            recipientId: chat.participants.find(p => p._id !== user.id)?._id,
            content: `Image: ${file.name}`,
            messageType: 'image',
            mediaUrl: event.target.result,
            isVanish: isVanishActive
          });
          
          addMessage(response.data);
          
          if (socket) {
            socket.emit('send-message', {
              ...response.data,
              recipientId: chat.participants.find(p => p._id !== user.id)?._id
            });
          }
          
          toast.success('Image sent!');
        } catch (error) {
          toast.error('Failed to send image');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' });
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const response = await axios.post('/api/messages', {
              chatId: chat._id,
              recipientId: chat.participants.find(p => p._id !== user.id)?._id,
              content: 'Voice Message',
              messageType: 'voice',
              mediaUrl: event.target.result,
              duration: Math.round(audioChunksRef.current.length * 0.02),
              isVanish: isVanishActive
            });
            
            addMessage(response.data);
            
            if (socket) {
              socket.emit('send-voice', {
                ...response.data,
                recipientId: chat.participants.find(p => p._id !== user.id)?._id
              });
            }
            
            toast.success('Voice message sent!');
          } catch (error) {
            toast.error('Failed to send voice message');
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success('Recording started...');
    } catch (error) {
      toast.error('Microphone access denied');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    
    if (socket) {
      socket.emit('user-typing', {
        userId: user.id,
        recipientId: chat.participants.find(p => p._id !== user.id)?._id
      });
    }
  };

  return (
    <div className="message-input-container">
      {message && loadDraft(chat._id) && (
        <div className="draft-indicator">📝 Draft saved</div>
      )}
      {replyingTo && (
        <div className="reply-preview-bar">
          <div className="reply-preview-content">
            <span className="reply-user">{replyingTo.senderId?.username || 'User'}</span>
            <span className="reply-text">
              {replyingTo.messageType === 'text' ? replyingTo.content : `🖼️ ${replyingTo.messageType}`}
            </span>
          </div>
          <button className="cancel-reply-btn" onClick={onCancelReply} title="Cancel reply">
            <FiX size={16} />
          </button>
        </div>
      )}
      
      {isReadOnly ? (
        <div className="readonly-notice">Read-only — you cannot send messages in this group.</div>
      ) : (
      <div className="message-input">
        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" hidden />
        <input type="file" ref={docInputRef} onChange={handleDocumentUpload} accept=".pdf,.doc,.docx,.txt,.zip" hidden />

        {showExtras && (
          <div className="input-extras-toolbar">
            {MESSAGE_EFFECTS.map((ef) => (
              <button
                key={ef.id}
                type="button"
                className={`input-extra-btn ${messageEffect === ef.id ? 'active' : ''}`}
                onClick={() => setMessageEffect(ef.id)}
              >
                {ef.emoji} {ef.label}
              </button>
            ))}
          </div>
        )}

        <div className="input-wrapper" style={{ position: 'relative' }}>
          {showMentions && mentionCandidates.length > 0 && (
            <div className="mention-suggestions">
              {mentionCandidates.map((p) => (
                <div
                  key={p._id}
                  className="mention-suggestion-item"
                  onClick={() => handleMentionSelect(p.username)}
                >
                  @{p.username}
                </div>
              ))}
            </div>
          )}

          <button className="input-btn" onClick={() => setShowExtras(!showExtras)} title="More options">
            <FiPlus size={20} />
          </button>

          <button className="input-btn image-btn" onClick={() => fileInputRef.current?.click()} title="Send Image">
            <FiImage size={20} />
          </button>

          <button className="input-btn" onClick={() => docInputRef.current?.click()} title="Send Document">
            <FiFile size={20} />
          </button>

          <button className="input-btn" onClick={() => setShowGifPicker(!showGifPicker)} title="Send GIF">
            GIF
          </button>

          <button className="input-btn" onClick={() => setShowScheduleModal(true)} title="Schedule Message">
            <FiClock size={18} />
          </button>

          <button
            className="input-btn"
            onClick={() => setShowComposer((open) => !open)}
            title="AI Smart Composer"
          >
            <FiCpu size={18} />
          </button>



          {/* AI Vector Sticker Compiler Trigger */}
          <button
            className="input-btn sticker-btn"
            onClick={() => setShowStickerModal(true)}
            title="AI Vector Sticker Badge"
            style={{ fontSize: '1.2rem', padding: '4px' }}
          >
            🎨
          </button>

          {/* Ad-Hoc Split Bill Card Generator Trigger */}
          <button
            className="input-btn bill-split-btn"
            onClick={() => setShowBillModal(true)}
            title="Split Restaurant Bill"
            style={{ fontSize: '1.2rem', padding: '4px' }}
          >
            💸
          </button>

          {/* In-Chat Polls Trigger */}
          <button
            className="input-btn poll-btn"
            onClick={() => setShowPollModal(true)}
            title="Create Poll"
            style={{ fontSize: '1.2rem', padding: '4px' }}
          >
            📊
          </button>

          {/* Live Location Sharing */}
          <button
            className="input-btn location-btn"
            onClick={handleShareLocation}
            title="Share Location"
            style={{ fontSize: '1.2rem', padding: '4px' }}
          >
            📍
          </button>

          {/* Gift Card sending Trigger */}
          <button
            className="input-btn gift-btn"
            onClick={() => setShowGiftModal(true)}
            title="Send Gift Card"
            style={{ fontSize: '1.2rem', padding: '4px' }}
          >
            🎁
          </button>

          {isRecording ? (
            <div className="recording-status">
               <span className="recording-dot"></span>
               <span>Recording voice... Release to send</span>
            </div>
          ) : (
            <textarea
              value={message}
              onChange={handleMessageChange}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              rows="1"
              className="message-textarea"
            />
          )}

          {showComposer && (
            <SmartComposer
              draft={message}
              chatName={chatName}
              onApply={(nextText) => {
                setMessage(nextText);
                setShowComposer(false);
              }}
              onClose={() => setShowComposer(false)}
            />
          )}

          <button
            className={`input-btn voice-btn ${isRecording ? 'recording' : ''}`}
            onMouseDown={handleStartRecording}
            onMouseUp={handleStopRecording}
            onTouchStart={handleStartRecording}
            onTouchEnd={handleStopRecording}
            title={isRecording ? 'Release to send' : 'Hold to record voice'}
          >
            <FiMic size={20} />
          </button>

          <button
            className="input-btn send-btn"
            onClick={handleSendMessage}
            disabled={(!message.trim() && !isRecording) || !canSendNow}
            title="Send Message"
          >
            <FiSend size={20} />
          </button>
        </div>
      </div>
      )}

      {/* AI vector Sticker Dialog Overlay */}
      {showStickerModal && (
        <div className="sticker-modal-overlay">
          <form className="sticker-modal glass-panel" onSubmit={handleGenerateSticker}>
            <div className="modal-header">
              <h4>🎨 Kane Vector Sticker Generator</h4>
              <button type="button" className="close-modal" onClick={() => setShowStickerModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="sticker-studio-label">Sticker studio (#88) — tap to send</p>
              <div className="sticker-catalog-quick">
                {[...stickerFavorites, ...catalogStickers].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i).slice(0, 12).map((s) => (
                  <button key={s.id} type="button" className="sticker-quick-btn" onClick={() => sendCatalogSticker(s)} title={s.label}>
                    {s.emoji}
                  </button>
                ))}
              </div>
              <p>Type a fun prompt and Kane will compile a modern, transparent vector badge SVG instantly!</p>
              <input
                type="text"
                placeholder="e.g. 'Coding ninja kitten', 'Coffee coding time'..."
                value={stickerPrompt}
                onChange={(e) => setStickerPrompt(e.target.value)}
                required
                disabled={isGeneratingSticker}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={() => setShowStickerModal(false)}>Cancel</button>
              <button type="submit" className="confirm-btn" disabled={isGeneratingSticker || !stickerPrompt.trim()}>
                {isGeneratingSticker ? 'Compiling SVG...' : '✨ Generate Sticker'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ad-Hoc Bill Split Dialog Overlay */}
      {showBillModal && (
        <div className="sticker-modal-overlay">
          <form className="sticker-modal glass-panel" onSubmit={handleCreateBillSplit}>
            <div className="modal-header">
              <h4>💸 Split Dinner/Restaurant Bill</h4>
              <button type="button" className="close-modal" onClick={() => setShowBillModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Create an interactive split ledger card with roommate list participants.</p>
              <div className="input-group-vertical">
                <label>Bill Description</label>
                <input
                  type="text"
                  placeholder="e.g. Restaurant Pizza Dinner"
                  value={billDesc}
                  onChange={(e) => setBillDesc(e.target.value)}
                  required
                  disabled={isCreatingBill}
                />
              </div>
              <div className="input-group-vertical" style={{ marginTop: '10px' }}>
                <label>Total Dollar Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 75.00"
                  value={billTotal}
                  onChange={(e) => setBillTotal(e.target.value)}
                  required
                  disabled={isCreatingBill}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={() => setShowBillModal(false)}>Cancel</button>
              <button type="submit" className="confirm-btn" disabled={isCreatingBill || !billDesc.trim() || !billTotal.trim()}>
                {isCreatingBill ? 'Posting Splitting Card...' : '💸 Post Split Bill'}
              </button>
            </div>
          </form>
        </div>
      )}


      {/* In-Chat Poll Creator Modal */}
      {showPollModal && (
        <div className="sticker-modal-overlay">
          <form className="sticker-modal glass-panel" onSubmit={handleCreatePoll}>
            <div className="modal-header">
              <h4>📊 Create Group Poll</h4>
              <button type="button" className="close-modal" onClick={() => setShowPollModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="input-group-vertical">
                <label>Question</label>
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  required
                />
              </div>
              <div className="input-group-vertical" style={{ marginTop: '12px' }}>
                <label>Options</label>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input
                      type="text"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...pollOptions];
                        newOpts[idx] = e.target.value;
                        setPollOptions(newOpts);
                      }}
                      required={idx < 2}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                        onClick={() => {
                          setPollOptions(pollOptions.filter((_, i) => i !== idx));
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  style={{ marginTop: '10px', background: '#7c3aed', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                  onClick={() => setPollOptions([...pollOptions, ''])}
                >
                  ➕ Add Option
                </button>
              </div>
              {chat.isGroupChat && (
                <label className="gsm-check" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={pollAnonymous}
                    onChange={(e) => setPollAnonymous(e.target.checked)}
                  />
                  Anonymous voting — hide who voted (#104)
                </label>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={() => setShowPollModal(false)}>Cancel</button>
              <button type="submit" className="confirm-btn">
                Launch Poll 🚀
              </button>
            </div>
          </form>
        </div>
      )}

      {showGifPicker && (
        <div className="sticker-modal-overlay" onClick={() => setShowGifPicker(false)}>
          <div className="sticker-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>GIF Picker</h4>
              <button type="button" className="close-modal" onClick={() => setShowGifPicker(false)}>&times;</button>
            </div>
            <div className="modal-body gif-picker-grid">
              {CURATED_GIFS.map((url, i) => (
                <div key={i} className="gif-picker-item" onClick={() => handleSendGif(url)}>
                  <img src={url} alt={`GIF ${i}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <div className="sticker-modal-overlay">
          <form className="sticker-modal glass-panel" onSubmit={handleScheduleMessage}>
            <div className="modal-header">
              <h4>⏰ Schedule Message</h4>
              <button type="button" className="close-modal" onClick={() => setShowScheduleModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Send &quot;{message.slice(0, 40)}{message.length > 40 ? '...' : ''}&quot; later:</p>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                required
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={() => setShowScheduleModal(false)}>Cancel</button>
              <button type="submit" className="confirm-btn">Schedule</button>
            </div>
          </form>
        </div>
      )}

      {/* KanePay Gift Card Sender Modal */}
      {showGiftModal && (
        <div className="sticker-modal-overlay">
          <form className="sticker-modal glass-panel" onSubmit={handleSendGiftCard}>
            <div className="modal-header">
              <h4>🎁 Send KanePay Gift Card</h4>
              <button type="button" className="close-modal" onClick={() => setShowGiftModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="input-group-vertical">
                <label>Amount (INR ₹)</label>
                <input
                  type="number"
                  placeholder="Enter amount in ₹..."
                  value={giftAmount}
                  onChange={(e) => setGiftAmount(e.target.value)}
                  required
                />
              </div>
              <div className="input-group-vertical" style={{ marginTop: '12px' }}>
                <label>Custom Message</label>
                <input
                  type="text"
                  placeholder="e.g. Happy Birthday! 🎉"
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={() => setShowGiftModal(false)}>Cancel</button>
              <button type="submit" className="confirm-btn">
                Send Gift Card 💳
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default MessageInput;
