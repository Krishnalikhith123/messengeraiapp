import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSmile, FiUsers, FiLayers, FiBarChart2 } from 'react-icons/fi';
import '../styles/ExtrasHubPage.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function ExtrasHubPage() {
  const navigate = useNavigate();
  const [mood, setMood] = useState({ emoji: '😊', text: '' });
  const [moodHours, setMoodHours] = useState(24);
  const [themes, setThemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState('midnight');
  const [suggestions, setSuggestions] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [reactionChatId, setReactionChatId] = useState('');
  const [reactions, setReactions] = useState(null);
  const [chats, setChats] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [moodRes, themesRes, sugRes, stickRes, inboxRes] = await Promise.all([
          axios.get('/api/features/mood', { headers: authHeader() }),
          axios.get('/api/features/themes', { headers: authHeader() }),
          axios.get('/api/features/friend-suggestions', { headers: authHeader() }),
          axios.get('/api/features/stickers', { headers: authHeader() }),
          axios.get('/api/features/inbox', { headers: authHeader() })
        ]);
        setMood(moodRes.data);
        setThemes(themesRes.data);
        setSuggestions(sugRes.data);
        setStickers(stickRes.data);
        setChats(inboxRes.data.chats || []);
      } catch {
        toast.error('Failed to load extras');
      }
    };
    load();
  }, []);

  const saveMood = async () => {
    try {
      const res = await axios.put('/api/features/mood', { ...mood, hours: moodHours }, { headers: authHeader() });
      setMood(res.data);
      toast.success('Mood status updated (#32)');
    } catch {
      toast.error('Could not save mood');
    }
  };

  const applyTheme = async () => {
    const preset = themes.find((t) => t.id === selectedTheme);
    if (!preset) return;
    try {
      await axios.put('/api/features/themes/me', {
        preset: preset.id,
        bubbleSent: preset.bubbleSent,
        bubbleReceived: preset.bubbleReceived,
        fontFamily: preset.font
      }, { headers: authHeader() });
      toast.success(`Theme "${preset.name}" applied (#38)`);
    } catch {
      toast.error('Theme failed');
    }
  };

  const addContact = async (userId) => {
    try {
      await axios.post('/api/users/contacts/add', { contactId: userId }, { headers: authHeader() });
      toast.success('Contact added!');
      setSuggestions((s) => s.filter((x) => x.user._id !== userId));
    } catch {
      toast.error('Could not add contact');
    }
  };

  const favSticker = async (sticker) => {
    try {
      const res = await axios.post('/api/features/stickers/favorite', sticker, { headers: authHeader() });
      setFavorites(res.data);
      toast.success('Added to favorites (#88)');
    } catch {
      toast.error('Failed');
    }
  };

  const loadReactions = async () => {
    if (!reactionChatId) return;
    try {
      const res = await axios.get(`/api/features/reactions/${reactionChatId}`, { headers: authHeader() });
      setReactions(res.data);
    } catch {
      toast.error('No reaction data');
    }
  };

  return (
    <div className="app-scroll-page extras-hub-page">
      <header>
        <h1>✨ Chat Extras</h1>
        <p>Mood (#32) · Themes (#38) · Friends (#42) · Reactions (#39) · Stickers (#88)</p>
      </header>

      <section className="extras-card glass-panel">
        <h2><FiSmile /> Mood status (#32)</h2>
        <div className="mood-form">
          <input value={mood.emoji || ''} onChange={(e) => setMood({ ...mood, emoji: e.target.value })} maxLength={4} className="mood-emoji" />
          <input value={mood.text || ''} onChange={(e) => setMood({ ...mood, text: e.target.value })} placeholder="What are you up to?" />
          <select value={moodHours} onChange={(e) => setMoodHours(Number(e.target.value))}>
            <option value={1}>1 hour</option>
            <option value={8}>8 hours</option>
            <option value={24}>24 hours</option>
          </select>
          <button type="button" onClick={saveMood}>Save mood</button>
        </div>
      </section>

      <section className="extras-card glass-panel">
        <h2><FiLayers /> Chat themes (#38)</h2>
        <div className="theme-grid">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-swatch ${selectedTheme === t.id ? 'active' : ''}`}
              style={{ background: `linear-gradient(135deg, ${t.bubbleSent}, ${t.bubbleReceived})` }}
              onClick={() => setSelectedTheme(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <button type="button" className="extras-primary" onClick={applyTheme}>Apply globally</button>
      </section>

      <section className="extras-card glass-panel">
        <h2><FiUsers /> Friend suggestions (#42)</h2>
        <div className="suggestions-list">
          {suggestions.map(({ user, reason }) => (
            <div key={user._id} className="suggestion-row">
              <img src={user.profilePicture || '/default-avatar.png'} alt="" />
              <div>
                <strong>{user.username}</strong>
                <span>{reason}</span>
              </div>
              <button type="button" onClick={() => addContact(user._id)}>Add</button>
            </div>
          ))}
          {suggestions.length === 0 && <p className="muted">No new suggestions right now.</p>}
        </div>
      </section>

      <section className="extras-card glass-panel">
        <h2><FiBarChart2 /> Reaction insights (#39)</h2>
        <select value={reactionChatId} onChange={(e) => setReactionChatId(e.target.value)} className="extras-select">
          <option value="">Pick a chat</option>
          {chats.map((c) => (
            <option key={c._id} value={c._id}>{c.isGroupChat ? c.groupName : 'DM'}</option>
          ))}
        </select>
        <button type="button" onClick={loadReactions}>Analyze</button>
        {reactions && (
          <div className="reaction-insights">
            <p>Total reactions: <strong>{reactions.totalReactions}</strong></p>
            <div className="emoji-cloud">
              {reactions.topEmojis?.map(([emoji, count]) => (
                <span key={emoji}>{emoji} ×{count}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="extras-card glass-panel">
        <h2>🎨 Sticker studio (#88)</h2>
        <div className="sticker-grid">
          {stickers.map((s) => (
            <button key={s.id} type="button" onClick={() => favSticker(s)} title={s.label}>
              <span>{s.emoji}</span>
              <small>{s.label}</small>
            </button>
          ))}
        </div>
        {favorites.length > 0 && (
          <p className="fav-hint">Favorites: {favorites.map((f) => f.emoji).join(' ')}</p>
        )}
        <button type="button" className="extras-link" onClick={() => navigate('/chats')}>Use stickers in any chat →</button>
      </section>
    </div>
  );
}

export default ExtrasHubPage;
