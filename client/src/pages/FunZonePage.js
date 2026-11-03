import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useChatStore, normalizeChatsList } from '../store/chatStore';
import { FiPlay, FiAward, FiGrid, FiRefreshCw } from 'react-icons/fi';
import '../styles/FunZonePage.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function FunZonePage() {
  const navigate = useNavigate();
  const { chats } = useChatStore();
  const [catalog, setCatalog] = useState([]);
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState(null);
  const [dailyGuesses, setDailyGuesses] = useState([]);
  const [dailyInput, setDailyInput] = useState('');
  const [tournament, setTournament] = useState(null);
  const [pickChatId, setPickChatId] = useState('');

  const load = async () => {
    try {
      const [catRes, statsRes, dailyRes, tourRes] = await Promise.all([
        axios.get('/api/games/catalog', { headers: authHeader() }),
        axios.get('/api/games/stats/me', { headers: authHeader() }),
        axios.get('/api/games/wordle/daily', { headers: authHeader() }),
        axios.get('/api/games/tournament', { headers: authHeader() })
      ]);
      setCatalog(catRes.data);
      setStats(statsRes.data);
      setDaily(dailyRes.data);
      setTournament(tourRes.data);
    } catch {
      toast.error('Failed to load Fun Zone');
    }
  };

  useEffect(() => { load(); }, []);

  const submitDailyGuess = async (e) => {
    e.preventDefault();
    if (!dailyInput || daily?.alreadyPlayed) return;
    try {
      const res = await axios.post('/api/games/wordle/daily/guess', { guess: dailyInput }, { headers: authHeader() });
      setDailyGuesses((prev) => [...prev, { guess: dailyInput.toUpperCase(), feedback: res.data.feedback }]);
      setDailyInput('');
      if (res.data.finished) {
        toast.success(res.data.won ? '🎉 Daily Wordle solved!' : `Daily over — word was ${res.data.reveal}`);
        setDaily((d) => ({ ...d, alreadyPlayed: true }));
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid guess');
    }
  };

  const startInChat = async (gameType) => {
    if (!pickChatId) {
      toast.error('Select a chat first');
      return;
    }
    try {
      const chat = normalizeChatsList(chats).find((c) => c._id === pickChatId);
      const other = chat?.participants?.find((p) => (p._id || p).toString() !== localStorage.getItem('userId'));
      await axios.post('/api/games/start', {
        chatId: pickChatId,
        gameType,
        recipientId: other?._id || other
      }, { headers: authHeader() });
      toast.success(`Started ${gameType} in chat`);
      navigate(`/chat/${pickChatId}`);
    } catch {
      toast.error('Could not start game');
    }
  };

  return (
    <div className="app-scroll-page fun-zone-page">
      <header className="fun-zone-header">
        <h1>🎮 Fun Zone</h1>
        <p>Features #59–#65 — full arcade with stats, daily Wordle & weekly cup</p>
        <button type="button" className="fun-refresh" onClick={load}><FiRefreshCw /> Refresh</button>
      </header>

      {stats && (
        <section className="fun-stats-bar glass-panel">
          <div><strong>{stats.gameStats?.totalWins || 0}</strong><span>Wins</span></div>
          <div><strong>{stats.gameStats?.totalGames || 0}</strong><span>Played</span></div>
          <div><strong>{stats.gameStats?.tournamentPoints || 0}</strong><span>Cup pts</span></div>
        </section>
      )}

      <section className="fun-section glass-panel">
        <h2><FiGrid /> Game catalog (#59–#63)</h2>
        <p className="fun-hint">Pick a chat, then launch any duel inside that conversation.</p>
        <select value={pickChatId} onChange={(e) => setPickChatId(e.target.value)} className="fun-select">
          <option value="">— Select chat —</option>
          {normalizeChatsList(chats).filter((c) => c.folder !== 'archived').map((c) => (
            <option key={c._id} value={c._id}>
              {c.isGroupChat ? c.groupName : c.participants?.find((p) => p._id)?.username || 'Chat'}
            </option>
          ))}
        </select>
        <div className="fun-catalog-grid">
          {catalog.map((g) => (
            <div key={g.id} className="fun-game-card">
              <span className="fun-game-emoji">{g.emoji}</span>
              <h3>{g.name}</h3>
              <p>{g.desc}</p>
              <span className="fun-feature-tag">#{g.feature}</span>
              {g.id !== 'wordle' && g.id !== 'tournament' && (
                <button type="button" onClick={() => startInChat(g.id)}><FiPlay /> Play in chat</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="fun-section glass-panel daily-wordle-section">
        <h2>🟩 Daily Wordle (#64)</h2>
        {daily && (
          <>
            <p>{daily.dateKey} · {daily.playersToday} players today · {daily.alreadyPlayed ? '✅ Done' : `${6 - dailyGuesses.length} tries left`}</p>
            <div className="daily-grid">
              {dailyGuesses.map((row, i) => (
                <div key={i} className="daily-row">
                  {row.guess.split('').map((ch, j) => (
                    <span key={j} className={`daily-cell ${row.feedback[j]}`}>{ch}</span>
                  ))}
                </div>
              ))}
            </div>
            {!daily.alreadyPlayed && dailyGuesses.length < 6 && (
              <form onSubmit={submitDailyGuess} className="daily-form">
                <input maxLength={5} value={dailyInput} onChange={(e) => setDailyInput(e.target.value.toUpperCase())} placeholder="5 letters" />
                <button type="submit">Guess</button>
              </form>
            )}
          </>
        )}
      </section>

      <section className="fun-section glass-panel">
        <h2><FiAward /> Weekly Cup (#65)</h2>
        {tournament && (
          <>
            <p>{tournament.weekLabel} — You: <strong>{tournament.myPoints}</strong> pts</p>
            <ul className="tournament-list">
              {tournament.leaderboard?.slice(0, 10).map((u, i) => (
                <li key={u._id}>
                  <span>{i + 1}.</span>
                  <img src={u.profilePicture || '/default-avatar.png'} alt="" />
                  <span>{u.username}</span>
                  <strong>{u.gameStats?.tournamentPoints || 0}</strong>
                </li>
              ))}
            </ul>
            <p className="prizes">{tournament.prizes?.join(' · ')}</p>
          </>
        )}
      </section>

    </div>
  );
}

export default FunZonePage;
