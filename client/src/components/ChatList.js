import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiPlus, FiUsers, FiX, FiCamera, FiArrowLeft, FiArchive, FiStar } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useChatStore, normalizeChatsList } from '../store/chatStore';
import { normalizeContactsList } from '../utils/apiNormalize';
import { useAuthStore } from '../store/authStore';
import '../styles/ChatList.css';

function ChatList({ chats, selectedChat, onSelectChat }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxFolder, setInboxFolder] = useState('all');
  const [inboxChats, setInboxChats] = useState([]);
  const [contextChatId, setContextChatId] = useState(null);
  
  // Zustand auth and group actions
  const { user } = useAuthStore();
  const { createGroup } = useChatStore();

  // Wizard state variables
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [groupImage, setGroupImage] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isSplitGroup, setIsSplitGroup] = useState(false);
  const [splitDueDate, setSplitDueDate] = useState('5');
  const [fixedSplitsInput, setFixedSplitsInput] = useState([{ label: 'Rent', amount: '1000' }]);

  useEffect(() => {
    const loadInbox = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/features/inbox', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setInboxChats(res.data.chats || []);
      } catch { /* use store chats */ }
    };
    loadInbox();
  }, [chats]);

  const storeChats = normalizeChatsList(chats);
  const sourceChats = inboxChats.length
    ? inboxChats
    : storeChats.map((c) => ({ ...c, folder: 'inbox', unread: c.unreadCount || 0 }));

  const folderChats = (() => {
    if (inboxFolder === 'pinned') return sourceChats.filter((c) => c.folder === 'pinned');
    if (inboxFolder === 'unread') return sourceChats.filter((c) => (c.unread || 0) > 0 && c.folder !== 'archived');
    if (inboxFolder === 'groups') return sourceChats.filter((c) => c.isGroupChat && c.folder !== 'archived');
    if (inboxFolder === 'archived') return sourceChats.filter((c) => c.folder === 'archived');
    return sourceChats.filter((c) => c.folder !== 'archived');
  })();

  const filteredChats = folderChats.filter(chat => {
    const participant = chat.participants.find(p => p._id !== user?.id);
    const name = chat.isGroupChat ? chat.groupName : (participant?.username || 'Unknown');
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleInboxAction = async (chatId, action, e) => {
    e?.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/features/inbox/chat/${chatId}`, { action }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const res = await axios.get('/api/features/inbox', { headers: { Authorization: `Bearer ${token}` } });
      setInboxChats(res.data.chats || []);
      setContextChatId(null);
      toast.success(action === 'pin' ? 'Pinned (#76)' : action === 'archive' ? 'Archived' : 'Muted');
    } catch {
      toast.error('Inbox action failed');
    }
  };

  const handleNewChat = () => {
    navigate('/contacts');
  };

  const loadContacts = async () => {
    try {
      const userId = user?.id;
      if (!userId) return;
      const response = await axios.get(`/api/users/profile/${userId}`);
      setContacts(normalizeContactsList(response.data?.contacts ?? response.data));
    } catch (error) {
      console.error('Failed to load contacts', error);
      toast.error('Failed to load contacts');
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
    loadContacts();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setStep(1);
    setContactsSearch('');
    setSelectedContacts([]);
    setGroupName('');
    setGroupImage('');
    setGroupDescription('');
    setIsSplitGroup(false);
    setSplitDueDate('5');
    setFixedSplitsInput([{ label: 'Rent', amount: '1000' }]);
  };

  const toggleSelectContact = (contact) => {
    setSelectedContacts(prev => {
      const exists = prev.some(c => c._id === contact._id);
      if (exists) {
        return prev.filter(c => c._id !== contact._id);
      } else {
        return [...prev, contact];
      }
    });
  };

  const handleGroupImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setGroupImage(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setIsCreating(true);
    try {
      const participantIds = selectedContacts.map(c => c._id);
      const newGroup = await createGroup({
        groupName,
        participantIds,
        groupImage,
        groupDescription,
        isSplitGroup,
        splitDueDate: isSplitGroup ? Number(splitDueDate) : undefined,
        fixedSplits: isSplitGroup 
          ? fixedSplitsInput.map(item => ({ label: item.label, amount: Number(item.amount) || 0 }))
          : undefined
      });
      toast.success('Group created successfully!');
      closeModal();
      onSelectChat(newGroup);
    } catch (error) {
      console.error(error);
      toast.error('Failed to create group');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.username.toLowerCase().includes(contactsSearch.toLowerCase())
  );

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <h2>Messages</h2>
        <div className="chat-list-actions">
          <button className="new-group-btn" onClick={handleOpenModal} title="New Group Chat">
            <FiUsers size={20} />
          </button>
          <button className="new-chat-btn" onClick={handleNewChat} title="New Chat">
            <FiPlus size={24} />
          </button>
        </div>
      </div>

      <div className="inbox-folders">
        {[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
          { id: 'pinned', label: 'Pinned', icon: FiStar },
          { id: 'groups', label: 'Groups' },
          { id: 'archived', label: 'Archive', icon: FiArchive }
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={inboxFolder === f.id ? 'active' : ''}
            onClick={() => setInboxFolder(f.id)}
          >
            {f.icon && <f.icon size={12} />} {f.label}
          </button>
        ))}
      </div>

      <div className="chat-search">
        <FiSearch className="search-icon" size={20} />
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="chat-items">
        {filteredChats.length > 0 ? (
          filteredChats.map(chat => {
            const participant = chat.participants.find(p => p._id !== user?.id);
            const chatName = chat.isGroupChat ? chat.groupName : (participant?.username || 'Unknown User');
            const chatImage = chat.isGroupChat ? (chat.groupImage || '/default-avatar.png') : (participant?.profilePicture || '/default-avatar.png');
            const lastMessage = chat.lastMessage?.content || 'No messages yet';
            const unreadCount = chat.unreadCount || 0;

            return (
              <div
                key={chat._id}
                className={`chat-item ${selectedChat?._id === chat._id ? 'active' : ''} ${chat.folder === 'pinned' ? 'pinned-chat' : ''}`}
                onClick={() => onSelectChat(chat)}
                onContextMenu={(e) => { e.preventDefault(); setContextChatId(chat._id); }}
              >
                <img src={chatImage} alt={chatName} className="chat-avatar" />
                <div className="chat-info">
                  <h3>
                    {chat.folder === 'pinned' && <FiStar size={12} className="pin-icon" />}
                    {chatName} {chat.isSecretChat && '🔒'}
                  </h3>
                  <p className="chat-preview">{chat.isSecretChat ? '🔒 Encrypted message' : lastMessage}</p>
                </div>
                <div className="chat-right">
                  {chat.lastMessageTime && (
                    <span className="chat-time">
                      {formatDistanceToNow(new Date(chat.lastMessageTime), { addSuffix: false })}
                    </span>
                  )}
                  {(chat.unread || unreadCount) > 0 && (
                    <div className="unread-badge">
                      {(chat.unread || unreadCount) > 99 ? '99+' : (chat.unread || unreadCount)}
                    </div>
                  )}
                </div>
                {contextChatId === chat._id && (
                  <div className="chat-context-menu" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={(e) => handleInboxAction(chat._id, 'pin', e)}>Pin</button>
                    <button type="button" onClick={(e) => handleInboxAction(chat._id, 'archive', e)}>Archive</button>
                    <button type="button" onClick={(e) => handleInboxAction(chat._id, 'mute', e)}>Mute</button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="no-chats">
            <p>No conversations yet</p>
            <button onClick={handleNewChat}>Start a new chat</button>
          </div>
        )}
      </div>

      {/* --- Group Wizard Modal --- */}
      {isModalOpen && createPortal(
        <div className="wizard-overlay">
          <div className="wizard-modal">
            <div className="wizard-header">
              {step === 2 && (
                <button className="wizard-back-btn" onClick={() => setStep(1)}>
                  <FiArrowLeft size={20} />
                </button>
              )}
              <h3>{step === 1 ? 'New Group: Members' : 'New Group: Details'}</h3>
              <button className="wizard-close-btn" onClick={closeModal}>
                <FiX size={20} />
              </button>
            </div>

            {step === 1 ? (
              <div className="wizard-step-1">
                <div className="wizard-search">
                  <FiSearch className="wizard-search-icon" size={18} />
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={contactsSearch}
                    onChange={(e) => setContactsSearch(e.target.value)}
                  />
                </div>

                {/* Selected contacts strip */}
                {selectedContacts.length > 0 && (
                  <div className="selected-contacts-strip">
                    {selectedContacts.map(contact => (
                      <div key={contact._id} className="selected-contact-bubble">
                        <img src={contact.profilePicture || '/default-avatar.png'} alt={contact.username} />
                        <span>{contact.username}</span>
                        <button onClick={() => toggleSelectContact(contact)}>
                          <FiX size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Contacts list selection */}
                <div className="wizard-contacts-list">
                  {filteredContacts.length > 0 ? (
                    filteredContacts.map(contact => {
                      const isSelected = selectedContacts.some(c => c._id === contact._id);
                      return (
                        <div
                          key={contact._id}
                          className={`wizard-contact-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleSelectContact(contact)}
                        >
                          <img src={contact.profilePicture || '/default-avatar.png'} alt={contact.username} />
                          <div className="wizard-contact-info">
                            <h4>{contact.username}</h4>
                            <p>{contact.status === 'online' ? '🟢 Online' : '🔴 Offline'}</p>
                          </div>
                          <div className={`wizard-checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected && '✓'}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="no-contacts-found">
                      <p>No contacts found</p>
                    </div>
                  )}
                </div>

                <div className="wizard-footer">
                  <span className="selected-count">{selectedContacts.length} selected</span>
                  <button
                    className="wizard-next-btn"
                    disabled={selectedContacts.length === 0}
                    onClick={() => setStep(2)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <div className="wizard-step-2">
                <div className="wizard-avatar-upload">
                  <label className="wizard-avatar-label">
                    <img
                      src={groupImage || '/default-avatar.png'}
                      alt="Group Avatar"
                      className="wizard-avatar-preview"
                    />
                    <div className="wizard-avatar-overlay">
                      <FiCamera size={20} />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleGroupImageChange}
                      hidden
                    />
                  </label>
                  <p>Upload Group DP</p>
                </div>

                <div className="wizard-form-group">
                  <label>Group Name *</label>
                  <input
                    type="text"
                    placeholder="Enter group name..."
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    maxLength="40"
                  />
                </div>

                <div className="wizard-form-group">
                  <label>Group Description</label>
                  <textarea
                    placeholder="What's this group about? (optional)..."
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    maxLength="150"
                    rows="3"
                  />
                </div>

                {/* Roommate Split Vault Toggle Checkbox */}
                <div className="wizard-form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="checkbox"
                    id="isSplitGroup"
                    checked={isSplitGroup}
                    onChange={(e) => setIsSplitGroup(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="isSplitGroup" style={{ cursor: 'pointer', fontWeight: 'bold', color: '#a855f7' }}>
                    🏠 Roommate Split Vault Mode
                  </label>
                </div>

                {isSplitGroup && (
                  <div className="vault-split-details-inputs" style={{ marginTop: '10px', paddingLeft: '20px', borderLeft: '2px solid #a855f7', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="wizard-form-group">
                      <label>Due Date (Day of the Month)</label>
                      <input
                        type="number"
                        min="1"
                        max="28"
                        placeholder="e.g. 5"
                        value={splitDueDate}
                        onChange={(e) => setSplitDueDate(e.target.value)}
                        required
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '6px' }}
                      />
                    </div>

                    <div className="wizard-form-group" style={{ marginTop: '5px' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0' }}>📋 Room Dues & Cost Items</span>
                        <button
                          type="button"
                          onClick={() => setFixedSplitsInput(prev => [...prev, { label: '', amount: '' }])}
                          style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          ➕ Add Bill Row
                        </button>
                      </label>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        {fixedSplitsInput.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="e.g. Rent, Water Bill"
                              value={item.label}
                              onChange={(e) => {
                                const newSplits = [...fixedSplitsInput];
                                newSplits[idx].label = e.target.value;
                                setFixedSplitsInput(newSplits);
                              }}
                              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '6px', fontSize: '12px' }}
                              required
                            />
                            <input
                              type="number"
                              placeholder="Amount ($)"
                              value={item.amount}
                              onChange={(e) => {
                                const newSplits = [...fixedSplitsInput];
                                newSplits[idx].amount = e.target.value;
                                setFixedSplitsInput(newSplits);
                              }}
                              style={{ width: '90px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '6px', fontSize: '12px' }}
                              required
                            />
                            {fixedSplitsInput.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setFixedSplitsInput(prev => prev.filter((_, i) => i !== idx))}
                                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="wizard-footer">
                  <button
                    className="wizard-create-btn"
                    disabled={!groupName.trim() || isCreating}
                    onClick={handleCreateGroup}
                  >
                    {isCreating ? 'Creating...' : 'Create Group'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ChatList;