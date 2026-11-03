import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import toast from 'react-hot-toast';
import axios from 'axios';
import { normalizeUsersList, normalizeContactsList } from '../utils/apiNormalize';
import { FiSearch, FiPlus, FiArrowLeft, FiMessageCircle, FiTrash2, FiUser, FiLock, FiRefreshCw } from 'react-icons/fi';
import '../styles/ContactsPage.css';

const sameId = (a, b) => {
  if (!a || !b) return false;
  return String(a) === String(b);
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : ''
    }
  };
};

function ContactsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId = user?.id || user?._id;
  const { getOrCreateChat, fetchMessages } = useChatStore();
  const [contacts, setContacts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersEverLoaded, setUsersEverLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('contacts');
  const [sortBy, setSortBy] = useState('name');

  const loadContacts = useCallback(async () => {
    if (!userId) return;
    try {
      setIsLoadingContacts(true);
      setLoadError('');
      const response = await axios.get(`/api/users/profile/${userId}`, getAuthHeaders());
      console.log('loadContacts raw response:', response.data);
      const list = normalizeContactsList(response.data);
      console.log('loadContacts normalized contacts:', list);
      setContacts(list);
    } catch (error) {
      console.error('Contacts load error:', error);
      setContacts([]);
      setLoadError(error.response?.data?.message || 'Failed to load contacts');
      toast.error('Failed to load contacts');
    } finally {
      setIsLoadingContacts(false);
    }
  }, [userId]);

  const loadAllUsers = useCallback(async () => {
    try {
      setIsLoadingUsers(true);
      setLoadError('');
      const response = await axios.get('/api/users/all/list', getAuthHeaders());
      console.log('loadAllUsers raw response:', response.data);
      const list = normalizeUsersList(response.data);
      console.log('loadAllUsers normalized list:', list);
      setAllUsers(list);
      setUsersEverLoaded(true);
      if (list.length === 0) {
        console.warn('No other users returned from /api/users/all/list');
      }
    } catch (error) {
      console.error('Users list load error:', error);
      setAllUsers([]);
      setUsersEverLoaded(true);
      setLoadError(
        error.response?.data?.message ||
          (error.message?.includes('Network') ? 'Cannot reach server — is npm run dev running?' : 'Failed to load users')
      );
      toast.error('Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const reloadAll = useCallback(() => {
    loadContacts();
    loadAllUsers();
  }, [loadContacts, loadAllUsers]);

  useEffect(() => {
    if (!userId) return;
    reloadAll();
  }, [userId, reloadAll]);

  // When switching to Add Friends tab, if users haven't been loaded yet, fetch them.
  // usersEverLoaded prevents this from re-triggering after a successful load.
  useEffect(() => {
    if (activeTab === 'add' && !usersEverLoaded && !isLoadingUsers) {
      loadAllUsers();
    }
  }, [activeTab, usersEverLoaded, isLoadingUsers, loadAllUsers]);

  const handleAddContact = async (contactId) => {
    try {
      await axios.post('/api/users/contacts/add', { contactId }, getAuthHeaders());
      toast.success('Contact added!');
      await loadContacts();
      await loadAllUsers();
    } catch (error) {
      console.error('Add contact error:', error);
      toast.error('Failed to add contact');
    }
  };

  const handleRemoveContact = async (contactId) => {
    if (window.confirm('Remove this contact?')) {
      try {
        await axios.post('/api/users/contacts/remove', { contactId }, getAuthHeaders());
        toast.success('Contact removed');
        reloadAll();
      } catch (error) {
        console.error('Remove contact error:', error);
        toast.error('Failed to remove contact');
      }
    }
  };

  const handleMessageContact = async (contactId, isSecret = false) => {
    try {
      setIsLoadingContacts(true);
      const chat = await getOrCreateChat(contactId, isSecret);
      await fetchMessages(chat._id);
      navigate(`/chat/${chat._id}`);
      toast.success(isSecret ? 'Secret chat opened! 🔒' : 'Chat opened!');
    } catch (error) {
      console.error('Message contact error:', error);
      toast.error('Failed to open chat');
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleSearchUsers = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      loadAllUsers();
      return;
    }
    try {
      const response = await axios.get(`/api/users/search/${encodeURIComponent(query.trim())}`, getAuthHeaders());
      console.log('handleSearchUsers raw response:', response.data);
      const list = normalizeUsersList(response.data);
      setAllUsers(list);
    } catch (error) {
      console.error('Search users error:', error);
      toast.error('Failed to search');
    }
  };

  const contactList = normalizeContactsList(contacts);
  const userList = normalizeUsersList(allUsers);

  const filteredContacts = contactList.filter(
    (contact) =>
      contact.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.bio?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    if (sortBy === 'name') return (a.username || '').localeCompare(b.username || '');
    if (sortBy === 'status') return a.status === 'online' ? -1 : 1;
    return 0;
  });

  const availableUsers = userList
    .filter((u) => !contactList.some((c) => sameId(c._id, u._id)))
    .filter((u) => u.username?.toLowerCase().includes(searchQuery.toLowerCase()));

  const isLoading = isLoadingContacts || isLoadingUsers;

  return (
    <div className="contacts-page">
      <div className="contacts-header">
        <div className="contacts-header-top">
          <button className="contacts-back-btn" onClick={() => navigate('/chats')}>
            <FiArrowLeft size={24} />
          </button>
          <div className="contacts-title-section">
            <h1>Contacts</h1>
            <p className="contacts-subtitle">{contactList.length} friends</p>
          </div>
          <button
            type="button"
            className="contacts-back-btn"
            onClick={reloadAll}
            title="Refresh"
            disabled={isLoading}
          >
            <FiRefreshCw size={20} />
          </button>
        </div>

        <div className="search-contacts">
          <FiSearch size={20} />
          <input
            type="text"
            placeholder={activeTab === 'add' ? 'Search people to add...' : 'Search contacts...'}
            value={searchQuery}
            onChange={(e) =>
              activeTab === 'add' ? handleSearchUsers(e.target.value) : setSearchQuery(e.target.value)
            }
          />
        </div>
      </div>

      <div className="contacts-tabs">
        <button
          className={`tab ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          <FiUser size={18} />
          <span>My Contacts</span>
          <span className="tab-badge">{contactList.length}</span>
        </button>
        <button
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          <FiPlus size={18} />
          <span>Add Friends</span>
          <span className="tab-badge">{availableUsers.length}</span>
        </button>
      </div>

      <div className="contacts-content">
        {loadError && (
          <div className="empty-state" style={{ marginBottom: 12 }}>
            <p style={{ color: '#f87171' }}>{loadError}</p>
            <button type="button" className="add-friend-btn" onClick={reloadAll}>
              Retry
            </button>
          </div>
        )}

        {!userId ? (
          <div className="loading-state">
            <p>Please log in to see contacts.</p>
          </div>
        ) : (isLoadingContacts && activeTab === 'contacts' && contactList.length === 0) ||
            (isLoadingUsers && activeTab === 'add' && userList.length === 0) ||
            (isLoading && contactList.length === 0 && userList.length === 0 && !usersEverLoaded) ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>{activeTab === 'add' ? 'Finding people to add...' : 'Loading...'}</p>
          </div>
        ) : activeTab === 'contacts' ? (
          sortedContacts.length > 0 ? (
            <>
              <div className="sort-controls">
                <button
                  type="button"
                  className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
                  onClick={() => setSortBy('name')}
                >
                  A-Z
                </button>
                <button
                  type="button"
                  className={`sort-btn ${sortBy === 'status' ? 'active' : ''}`}
                  onClick={() => setSortBy('status')}
                >
                  Online
                </button>
              </div>
              <div className="contacts-grid">
                {sortedContacts.map((contact) => (
                  <div key={contact._id} className="contact-card">
                    <div className="contact-card-header">
                      <div className="contact-avatar-wrapper">
                        <img
                          src={contact.profilePicture || '/default-avatar.png'}
                          alt={contact.username}
                          className="contact-avatar"
                        />
                        <span className={`status-dot ${contact.status}`} />
                      </div>
                      <div className="contact-status-badge">
                        {contact.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                      </div>
                    </div>
                    <div className="contact-info">
                      <h3>{contact.username}</h3>
                      <p className="contact-bio">{contact.bio || 'No bio'}</p>
                    </div>
                    <div className="contact-actions">
                      <button
                        type="button"
                        className="action-btn message-btn"
                        onClick={() => handleMessageContact(contact._id)}
                        disabled={isLoadingContacts}
                      >
                        <FiMessageCircle size={18} />
                        <span>Message</span>
                      </button>
                      <button
                        type="button"
                        className="action-btn secret-btn"
                        onClick={() => handleMessageContact(contact._id, true)}
                        disabled={isLoadingContacts}
                        style={{ background: 'linear-gradient(135deg, #a855f7, #7e22ce)', color: 'white' }}
                      >
                        <FiLock size={18} />
                        <span>Secret</span>
                      </button>
                      <button
                        type="button"
                        className="action-btn remove-btn"
                        onClick={() => handleRemoveContact(contact._id)}
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <h3>No contacts yet</h3>
              <p>Open the &quot;Add Friends&quot; tab to find people on ChatFlow.</p>
            </div>
          )
        ) : availableUsers.length > 0 ? (
          <div className="users-grid">
            {availableUsers.map((userItem) => (
              <div key={userItem._id} className="user-card">
                <div className="user-card-header">
                  <img
                    src={userItem.profilePicture || '/default-avatar.png'}
                    alt={userItem.username}
                    className="user-avatar"
                  />
                  <span className={`status-dot ${userItem.status}`} />
                </div>
                <div className="user-info">
                  <h3>{userItem.username}</h3>
                  <p className="user-bio">{userItem.bio || 'No bio'}</p>
                  <span className={`status-label ${userItem.status}`}>
                    {userItem.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                  </span>
                </div>
                <button
                  type="button"
                  className="add-friend-btn"
                  onClick={() => handleAddContact(userItem._id)}
                >
                  <FiPlus size={20} />
                  <span>Add Friend</span>
                </button>
              </div>
            ))}
          </div>
        ) : isLoadingUsers ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Finding people to add...</p>
          </div>
        ) : userList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h3>Could not load users</h3>
            <p>Make sure the server is running (npm run dev) and you are logged in.</p>
            <button type="button" className="add-friend-btn" onClick={reloadAll}>
              Retry
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No matches</h3>
            <p>
              {searchQuery.trim()
                ? 'Try a different search term.'
                : 'Everyone on ChatFlow is already in your contacts list.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ContactsPage;
