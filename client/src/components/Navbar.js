import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocketStore } from '../store/socketStore';
import { FiMenu, FiX, FiMessageCircle, FiUsers, FiUser, FiImage, FiArrowUpCircle, FiLogOut, FiCompass, FiZap, FiBarChart2, FiAward, FiMusic, FiCpu, FiGrid, FiStar, FiGift, FiSliders } from 'react-icons/fi';
import StoryCreator from './StoryCreator';
import toast from 'react-hot-toast';
import axios from 'axios';
import '../styles/Navbar.css';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { getOrCreateChat, addMessage, currentChat, fetchChats } = useChatStore();
  const { socket } = useSocketStore();
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Global Snap Creator state
  const [showSnapCreator, setShowSnapCreator] = useState(false);
  const [snapData, setSnapData] = useState(null); // { content, mediaUrl, mediaType }
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Snap Score state
  const [snapScore, setSnapScore] = useState(0);
  const [snapScoreStatus, setSnapScoreStatus] = useState('active'); // active, warning, decayed, reset

  // Fetch snap score from API
  const fetchSnapScore = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await axios.get(`/api/snaps/score/${user.id}`);
      setSnapScore(res.data.snapScore || 0);
      // Derive overall status from friendScores
      const friendScores = res.data.friendScores || {};
      const statuses = Object.values(friendScores).map(f => f.status);
      if (statuses.includes('reset')) setSnapScoreStatus('reset');
      else if (statuses.includes('decayed')) setSnapScoreStatus('decayed');
      else if (statuses.includes('warning')) setSnapScoreStatus('warning');
      else setSnapScoreStatus('active');
    } catch (err) {
      // silently fail - user may not have snaps yet
    }
  }, [user?.id]);

  // Load snap score on mount and listen for real-time updates
  useEffect(() => {
    fetchSnapScore();
  }, [fetchSnapScore]);

  useEffect(() => {
    if (!socket) return;
    const handleScoreUpdate = () => fetchSnapScore();
    socket.on('snapScoreUpdated', handleScoreUpdate);
    return () => socket.off('snapScoreUpdated', handleScoreUpdate);
  }, [socket, fetchSnapScore]);

  // Fetch contacts for picker when modal is shown
  useEffect(() => {
    if (showContactPicker && user) {
      axios.get(`/api/users/profile/${user.id}`)
        .then(res => {
          setContacts(res.data.contacts || []);
        })
        .catch(err => {
          toast.error('Failed to load contacts');
          console.error(err);
        });
    }
  }, [showContactPicker, user]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  const handleToggleContact = (contactId) => {
    setSelectedContacts(prev => 
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSendSnapToSelected = async () => {
    if (selectedContacts.length === 0) {
      toast.error('Please select at least one friend!');
      return;
    }

    setIsSending(true);
    const toastId = toast.loading('Sending snap to friends...');
    try {
      const token = localStorage.getItem('token');
      for (const contactId of selectedContacts) {
        // 1. Get/Create the direct chat
        const chatDoc = await getOrCreateChat(contactId);

        // 2. Post Direct Ephemeral One-View Snap Message
        const response = await axios.post('/api/messages', {
          chatId: chatDoc._id,
          recipientId: contactId,
          content: '📷 Snap Sent',
          messageType: 'image',
          mediaUrl: snapData.mediaUrl,
          isSnap: true
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        // 3. Update the chatStore's active message list if currently chatting with this user
        if (currentChat && currentChat._id === chatDoc._id) {
          addMessage(response.data);
        }

        // 4. Dispatch Socket Event for real-time delivery
        if (socket) {
          socket.emit('send-message', {
            ...response.data,
            recipientId: contactId
          });
        }
      }
      toast.success('Snap successfully sent to selected friends!', { id: toastId });
      setShowContactPicker(false);
      setSnapData(null);
      setSelectedContacts([]);
      fetchChats();
    } catch (err) {
      console.error(err);
      toast.error('Failed to send snap.', { id: toastId });
    } finally {
      setIsSending(false);
    }
  };

  const filteredContacts = contacts.filter(c => 
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const primaryNavItems = [
    { path: '/chats', label: 'Messages', icon: FiMessageCircle },
    { path: '/groups/discover', label: 'Groups', icon: FiUsers },
    { path: '/contacts', label: 'Contacts', icon: FiUsers },
    { path: '/stories', label: 'Stories', icon: FiImage },
    { path: '/chat-history', label: 'History', icon: FiArrowUpCircle },
  ];

  const moreNavItems = [
    { path: '/daily-hub', label: 'Daily Hub', icon: FiCompass },
    { path: '/music', label: 'Music', icon: FiMusic },
    { path: '/kane', label: 'Kane AI', icon: FiCpu },
    { path: '/fun-zone', label: 'Fun Zone', icon: FiGrid },
    { path: '/extras', label: 'Extras', icon: FiStar },
    { path: '/advanced', label: 'AI Lab', icon: FiCpu },
    { path: '/automations', label: 'Rules', icon: FiSliders },
    { path: '/party', label: 'Party', icon: FiGift },
    { path: '/analytics', label: 'Analytics', icon: FiBarChart2 },
    { path: '/challenges', label: 'Challenges', icon: FiAward },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo" onClick={() => navigate('/chats')} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">💬</span>
            <div className="logo-text-container">
              <span className="logo-text">ChatFlow</span>
              <span className="logo-subtitle">Stay Connected</span>
            </div>
          </div>

          <button
            className="nav-toggle"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <FiX size={28} /> : <FiMenu size={28} />}
          </button>

          <div className="nav-menu">
            {primaryNavItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => {
                    navigate(item.path);
                    setIsMenuOpen(false);
                  }}
                  title={item.label}
                >
                  <Icon size={24} />
                  <span className="nav-label">{item.label}</span>
                </button>
              );
            })}

            <button
              className="global-snap-nav-btn"
              onClick={() => {
                setShowSnapCreator(true);
                setIsMenuOpen(false);
              }}
              title="Send One-View Snap"
            >
              <span className="snap-btn-emoji">⚡</span>
              <span className="nav-label" style={{ display: 'inline' }}>Snap</span>
            </button>

            <div className="more-menu-wrap">
              <button
                className={`nav-item more-menu-btn ${isMenuOpen ? 'active' : ''}`}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                title="More features"
                type="button"
              >
                {isMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
                <span className="nav-label">More</span>
              </button>

              {isMenuOpen && (
                <div className="more-menu-panel">
                  {moreNavItems.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.path}
                        className={`more-menu-item ${isActive(item.path) ? 'active' : ''}`}
                        onClick={() => {
                          navigate(item.path);
                          setIsMenuOpen(false);
                        }}
                        type="button"
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="nav-user">
            {/* ⚡ Snap Score Badge */}
            <div
              className={`snap-score-badge snap-score-${snapScoreStatus}`}
              title={`Your Snap Score: ${snapScore}\nStatus: ${snapScoreStatus.charAt(0).toUpperCase() + snapScoreStatus.slice(1)}`}
              onClick={() => navigate(`/profile/${user?.id}`)}
            >
              <FiZap size={13} />
              <span className="snap-score-number">{snapScore}</span>
              {snapScoreStatus === 'warning' && <span className="snap-score-status-icon">⚠️</span>}
              {snapScoreStatus === 'decayed' && <span className="snap-score-status-icon">📉</span>}
              {snapScoreStatus === 'reset' && <span className="snap-score-status-icon">💔</span>}
            </div>

            <button
              className="profile-btn"
              onClick={() => {
                navigate(`/profile/${user?.id}`);
                setIsMenuOpen(false);
              }}
              title="View Profile"
            >
              <FiUser size={24} />
            </button>
            <button
              className="logout-btn"
              onClick={handleLogout}
              title="Logout"
            >
              <FiLogOut size={24} />
            </button>
          </div>
        </div>
      </nav>

      {/* Snap Creator Camera/Upload Overlay */}
      {showSnapCreator && (
        <StoryCreator
          onClose={() => setShowSnapCreator(false)}
          onCreate={(content, mediaUrl, mediaType) => {
            setSnapData({ content, mediaUrl, mediaType });
            setShowSnapCreator(false);
            setShowContactPicker(true);
          }}
        />
      )}

      {/* Contact Checklist Modal for snaps dispatch */}
      {showContactPicker && (
        <div className="snap-contact-picker-overlay">
          <div className="snap-contact-picker glass-panel">
            <h3>⚡ Send Snap to Friends</h3>
            <input
              type="text"
              className="snap-contact-search"
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="snap-contact-list">
              {filteredContacts.length > 0 ? (
                filteredContacts.map(contact => {
                  const selected = selectedContacts.includes(contact._id);
                  return (
                    <div 
                      key={contact._id} 
                      className={`snap-contact-item ${selected ? 'selected' : ''}`}
                      onClick={() => handleToggleContact(contact._id)}
                    >
                      <div className="snap-contact-info">
                        <img 
                          src={contact.profilePicture || '/default-avatar.png'} 
                          alt={contact.username} 
                          className="snap-contact-avatar"
                        />
                        <span className="snap-contact-name">{contact.username}</span>
                      </div>
                      <div className={`snap-checkbox ${selected ? 'checked' : ''}`}>
                        {selected && '✓'}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                  No friends found.
                </div>
              )}
            </div>
            <div className="snap-picker-footer">
              <button 
                className="snap-picker-btn cancel"
                onClick={() => {
                  setShowContactPicker(false);
                  setSnapData(null);
                  setSelectedContacts([]);
                }}
                disabled={isSending}
              >
                Cancel
              </button>
              <button 
                className="snap-picker-btn send"
                onClick={handleSendSnapToSelected}
                disabled={isSending || selectedContacts.length === 0}
              >
                {isSending ? 'Sending...' : `Send (${selectedContacts.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
