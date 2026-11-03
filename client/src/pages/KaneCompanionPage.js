import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSend, FiMic, FiHeart, FiCpu } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore';
import './KaneCompanionPage.css';

const VIBES = [
  { id: 'bestie', label: 'Best Friend', emoji: '🤝' },
  { id: 'chill', label: 'Chill', emoji: '😌' },
  { id: 'hype', label: 'Hype', emoji: '🔥' },
  { id: 'mentor', label: 'Mentor', emoji: '🎓' }
];

function KaneCompanionPage() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Hey ${user?.username || 'friend'}! I'm your Kane companion. How's your day going?` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ vibe: 'bestie', nickname: 'Kane', bondLevel: 1 });
  const [listening, setListening] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    axios.get('/api/companion/profile').then((r) => {
      setProfile({ ...profile, ...r.data.companion, username: r.data.username });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text?.trim()) return;
    const userMsg = text.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const res = await axios.post('/api/companion/chat', { message: userMsg });
      setMessages((m) => [...m, { role: 'assistant', content: res.data.reply }]);
      setProfile((p) => ({ ...p, bondLevel: res.data.bondLevel, vibe: res.data.vibe }));
    } catch {
      toast.error('Kane is taking a breather — try again');
    } finally {
      setLoading(false);
    }
  };

  const updateVibe = async (vibe) => {
    try {
      await axios.put('/api/companion/profile', { vibe });
      setProfile((p) => ({ ...p, vibe }));
      toast.success(`Kane is now in ${vibe} mode`);
    } catch {
      toast.error('Could not update vibe');
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice not supported in this browser');
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      sendMessage(t);
    };
    rec.start();
  };

  return (
    <div className="app-scroll-page companion-page">
      <header className="companion-header glass-panel">
        <div className="companion-avatar">🤖</div>
        <div>
          <h1>{profile.nickname || 'Kane'} — AI Companion</h1>
          <p>Bond level {profile.bondLevel || 1}/10 · Remembers what matters to you</p>
        </div>
        <div className="bond-meter">
          <div className="bond-fill" style={{ width: `${(profile.bondLevel || 1) * 10}%` }} />
        </div>
      </header>

      <div className="vibe-picker">
        {VIBES.map((v) => (
          <button
            key={v.id}
            type="button"
            className={profile.vibe === v.id ? 'active' : ''}
            onClick={() => updateVibe(v.id)}
          >
            {v.emoji} {v.label}
          </button>
        ))}
      </div>

      <div className="companion-chat">
        {messages.map((msg, i) => (
          <div key={i} className={`companion-bubble ${msg.role}`}>
            {msg.role === 'assistant' && <FiCpu className="bubble-icon" />}
            <p>{msg.content}</p>
          </div>
        ))}
        {loading && <div className="companion-bubble assistant typing">Kane is thinking...</div>}
        <div ref={endRef} />
      </div>

      <div className="companion-input-bar">
        <button type="button" className={`voice-btn ${listening ? 'active' : ''}`} onClick={startVoice}>
          <FiMic size={20} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
          placeholder="Tell Kane anything — feelings, plans, wins..."
        />
        <button type="button" className="send-btn" onClick={() => sendMessage(input)} disabled={loading}>
          <FiSend size={18} />
        </button>
      </div>

      <p className="companion-tip">
        <FiHeart size={14} /> Tip: Say &quot;Kane, remind me about this message tomorrow&quot; on any chat message, or open Music from the nav.
      </p>
    </div>
  );
}

export default KaneCompanionPage;
