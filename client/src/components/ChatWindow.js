import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore, normalizeMessagesList } from '../store/chatStore';
import { useSocketStore } from '../store/socketStore';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import toast from 'react-hot-toast';
import axios from 'axios';
import { FiPhone, FiPhoneOff, FiVideo, FiMoreVertical, FiArrowLeft, FiX, FiSearch, FiEdit, FiCalendar, FiActivity, FiSettings } from 'react-icons/fi';
import GroupSettingsModal from './GroupSettingsModal';
import { useNavigate } from 'react-router-dom';
import CanvasDrawing from './CanvasDrawing';
import WorkspaceTutor from './WorkspaceTutor';
import SentimentDashboard from './SentimentDashboard';
import SharedCalendar from './SharedCalendar';
import GameMessage from './GameMessage';
import MusicStatus from './MusicStatus';
import ChatExtrasPanel from './ChatExtrasPanel';
import '../styles/ChatWindow.css';
import '../styles/MessagingFeatures.css';
import '../styles/GroupFeatures.css';

function ChatWindow({ chat }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { messages: rawMessages, chats, addMessage, fetchMessages, removeMessage, deleteChat, leaveGroup, updateChats, setCurrentChat } = useChatStore();
  const messages = normalizeMessagesList(rawMessages);
  const { socket } = useSocketStore();
  const [isTyping, setIsTyping] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupPerms, setGroupPerms] = useState({ canSend: true, myRole: 'member', slowModeSeconds: 0, waitSeconds: 0 });
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showGameConsole, setShowGameConsole] = useState(false);
  const [showChatExtras, setShowChatExtras] = useState(false);
  const [kaneRefereeMsg, setKaneRefereeMsg] = useState('');
  const [chatBg, setChatBg] = useState(() => {
    const saved = localStorage.getItem(`chatBg_${chat._id}`);
    return saved || '#f5f7fa';
  });
  const [otherUser, setOtherUser] = useState(null);
  const [otherMood, setOtherMood] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callState, setCallState] = useState({
    status: 'idle',
    callType: 'audio',
    direction: null,
    peerSocketId: null,
    peerUserId: null,
    peerName: ''
  });
  const [replyingTo, setReplyingTo] = useState(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const incomingOfferRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const [extractedEvents, setExtractedEvents] = useState([]);
  const [showCanvas, setShowCanvas] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showSentiment, setShowSentiment] = useState(false);
  const [isVanishActive, setIsVanishActive] = useState(false);
  const [showTldr, setShowTldr] = useState(false);
  const [tldrData, setTldrData] = useState('');
  const [loadingTldr, setLoadingTldr] = useState(false);
  const [vanishTimers, setVanishTimers] = useState({});
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const messageRefs = useRef({});

  const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b'];

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [callState.status]);

  useEffect(() => {
    return () => {
      clearCallTimeout();
      peerConnectionRef.current?.close();
      stopMediaTracks();
    };
  }, []);

  useEffect(() => {
    if (chat && !chat.isGroupChat) {
      const other = chat.participants.find(p => p._id !== user.id);
      setOtherUser(other);
      if (other?._id) {
        const token = localStorage.getItem('token');
        axios.get(`/api/features/mood/${other._id}`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => setOtherMood(r.data))
          .catch(() => setOtherMood(null));
      }
    } else {
      setOtherMood(null);
    }
  }, [chat, user.id]);

  const refreshGroupPerms = async () => {
    if (!chat?.isGroupChat) return;
    try {
      const token = localStorage.getItem('token');
      const [settingsRes, slowRes] = await Promise.all([
        axios.get(`/api/groups/${chat._id}/settings`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/groups/${chat._id}/slow-mode`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setGroupPerms({
        canSend: slowRes.data.canSend !== false,
        waitSeconds: slowRes.data.waitSeconds || 0,
        slowModeSeconds: slowRes.data.slowModeSeconds || 0,
        myRole: settingsRes.data.myRole || 'member'
      });
    } catch {
      setGroupPerms({ canSend: true, myRole: 'member', slowModeSeconds: 0, waitSeconds: 0 });
    }
  };

  useEffect(() => {
    refreshGroupPerms();
  }, [chat?._id, chat?.isGroupChat]);

  useEffect(() => {
    if (!socket || !chat?.isGroupChat) return;
    const onSettings = (payload) => {
      if (payload?.chatId === chat._id) refreshGroupPerms();
    };
    socket.on('group-settings-updated', onSettings);
    return () => socket.off('group-settings-updated', onSettings);
  }, [socket, chat?._id, chat?.isGroupChat]);

  useEffect(() => {
    if (!socket || !chat?._id) return;
    const onReferee = (data) => {
      if (data.chatId === chat._id) {
        setKaneRefereeMsg(data.comment);
        toast(`🤖 Kane: ${data.comment}`, { duration: 5000 });
      }
    };
    socket.on('kane-game-referee', onReferee);
    return () => socket.off('kane-game-referee', onReferee);
  }, [socket, chat?._id]);

  const chatThemeStyle = chat?.chatTheme?.bubbleSent
    ? {
        '--bubble-sent': chat.chatTheme.bubbleSent,
        '--bubble-received': chat.chatTheme.bubbleReceived || '#1e293b',
        '--chat-font': chat.chatTheme.fontFamily || 'Outfit'
      }
    : {};

  useEffect(() => {
    const saved = localStorage.getItem(`chatBg_${chat._id}`);
    if (chat.wallpaperUrl) {
      setChatBg(`url(${chat.wallpaperUrl})`);
    } else if (saved) {
      setChatBg(saved);
    }
  }, [chat._id, chat.wallpaperUrl]);

  useEffect(() => {
    const fetchPinned = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/messaging/chat/${chat._id}/pinned`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPinnedMessages(res.data);
      } catch { /* ignore */ }
    };
    if (chat?._id) fetchPinned();
  }, [chat._id, messages]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await axios.get(`/api/messages/${chat._id}/events`);
        setExtractedEvents(response.data);
      } catch (error) {
        console.error('Error fetching chat events:', error);
      }
    };
    if (chat?._id) {
      fetchEvents();
    }
  }, [chat._id]);

  // Vanish message countdown tracker
  useEffect(() => {
    const vanishMsgs = messages.filter(m => m.isVanish && !m.isDeleted);
    
    setVanishTimers(prev => {
      const next = { ...prev };
      let updated = false;
      vanishMsgs.forEach(m => {
        if (next[m._id] === undefined) {
          next[m._id] = 60; // Start 60-second countdown once saw on screen!
          updated = true;
        }
      });
      return updated ? next : prev;
    });
  }, [messages]);

  useEffect(() => {
    const timer = setInterval(() => {
      setVanishTimers(prev => {
        const next = { ...prev };
        let updated = false;
        
        Object.keys(next).forEach(id => {
          if (next[id] > 0) {
            next[id] -= 1;
            updated = true;

            if (next[id] === 0) {
              handleSelfDestruct(id);
            }
          }
        });
        return updated ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleSelfDestruct = async (messageId) => {
    try {
      await axios.delete(`/api/messages/${messageId}/vanish`);
      removeMessage(messageId); // Instantly clears from message list with chatStore
    } catch (e) {
      console.error('Self destruct failed:', e);
    }
  };

  // TL;DR chat summarizer fetcher
  const handleFetchTldr = async () => {
    setLoadingTldr(true);
    setShowTldr(true);
    setTldrData('');
    try {
      const response = await axios.post(`/api/messages/${chat._id}/tldr`);
      setTldrData(response.data.tldr);
    } catch (e) {
      console.error('TLDR summary loading failed:', e);
      setTldrData("Sorry, I could not synthesize the summary at this time.");
    } finally {
      setLoadingTldr(false);
    }
  };

  const clearCallTimeout = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  };

  const stopMediaTracks = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const resetCallState = () => {
    clearCallTimeout();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingIceCandidatesRef.current = [];
    incomingOfferRef.current = null;
    stopMediaTracks();
    setIsCalling(false);
    setCallState({
      status: 'idle',
      callType: 'audio',
      direction: null,
      peerSocketId: null,
      peerUserId: null,
      peerName: ''
    });
  };

  const getLocalMedia = async (callType) => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  const flushPendingIceCandidates = async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;
    const candidates = pendingIceCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  };

  const createPeerConnection = (target) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', {
          targetSocketId: target?.socketId,
          targetUserId: target?.userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setCallState((state) => ({ ...state, status: 'active' }));
      setIsCalling(false);
      clearCallTimeout();
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        resetCallState();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const startCallTimeout = (callType = 'audio', message = 'Call timeout - No response from recipient') => {
    clearCallTimeout();
    callTimeoutRef.current = setTimeout(() => {
      toast.error(message);
      addCallMessage(user.username, 'missed', callType);
      resetCallState();
    }, 30000);
  };

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (data) => {
      if (data.chatId === chat._id) {
        const exists = normalizeMessagesList(useChatStore.getState().messages).some((m) => m._id === data._id);
        if (exists) {
          useChatStore.getState().updateMessage(data);
        } else {
          addMessage(data);
        }
        if (data._id && data.senderId?._id !== user.id && data.senderId !== user.id) {
          axios.put(`/api/messaging/${data._id}/delivered`).catch(() => {});
        }
      }
    };

    const handleMessageReacted = (updated) => {
      if (updated.chatId === chat._id) useChatStore.getState().updateMessage(updated);
    };

    const handleMessageEdited = (updated) => {
      if (updated.chatId === chat._id) useChatStore.getState().updateMessage(updated);
    };

    const handleDeliveryUpdate = ({ messageId, deliveryStatus }) => {
      const msgs = normalizeMessagesList(useChatStore.getState().messages);
      const m = msgs.find((x) => x._id === messageId);
      if (m) useChatStore.getState().updateMessage({ ...m, deliveryStatus, isRead: deliveryStatus === 'read' });
    };

    const handleMarkDelivered = ({ messageId }) => {
      axios.put(`/api/messaging/${messageId}/delivered`).catch(() => {});
    };

    const handlePinned = () => {
      axios.get(`/api/messaging/chat/${chat._id}/pinned`).then((r) => setPinnedMessages(r.data)).catch(() => {});
    };

    const handleWallpaper = ({ chatId, wallpaperUrl }) => {
      if (chatId === chat._id && wallpaperUrl) {
        setChatBg(`url(${wallpaperUrl})`);
        localStorage.setItem(`chatBg_${chat._id}`, `url(${wallpaperUrl})`);
      }
    };

    const handleIncomingCall = ({ callerId, callerSocketId, callerUserId, callerName, callType, offer }) => {
      if (callState.status !== 'idle') {
        socket.emit('reject-call', {
          callerSocketId: callerSocketId || callerId,
          rejectedBy: user.username
        });
        return;
      }
      incomingOfferRef.current = offer;
      setCallState({
        status: 'incoming',
        callType,
        direction: 'incoming',
        peerSocketId: callerSocketId || callerId,
        peerUserId: callerUserId,
        peerName: callerName
      });
      toast(`${callerName} is calling you${callType === 'video' ? ' (video)' : ''}`);
      addCallMessage(callerName, 'incoming', callType);
    };

    const handleCallRejected = ({ rejectedBy }) => {
      toast.error(`${rejectedBy} rejected your call`);
      addCallMessage(rejectedBy, 'missed', callState.callType || 'audio');
      resetCallState();
    };

    const handleCallEnded = ({ endedBy }) => {
      toast(`Call ended by ${endedBy}`);
      resetCallState();
    };

    const handleCallAccepted = async ({ acceptedBy, answer, receiverSocketId }) => {
      try {
        clearCallTimeout();
        setCallState((state) => ({
          ...state,
          status: 'active',
          peerSocketId: receiverSocketId || state.peerSocketId,
          peerName: acceptedBy || state.peerName
        }));
        if (answer && peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingIceCandidates();
        }
        setIsCalling(false);
        toast.success(`${acceptedBy || 'User'} accepted your call`);
      } catch (error) {
        toast.error('Could not connect the call');
        resetCallState();
      }
    };

    const handleCallUnavailable = ({ message }) => {
      toast.error(message || 'User is unavailable');
      resetCallState();
    };

    const handleIceCandidate = async ({ candidate }) => {
      if (!candidate) return;
      const pc = peerConnectionRef.current;
      if (!pc?.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };

    const handleUserTyping = ({ userId }) => {
      if (userId !== user.id) {
        setIsTyping(true);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
        }, 3000);
      }
    };

    const handleStopTyping = ({ userId }) => {
      if (userId !== user.id) {
        setIsTyping(false);
      }
    };

    const handleMessageDeleted = ({ messageId }) => {
      removeMessage(messageId);
      console.log('Message deleted:', messageId);
    };

    const handleUnreadNotification = ({ senderId, senderName, message }) => {
      // This is handled in ChatList, just log it here
      console.log('Unread notification:', message);
    };

    socket.on('receive-message', handleReceiveMessage);
    socket.on('message-reacted', handleMessageReacted);
    socket.on('message-edited', handleMessageEdited);
    socket.on('message-delivery-update', handleDeliveryUpdate);
    socket.on('mark-delivered', handleMarkDelivered);
    socket.on('message-pinned', handlePinned);
    socket.on('message-unpinned', handlePinned);
    socket.on('chat-wallpaper-updated', handleWallpaper);
    socket.on('scheduled-message-sent', handleReceiveMessage);
    socket.on('mention-notification', ({ chatId, senderName }) => {
      if (chatId === chat._id) toast(`${senderName} mentioned you`, { icon: '🔔' });
    });
    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-accepted', handleCallAccepted);
    socket.on('call-rejected', handleCallRejected);
    socket.on('call-ended', handleCallEnded);
    socket.on('call-unavailable', handleCallUnavailable);
    socket.on('webrtc-ice-candidate', handleIceCandidate);
    socket.on('user-typing', handleUserTyping);
    socket.on('stop-typing', handleStopTyping);
    socket.on('message-deleted', handleMessageDeleted);
    socket.on('unread-notification', handleUnreadNotification);
    socket.on('poll-updated', (updatedPoll) => {
      if (updatedPoll.chatId === chat._id) {
        useChatStore.getState().updateMessage(updatedPoll);
      }
    });
    socket.on('giftcard-redeemed', ({ messageId }) => {
      // Fetch fresh messages or toggle redeemed state locally
      axios.get(`/api/messages/${chat._id}`).then(res => {
        useChatStore.getState().setMessages(res.data);
      });
    });
    socket.on('new-event', (event) => {
      if (event.chatId === chat._id) {
        setExtractedEvents(prev => [...prev, event]);
        toast(`📅 New Event: ${event.title} on ${event.date} at ${event.time}`, { duration: 8000, icon: '🗓️' });
      }
    });
    socket.on('event-expired', ({ eventId }) => {
      setExtractedEvents(prev => prev.filter(e => e._id !== eventId));
    });

    return () => {
      socket.off('receive-message', handleReceiveMessage);
      socket.off('message-reacted', handleMessageReacted);
      socket.off('message-edited', handleMessageEdited);
      socket.off('message-delivery-update', handleDeliveryUpdate);
      socket.off('mark-delivered', handleMarkDelivered);
      socket.off('message-pinned', handlePinned);
      socket.off('message-unpinned', handlePinned);
      socket.off('chat-wallpaper-updated', handleWallpaper);
      socket.off('scheduled-message-sent');
      socket.off('mention-notification');
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-accepted', handleCallAccepted);
      socket.off('call-rejected', handleCallRejected);
      socket.off('call-ended', handleCallEnded);
      socket.off('call-unavailable', handleCallUnavailable);
      socket.off('webrtc-ice-candidate', handleIceCandidate);
      socket.off('user-typing', handleUserTyping);
      socket.off('stop-typing', handleStopTyping);
      socket.off('message-deleted', handleMessageDeleted);
      socket.off('unread-notification', handleUnreadNotification);
      socket.off('poll-updated');
      socket.off('giftcard-redeemed');
      socket.off('new-event');
      socket.off('event-expired');
    };
  }, [socket, chat._id, user.id, user.username, addMessage, removeMessage, callState.status, callState.callType]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
        setShowBgMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const addCallMessage = (userName, type, callType) => {
    let content = '';
    
    if (type === 'incoming') {
      content = `📞 Incoming ${callType} call`;
    } else if (type === 'outgoing') {
      content = `📞 Outgoing ${callType} call`;
    } else if (type === 'missed') {
      content = `📞 Missed ${callType} call`;
    }

    const message = {
      _id: Date.now().toString(),
      chatId: chat._id,
      senderId: { _id: otherUser?._id, username: userName, profilePicture: otherUser?.profilePicture },
      content: content,
      messageType: 'call',
      callType: callType,
      createdAt: new Date()
    };
    addMessage(message);
  };

  const startOutgoingCall = async (callType) => {
    if (!otherUser) {
      toast.error('User not found');
      return;
    }
    if (!socket) {
      toast.error('Socket is not connected');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera/microphone is not supported in this browser');
      return;
    }

    try {
      setIsCalling(true);
      setCallState({
        status: 'outgoing',
        callType,
        direction: 'outgoing',
        peerSocketId: null,
        peerUserId: otherUser._id,
        peerName: otherUser.username
      });

      const stream = await getLocalMedia(callType);
      const pc = createPeerConnection({ userId: otherUser._id });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('initiate-call', {
        receiverId: otherUser._id,
        callerUserId: user.id,
        callType,
        callerName: user.username,
        offer
      });

      addCallMessage(user.username, 'outgoing', callType);
      toast.loading(`${callType === 'video' ? 'Video c' : 'C'}alling ${otherUser.username}...`, { duration: 3000 });
      startCallTimeout(callType);
    } catch (error) {
      console.error('Call start failed:', error);
      setIsCalling(false);
      resetCallState();
      toast.error(error.name === 'NotAllowedError' ? 'Allow camera/microphone permission to call' : 'Could not start call');
    }
  };

  const acceptIncomingCall = async () => {
    if (!socket || !incomingOfferRef.current) return;
    try {
      const { callType, peerSocketId, peerName } = callState;
      const stream = await getLocalMedia(callType);
      const pc = createPeerConnection({ socketId: peerSocketId });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current));
      await flushPendingIceCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('accept-call', {
        callerSocketId: peerSocketId,
        callerId: peerSocketId,
        acceptedBy: user.username,
        answer
      });
      setCallState((state) => ({ ...state, status: 'active' }));
      toast.success(`Connected with ${peerName}`);
    } catch (error) {
      console.error('Accept call failed:', error);
      toast.error(error.name === 'NotAllowedError' ? 'Allow camera/microphone permission to accept' : 'Could not accept call');
      rejectIncomingCall();
    }
  };

  const rejectIncomingCall = () => {
    if (socket && callState.peerSocketId) {
      socket.emit('reject-call', {
        callerSocketId: callState.peerSocketId,
        callerId: callState.peerSocketId,
        rejectedBy: user.username
      });
    }
    resetCallState();
  };

  const endActiveCall = () => {
    if (socket && callState.status !== 'idle') {
      socket.emit('end-call', {
        targetSocketId: callState.peerSocketId,
        recipientId: callState.peerUserId || otherUser?._id,
        endedBy: user.username
      });
    }
    resetCallState();
  };

  const handleAudioCall = () => {
    startOutgoingCall('audio');
  };

  const handleVideoCall = () => {
    startOutgoingCall('video');
  };

  const handleDeleteGroup = async () => {
    if (window.confirm('Are you sure you want to delete this group? This will delete all messages and remove the group for everyone.')) {
      try {
        await deleteChat(chat._id);
        toast.success('Group deleted successfully');
        navigate('/chats');
      } catch (error) {
        toast.error('Failed to delete group');
        console.error('Error deleting group:', error);
      }
    }
    setShowMenu(false);
    setShowBgMenu(false);
  };

  const handleLeaveGroup = async () => {
    const confirmMsg = chat.admin === user.id
      ? 'You are the Admin of this group. Leaving will assign a new Admin and remove you. Are you sure you want to leave?'
      : 'Are you sure you want to leave this group?';
      
    if (window.confirm(confirmMsg)) {
      try {
        await leaveGroup(chat._id);
        toast.success('You left the group successfully');
        navigate('/chats');
      } catch (error) {
        toast.error('Failed to leave group');
        console.error('Error leaving group:', error);
      }
    }
    setShowMenu(false);
    setShowBgMenu(false);
  };

  const handleRemoveParticipant = async (participantId, username) => {
    if (window.confirm(`Are you sure you want to remove ${username} from the group?`)) {
      try {
        const res = await axios.post(`/api/chats/${chat._id}/remove-participant`, {
          participantId
        });
        updateChats(res.data);
        setCurrentChat(res.data);
        toast.success(`${username} removed successfully`);
      } catch (error) {
        toast.error('Failed to remove member');
        console.error('Error removing member:', error);
      }
    }
  };

  const handleDismissEvent = async (eventId, idx) => {
    try {
      if (eventId) {
        await axios.delete(`/api/messages/events/${eventId}`);
      }
      setExtractedEvents(prev => prev.filter((_, i) => i !== idx));
      toast.success('Event dismissed');
    } catch (error) {
      console.error('Error dismissing event:', error);
      toast.error('Failed to dismiss event');
    }
  };

  const handleClearChat = async () => {
    if (window.confirm('Are you sure you want to clear all messages in this chat? This cannot be undone.')) {
      try {
        await axios.delete(`/api/chats/${chat._id}/messages`);
        // Reload messages
        await fetchMessages(chat._id);
        toast.success('Chat cleared successfully');
      } catch (error) {
        toast.error('Failed to clear chat');
        console.error('Error:', error);
      }
    }
    setShowMenu(false);
    setShowBgMenu(false);
  };

  const handleViewProfile = () => {
    if (otherUser) {
      navigate(`/profile/${otherUser._id}`);
      setShowMenu(false);
      setShowBgMenu(false);
    }
  };

  const handleColorChange = (color) => {
    setChatBg(color);
    localStorage.setItem(`chatBg_${chat._id}`, color);
    setShowBgMenu(false);
    setShowMenu(false);
    toast.success('Background color changed');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const bgUrl = `url(${event.target.result})`;
        const wallpaperUrl = event.target.result;
        setChatBg(bgUrl);
        localStorage.setItem(`chatBg_${chat._id}`, bgUrl);
        setShowBgMenu(false);
        setShowMenu(false);
        try {
          const token = localStorage.getItem('token');
          await axios.put(`/api/messaging/chat/${chat._id}/wallpaper`, { wallpaperUrl }, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch { /* local only */ }
        toast.success('Chat wallpaper updated');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleJumpToMessage = (messageId) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('search-match');
      setTimeout(() => el.classList.remove('search-match'), 2000);
    }
  };

  const toggleMessageSelect = (id) => {
    setSelectedMessageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (!selectedMessageIds.length) return;
    const forEveryone = window.confirm('Delete selected for everyone? (Cancel = for you only)');
    const token = localStorage.getItem('token');
    for (const id of selectedMessageIds) {
      try {
        await axios.delete(`/api/messaging/${id}?forEveryone=${forEveryone}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        removeMessage(id);
      } catch { /* skip */ }
    }
    setSelectedMessageIds([]);
    setMultiSelectMode(false);
    toast.success('Bulk delete complete');
  };

  const getBackgroundStyle = () => {
    if (chatBg.startsWith('url')) {
      return {
        background: chatBg,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      };
    }
    return {
      background: chatBg,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  };

  return (
    <div
      className={`chat-window ${isVanishActive ? 'vanish-mode-active' : ''} ${chat?.chatTheme?.preset ? 'themed-chat' : ''}`}
      style={{ ...getBackgroundStyle(), ...chatThemeStyle }}
    >
      {/* Header */}
      <div className="chat-header">
        <button className="back-btn" onClick={() => navigate('/chats')}>
          <FiArrowLeft size={24} />
        </button>
        
        <div className="header-info">
          {chat.isGroupChat ? (
            <>
              <div className="header-avatar-wrapper" onClick={() => setShowGroupModal(true)} style={{ cursor: 'pointer' }}>
                <img 
                  src={chat.groupImage || '/default-avatar.png'} 
                  alt={chat.groupName}
                  className="header-user-avatar"
                />
              </div>
              <div className="header-user-info" onClick={() => setShowGroupModal(true)} style={{ cursor: 'pointer' }}>
                <h3>{chat.groupName}</h3>
                <p className="user-status">
                  {chat.participants?.length || 0} members
                </p>
              </div>
            </>
          ) : otherUser && (
            <>
              <div className="header-avatar-wrapper" onClick={handleViewProfile} style={{ cursor: 'pointer' }}>
                <img 
                  src={otherUser.profilePicture || '/default-avatar.png'} 
                  alt={otherUser.username}
                  className="header-user-avatar"
                />
                <span className={`status-indicator ${otherUser.status}`}></span>
              </div>
              <div className="header-user-info" onClick={handleViewProfile} style={{ cursor: 'pointer' }}>
                <h3>{otherUser.username} {chat.isSecretChat && '🔒'}</h3>
                <p className="user-status">
                  {otherMood?.emoji && otherMood?.text
                    ? `${otherMood.emoji} ${otherMood.text}`
                    : otherUser.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                </p>
                <MusicStatus userId={otherUser._id} />
              </div>
            </>
          )}
        </div>

        <div className="header-actions">
          <button 
            className="call-btn audio-call"
            onClick={handleAudioCall}
            disabled={isCalling}
            title="Audio Call"
          >
            <FiPhone size={20} />
          </button>
          
          <button 
            className="call-btn video-call"
            onClick={handleVideoCall}
            disabled={isCalling}
            title="Video Call"
          >
            <FiVideo size={20} />
          </button>

          <button
            className={`call-btn desktop-chat-tool ${showChatSearch ? 'active' : ''}`}
            onClick={() => setShowChatSearch(!showChatSearch)}
            title="Search in chat"
          >
            <FiSearch size={18} />
          </button>

          {/* AI Chat Summarizer (TL;DR) Button */}
          <button 
            className="call-btn tldr-btn desktop-chat-tool"
            onClick={handleFetchTldr}
            title="AI TL;DR Chat Summary"
            style={{ fontSize: '1.2rem', padding: '6px' }}
          >
            💡
          </button>

          {/* Real-Time Shared Whiteboard Button */}
          <button 
            className="call-btn whiteboard-btn desktop-chat-tool"
            onClick={() => setShowCanvas(true)}
            title="Draw / Shared Whiteboard"
          >
            <FiEdit size={18} />
          </button>

          {/* Interactive Student Workspace (Group Chats Only) */}
          {chat.isGroupChat && (
            <button 
              className="call-btn workspace-btn desktop-chat-tool"
              onClick={() => setShowWorkspace(true)}
              title="Interactive Student Workspace"
              style={{ fontSize: '1.2rem', padding: '6px' }}
            >
              📚
            </button>
          )}

          {/* Opt-In Sentiment & vibe dashboard button */}
          <button 
            className="call-btn sentiment-btn desktop-chat-tool"
            onClick={() => setShowSentiment(true)}
            title="Vibe & Sentiment Dashboard"
            style={{ fontSize: '1.2rem', padding: '6px' }}
          >
            📊
          </button>

          {/* Group Shared Calendar Button */}
          {chat.isGroupChat && (
            <button 
              className="call-btn calendar-btn desktop-chat-tool"
              onClick={() => setShowCalendar(true)}
              title="Shared Calendar & Group Events"
              style={{ fontSize: '1.2rem', padding: '6px' }}
            >
              📅
            </button>
          )}

          {chat.isGroupChat && (
            <button
              className="call-btn group-settings-btn desktop-chat-tool"
              onClick={() => setShowGroupSettings(true)}
              title="Group roles, invites, slow mode (#101–107)"
            >
              <FiSettings size={18} />
            </button>
          )}

          {/* In-Chat Mini Games Console Button */}
          <button 
            className="call-btn games-btn desktop-chat-tool"
            onClick={() => setShowGameConsole(!showGameConsole)}
            title="Mini Games Console"
            style={{ fontSize: '1.2rem', padding: '6px' }}
          >
            🎮
          </button>

          <button
            className="call-btn extras-btn desktop-chat-tool"
            onClick={() => setShowChatExtras(true)}
            title="Watch party, voice lounge, themes (#35–39)"
            style={{ fontSize: '1.2rem', padding: '6px' }}
          >
            ✨
          </button>

          {/* Vanish Mode Switch */}
          <div className="vanish-toggle-wrapper desktop-chat-tool" title="Vanish Mode (1-min Self-Destruct)">
            <span className="vanish-label">💨 Vanish</span>
            <label className="vanish-switch">
              <input 
                type="checkbox" 
                checked={isVanishActive}
                onChange={(e) => setIsVanishActive(e.target.checked)}
              />
              <span className="vanish-slider round"></span>
            </label>
          </div>
          
          <div className="mobile-chat-actions">
            <button
              className={`call-btn mobile-tools-btn ${showActionMenu ? 'active' : ''}`}
              onClick={() => {
                setShowActionMenu(!showActionMenu);
                setShowMenu(false);
                setShowBgMenu(false);
              }}
              title="Chat tools"
              type="button"
            >
              <FiMoreVertical size={20} />
            </button>

            {showActionMenu && (
              <div className="mobile-chat-actions-panel">
                <button type="button" onClick={() => { setShowChatSearch(true); setShowActionMenu(false); }}>
                  <FiSearch size={17} />
                  <span>Search chat</span>
                </button>
                <button type="button" onClick={() => { handleFetchTldr(); setShowActionMenu(false); }}>
                  <span>ðŸ’¡</span>
                  <span>AI summary</span>
                </button>
                <button type="button" onClick={() => { setShowCanvas(true); setShowActionMenu(false); }}>
                  <FiEdit size={17} />
                  <span>Whiteboard</span>
                </button>
                {chat.isGroupChat && (
                  <button type="button" onClick={() => { setShowWorkspace(true); setShowActionMenu(false); }}>
                    <span>ðŸ“š</span>
                    <span>Study workspace</span>
                  </button>
                )}
                <button type="button" onClick={() => { setShowSentiment(true); setShowActionMenu(false); }}>
                  <span>ðŸ“Š</span>
                  <span>Sentiment</span>
                </button>
                {chat.isGroupChat && (
                  <button type="button" onClick={() => { setShowCalendar(true); setShowActionMenu(false); }}>
                    <span>ðŸ“…</span>
                    <span>Calendar</span>
                  </button>
                )}
                {chat.isGroupChat && (
                  <button type="button" onClick={() => { setShowGroupSettings(true); setShowActionMenu(false); }}>
                    <FiSettings size={17} />
                    <span>Group settings</span>
                  </button>
                )}
                <button type="button" onClick={() => { setShowGameConsole(true); setShowActionMenu(false); }}>
                  <span>ðŸŽ®</span>
                  <span>Games</span>
                </button>
                <button type="button" onClick={() => { setShowChatExtras(true); setShowActionMenu(false); }}>
                  <span>âœ¨</span>
                  <span>Extras</span>
                </button>
                <button type="button" onClick={() => setIsVanishActive((active) => !active)}>
                  <span>ðŸ’¨</span>
                  <span>{isVanishActive ? 'Turn vanish off' : 'Turn vanish on'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="menu-container" ref={menuRef}>
            <button 
              className="menu-btn"
              onClick={() => {
                setShowMenu(!showMenu);
                setShowBgMenu(false);
              }}
              title="More Options"
            >
              <FiMoreVertical size={20} />
            </button>

            {showMenu && (
              <div className="dropdown-menu">
                {chat.isGroupChat ? (
                  <>
                    <button onClick={() => { setShowGroupModal(true); setShowMenu(false); }} className="menu-option">
                      <span>👥</span>
                      <span>View Group Profile</span>
                    </button>
                    <button onClick={() => { setShowGroupSettings(true); setShowMenu(false); }} className="menu-option">
                      <span>⚙️</span>
                      <span>Group Settings (#101–107)</span>
                    </button>
                    <button onClick={handleLeaveGroup} className="menu-option danger">
                      <span>🚪</span>
                      <span>Leave Group</span>
                    </button>
                    {chat.admin === user.id && (
                      <>
                        <button onClick={() => { setShowAddMembersModal(true); setShowMenu(false); }} className="menu-option">
                          <span>➕</span>
                          <span>Add Friends</span>
                        </button>
                        <button onClick={handleDeleteGroup} className="menu-option danger">
                          <span>🗑️</span>
                          <span>Delete Group</span>
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <button onClick={handleViewProfile} className="menu-option">
                    <span>👤</span>
                    <span>View Profile</span>
                  </button>
                )}

                <button onClick={handleClearChat} className="menu-option danger">
                  <span>🗑️</span>
                  <span>Clear Chat</span>
                </button>
                
                <div className="menu-divider"></div>

                <div className="menu-submenu">
                  <button 
                    onClick={() => setShowBgMenu(!showBgMenu)}
                    className="menu-option"
                  >
                    <span>🎨</span>
                    <span>Change Background</span>
                    <span className="menu-arrow">›</span>
                  </button>

                  {showBgMenu && (
                    <div className="bg-submenu">
                      <div className="submenu-section">
                        <p className="submenu-title">Colors</p>
                        <div className="color-options">
                          {colors.map((color, idx) => (
                            <button
                              key={idx}
                              className="color-option"
                              style={{ backgroundColor: color }}
                              onClick={() => handleColorChange(color)}
                              title={color}
                            >
                              {chatBg === color && <span className="checkmark">✓</span>}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="submenu-divider"></div>

                      <div className="submenu-section">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          hidden
                        />
                        <button
                          className="menu-option photo-option"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <span>📸</span>
                          <span>Add Photo</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI-Extracted Event Cards */}
      {extractedEvents.length > 0 && (
        <div className="event-cards-strip">
          {extractedEvents.map((ev, idx) => (
            <div key={idx} className="event-card">
              <span className="event-card-icon">🗓️</span>
              <div className="event-card-body">
                <p className="event-card-title">{ev.title}</p>
                <p className="event-card-details">{ev.date} · {ev.time} {ev.location ? `· 📍 ${ev.location}` : ''}</p>
              </div>
              <button className="event-card-dismiss" onClick={() => handleDismissEvent(ev._id, idx)} title="Dismiss">✕</button>
            </div>
          ))}
        </div>
      )}

      {showChatSearch && (
        <div className="chat-search-panel">
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <span className="search-results-count">
            {searchQuery
              ? `${messages.filter((m) => m.content?.toLowerCase().includes(searchQuery.toLowerCase())).length} matches`
              : ''}
          </span>
          <button className="call-btn" onClick={() => { setShowChatSearch(false); setSearchQuery(''); }}><FiX size={18} /></button>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="pinned-messages-bar">
          <span style={{ fontSize: 12, opacity: 0.8 }}>📌</span>
          {pinnedMessages.map((pm) => (
            <div key={pm._id} className="pinned-chip" onClick={() => handleJumpToMessage(pm._id)}>
              <span>{pm.senderId?.username}: {(pm.content || '').slice(0, 30)}...</span>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const token = localStorage.getItem('token');
                  await axios.delete(`/api/messaging/${pm._id}/pin`, { headers: { Authorization: `Bearer ${token}` } });
                  setPinnedMessages((prev) => prev.filter((p) => p._id !== pm._id));
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Vanish Mode Alert Banner */}
      {isVanishActive && (
        <div className="vanish-mode-warning-banner animate-pulse">
          <span>💨 Vanish Mode Active: Messages disappear 1 minute after read</span>
        </div>
      )}

      {/* Roommate Billing Ledger Dashboard */}
      {chat.isSplitGroup && (
        <div className="roommate-ledger-panel">
          <div className="ledger-header">
            <h4>🏠 Roommates Monthly Dues Ledger</h4>
            <span className="current-month-badge">
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="ledger-summary-grid">
            <div className="summary-card">
              <span className="card-lbl">Due Date</span>
              <span className="card-val">Day {chat.splitDueDate || 5}</span>
            </div>
            <div className="summary-card">
              <span className="card-lbl">Total Rent & Splits</span>
              <span className="card-val">${chat.fixedSplits?.reduce((acc, c) => acc + c.amount, 0) || 0}</span>
            </div>
            <div className="summary-card">
              <span className="card-lbl">Your Monthly Share</span>
              <span className="card-val">
                ${(chat.fixedSplits?.reduce((acc, c) => acc + c.amount, 0) / (chat.participants?.length || 1)).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Individual cost breakdown rows */}
          {chat.fixedSplits && chat.fixedSplits.length > 0 && (
            <div className="ledger-breakdown" style={{ marginTop: '12px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>📋 Monthly Cost Breakdown</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {chat.fixedSplits.map((split, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#e2e8f0' }}>
                    <span style={{ color: '#94a3b8' }}>• {split.label}</span>
                    <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>${split.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="roommates-payment-list">
            {chat.participants?.map(roommate => {
              const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
              const payment = chat.payments?.find(
                p => p.user?.toString() === roommate._id && p.month === currentMonthStr
              );
              const isPaid = payment?.paid || false;

              return (
                <div key={roommate._id} className={`roommate-payment-row ${isPaid ? 'paid' : 'pending'}`}>
                  <div className="roommate-info">
                    <img src={roommate.profilePicture || '/default-avatar.png'} alt={roommate.username} className="roommate-avatar" />
                    <div>
                      <span className="roommate-name">
                        {roommate.username} {roommate._id === user.id ? '(You)' : ''}
                      </span>
                      <span className="payment-date">
                        {isPaid ? `Paid: ${new Date(payment.date).toLocaleDateString()}` : 'Dues outstanding'}
                      </span>
                    </div>
                  </div>

                  <div className="payment-action">
                    {isPaid ? (
                      <span className="paid-badge">✅ Settled</span>
                    ) : (
                      <>
                        {roommate._id === user.id ? (
                          <button 
                            className="settle-dues-btn"
                            onClick={async () => {
                              try {
                                const token = localStorage.getItem('token');
                                const response = await axios.post(`/api/chats/${chat._id}/split/settle`, { month: currentMonthStr }, {
                                  headers: { 'Authorization': `Bearer ${token}` }
                                });
                                toast.success('Dues settled successfully!');
                                setCurrentChat(response.data);
                              } catch (err) {
                                toast.error('Failed to settle dues.');
                              }
                            }}
                          >
                            💸 Settle Dues
                          </button>
                        ) : (
                          <span className="pending-badge">⏳ Unpaid</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <MessageList 
        messages={messages} 
        currentUserId={user.id}
        otherUser={otherUser}
        onReply={setReplyingTo}
        vanishTimers={vanishTimers}
        searchQuery={searchQuery}
        chats={chats}
        messageRefs={messageRefs}
        onJumpToMessage={handleJumpToMessage}
        multiSelectMode={multiSelectMode}
        selectedMessageIds={selectedMessageIds}
        onToggleSelect={toggleMessageSelect}
        onEnterMultiSelect={(id) => {
          setMultiSelectMode(true);
          setSelectedMessageIds([id]);
        }}
        onPinChange={async () => {
          try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`/api/messaging/chat/${chat._id}/pinned`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            setPinnedMessages(res.data);
          } catch { /* ignore */ }
        }}
        onSendSmartReply={async (text) => {
          try {
            const response = await axios.post('/api/messages', {
              chatId: chat._id,
              recipientId: otherUser?._id,
              content: text,
              messageType: 'text',
              isVanish: isVanishActive
            });
            addMessage(response.data);
            if (socket) {
              socket.emit('send-message', {
                ...response.data,
                recipientId: otherUser?._id
              });
            }
          } catch (err) {
            toast.error('Failed to send smart reply');
          }
        }}
      />

      {multiSelectMode && (
        <div className="multi-select-toolbar">
          <span>{selectedMessageIds.length} selected</span>
          <button onClick={handleBulkDelete} style={{ background: '#ef4444', color: 'white' }}>Delete</button>
          <button onClick={() => { setMultiSelectMode(false); setSelectedMessageIds([]); }}>Cancel</button>
        </div>
      )}

      {/* Typing Indicator */}
      {isTyping && (
        <div className="typing-indicator">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <span>Typing...</span>
        </div>
      )}

      {/* Input Area */}
      {chat.isSplitGroup ? (
        <div className="billing-vault-input-blocked">
          <span>🔒 Roommate Billing Vault: Normal messaging is disabled. Settle your dues using the monthly dashboard ledger above.</span>
        </div>
      ) : (
        <>
          {chat.isGroupChat && groupPerms.myRole === 'readonly' && (
            <div className="readonly-notice">You have read-only access in this group (#101).</div>
          )}
          {chat.isGroupChat && !groupPerms.canSend && groupPerms.waitSeconds > 0 && (
            <div className="slow-mode-banner">
              Slow mode active — wait {groupPerms.waitSeconds}s before sending (#106).
            </div>
          )}
          <MessageInput
            chat={chat}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            isVanishActive={isVanishActive}
            groupPerms={chat.isGroupChat ? groupPerms : null}
            onMessageSent={chat.isGroupChat ? refreshGroupPerms : undefined}
          />
        </>
      )}

      {/* Multiplayer Canvas Whiteboard Overlay */}
      {showCanvas && (
        <CanvasDrawing 
          onClose={() => setShowCanvas(false)}
          socket={socket}
          chatId={chat._id}
          recipientId={otherUser?._id}
          participants={chat.participants}
          user={user}
        />
      )}

      {/* Interactive Student Workspace */}
      {showWorkspace && (
        <WorkspaceTutor 
          chat={chat}
          onClose={() => setShowWorkspace(false)}
        />
      )}

      {/* Real-time Sentiment Analytics Dashboard Overlay */}
      {showSentiment && (
        <SentimentDashboard 
          chat={chat}
          onClose={() => setShowSentiment(false)}
        />
      )}

      {/* AI TL;DR Sliding Glass Panel */}
      {showTldr && (
        <div className="tldr-sidebar-overlay" onClick={() => setShowTldr(false)}>
          <div className="tldr-sidebar-card" onClick={e => e.stopPropagation()}>
            <div className="tldr-header">
              <span className="sparkles">✨ AI TL;DR Summary</span>
              <button className="tldr-close-btn" onClick={() => setShowTldr(false)}>
                <FiX size={18} />
              </button>
            </div>
            <div className="tldr-content">
              {loadingTldr ? (
                <div className="tldr-loader">
                  <div className="tldr-spinner"></div>
                  <p>Analyzing chat with Kane...</p>
                </div>
              ) : (
                <div className="tldr-text">
                  {tldrData ? (
                    tldrData.split('\n').map((line, i) => (
                      <p key={i} className="tldr-line">{line}</p>
                    ))
                  ) : (
                    <p className="tldr-loading-text">Generating key bullet points...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showGroupSettings && chat.isGroupChat && (
        <GroupSettingsModal
          chat={chat}
          currentUserId={user.id}
          onClose={() => setShowGroupSettings(false)}
          onUpdated={refreshGroupPerms}
        />
      )}

      {/* Group Profile Modal */}
      {showGroupModal && createPortal(
        <div className="group-modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="group-modal" onClick={(e) => e.stopPropagation()}>
            <div className="group-modal-header">
              <h3>Group Profile</h3>
              <button className="group-modal-close" onClick={() => setShowGroupModal(false)}>
                <FiX size={20} />
              </button>
            </div>
            
            <div className="group-modal-body">
              <div className="group-modal-avatar-section">
                <img 
                  src={chat.groupImage || '/default-avatar.png'} 
                  alt={chat.groupName} 
                  className="group-modal-avatar"
                />
                <h2>{chat.groupName}</h2>
                <p className="group-modal-desc">
                  {chat.groupDescription || 'No description provided.'}
                </p>
              </div>
              
              <div className="group-modal-members-section">
                <h4>Members ({chat.participants?.length || 0})</h4>
                <div className="group-modal-members-list">
                  {chat.participants?.map(member => {
                    const isMemberAdmin = chat.admin === member._id;
                    const isCurrentUser = user.id === member._id;
                    return (
                      <div key={member._id} className="group-member-item">
                        <div className="member-avatar-wrapper">
                          <img 
                            src={member.profilePicture || '/default-avatar.png'} 
                            alt={member.username} 
                            className="member-avatar"
                          />
                          <span className={`status-indicator ${member.status}`}></span>
                        </div>
                        <div className="member-details">
                          <span className="member-name">
                            {member.username} {isCurrentUser && ' (You)'}
                          </span>
                          <span className="member-status-text">
                            {member.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                          </span>
                        </div>
                        {isMemberAdmin ? (
                          <span className="admin-badge">👑 Admin</span>
                        ) : (
                          chat.admin === user.id && (
                            <button 
                              className="member-remove-btn" 
                              onClick={() => handleRemoveParticipant(member._id, member.username)}
                              title={`Remove ${member.username}`}
                            >
                              ✕
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Add Friends Modal */}
      {showAddMembersModal && createPortal(
        <AddMembersModal 
          chat={chat} 
          onClose={() => setShowAddMembersModal(false)} 
          user={user} 
          updateChats={updateChats} 
          setCurrentChat={setCurrentChat} 
        />,
        document.body
      )}

      {/* Shared Calendar Modal Overlay */}
      {showCalendar && (
        <SharedCalendar
          chat={chat}
          onClose={() => setShowCalendar(false)}
          socket={socket}
          user={user}
        />
      )}

      {/* Mini Games Console Floating Panel */}
      {kaneRefereeMsg && (
        <div className="kane-referee-banner" onClick={() => setKaneRefereeMsg('')}>
          🤖 Kane (#52): {kaneRefereeMsg}
        </div>
      )}

      {showChatExtras && (
        <ChatExtrasPanel chat={chat} onClose={() => setShowChatExtras(false)} />
      )}

      {callState.status !== 'idle' && (
        <div className="call-overlay">
          <div className={`call-card ${callState.callType}`}>
            <div className="call-card-header">
              <span>{callState.callType === 'video' ? 'Video call' : 'Audio call'}</span>
              <strong>{callState.peerName || otherUser?.username || 'Contact'}</strong>
              <small>
                {callState.status === 'incoming' && 'Incoming call'}
                {callState.status === 'outgoing' && 'Ringing...'}
                {callState.status === 'active' && 'Connected'}
              </small>
            </div>

            <div className="call-video-stage">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`remote-video ${callState.callType === 'audio' ? 'audio-only' : ''}`}
              />
              {callState.callType === 'audio' && (
                <div className="audio-call-avatar">
                  <img src={otherUser?.profilePicture || '/default-avatar.png'} alt={callState.peerName || 'Caller'} />
                  <span>{callState.peerName || otherUser?.username || 'Caller'}</span>
                </div>
              )}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`local-video ${callState.callType === 'audio' ? 'hidden' : ''}`}
              />
            </div>

            <div className="call-controls">
              {callState.status === 'incoming' ? (
                <>
                  <button type="button" className="accept-call-btn" onClick={acceptIncomingCall}>
                    <FiPhone /> Accept
                  </button>
                  <button type="button" className="end-call-btn" onClick={rejectIncomingCall}>
                    <FiPhoneOff /> Reject
                  </button>
                </>
              ) : (
                <button type="button" className="end-call-btn" onClick={endActiveCall}>
                  <FiPhoneOff /> End call
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showGameConsole && (
        <div className="game-console-overlay-wrapper" onClick={() => setShowGameConsole(false)}>
          <div className="game-console-card-container" onClick={e => e.stopPropagation()}>
            <div className="game-console-header">
              <span>🎮 Mini Games Console</span>
              <button onClick={() => setShowGameConsole(false)} className="game-console-close-btn">✕</button>
            </div>
            <GameMessage chatId={chat._id} currentUserId={user.id} socket={socket} />
          </div>
        </div>
      )}
    </div>
  );
}

// Add members helper component
function AddMembersModal({ chat, onClose, user, updateChats, setCurrentChat }) {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await axios.get(`/api/users/profile/${user.id}`);
        setContacts(res.data.contacts || []);
      } catch (err) {
        toast.error('Failed to load contacts');
      }
    };
    fetchContacts();
  }, [user.id]);

  // Filter out contacts who are already participants
  const addableContacts = contacts.filter(
    contact => !chat.participants.some(p => p._id === contact._id)
  );

  // Search filter
  const filteredContacts = addableContacts.filter(contact =>
    contact.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleAddSubmit = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one contact');
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.post(`/api/chats/${chat._id}/add-participants`, {
        participantIds: selectedIds
      });
      updateChats(res.data);
      setCurrentChat(res.data);
      toast.success('Members added successfully!');
      onClose();
    } catch (err) {
      toast.error('Failed to add members');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="group-modal-overlay" onClick={onClose}>
      <div className="group-modal add-members-modal" onClick={(e) => e.stopPropagation()}>
        <div className="group-modal-header">
          <h3>Add Friends to Group</h3>
          <button className="group-modal-close" onClick={onClose}>
            <FiX size={20} />
          </button>
        </div>

        <div className="group-modal-body">
          <div className="add-members-search">
            <FiSearch size={18} />
            <input
              type="text"
              placeholder="Search friends..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="add-members-list-section">
            <h4>Select Friends ({selectedIds.length} selected)</h4>
            <div className="add-members-list">
              {filteredContacts.length > 0 ? (
                filteredContacts.map(contact => {
                  const isChecked = selectedIds.includes(contact._id);
                  return (
                    <div 
                      key={contact._id} 
                      className={`add-member-item ${isChecked ? 'selected' : ''}`}
                      onClick={() => handleToggleSelect(contact._id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="member-avatar-wrapper">
                        <img 
                          src={contact.profilePicture || '/default-avatar.png'} 
                          alt={contact.username} 
                          className="member-avatar"
                        />
                        <span className={`status-indicator ${contact.status}`}></span>
                      </div>
                      <div className="member-details">
                        <span className="member-name">{contact.username}</span>
                        <span className="member-status-text">
                          {contact.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                        </span>
                      </div>
                      <div className="member-checkbox">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="no-addable-friends">
                  <p>No new friends to add</p>
                </div>
              )}
            </div>
          </div>

          <button 
            className="add-members-submit-btn" 
            onClick={handleAddSubmit}
            disabled={isLoading || selectedIds.length === 0}
          >
            {isLoading ? 'Adding...' : `Add to Group (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatWindow;
