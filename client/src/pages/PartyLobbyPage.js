import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useChatStore, normalizeChatsList } from '../store/chatStore';
import { useSocketStore } from '../store/socketStore';
import { FiUsers, FiPlay, FiX } from 'react-icons/fi';
import '../styles/PartyLobbyPage.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function PartyLobbyPage() {
  const navigate = useNavigate();
  const { chats, fetchChats } = useChatStore();
  const { socket } = useSocketStore();
  const [partyGames, setPartyGames] = useState([]);
  const [lobbies, setLobbies] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedGame, setSelectedGame] = useState('truthordare');

  const groupChats = normalizeChatsList(chats).filter((c) => c.isGroupChat);

  const load = async () => {
    try {
      const [gamesRes, lobbiesRes] = await Promise.all([
        axios.get('/api/party/games', { headers: authHeader() }),
        axios.get('/api/party/lobbies', { headers: authHeader() })
      ]);
      setPartyGames(gamesRes.data);
      setLobbies(lobbiesRes.data);
    } catch {
      toast.error('Failed to load party lobby');
    }
  };

  useEffect(() => { load(); fetchChats(); }, [fetchChats]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => load();
    socket.on('party-lobby-started', refresh);
    socket.on('party-lobby-ended', refresh);
    socket.on('party-lobby-joined', refresh);
    return () => {
      socket.off('party-lobby-started', refresh);
      socket.off('party-lobby-ended', refresh);
      socket.off('party-lobby-joined', refresh);
    };
  }, [socket]);

  const startLobby = async () => {
    if (!selectedGroup) {
      toast.error('Select a group chat');
      return;
    }
    try {
      await axios.post('/api/party/lobby', { chatId: selectedGroup, gameType: selectedGame }, { headers: authHeader() });
      toast.success('Party lobby opened (#81)');
      navigate(`/chat/${selectedGroup}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Need a group chat');
    }
  };

  const joinLobby = async (chatId) => {
    try {
      await axios.post(`/api/party/lobby/${chatId}/join`, {}, { headers: authHeader() });
      toast.success('Joined party!');
      navigate(`/chat/${chatId}`);
    } catch {
      toast.error('No open lobby');
    }
  };

  const endParty = async (chatId) => {
    try {
      await axios.delete(`/api/party/lobby/${chatId}`, { headers: authHeader() });
      toast.success('Party ended');
      load();
    } catch {
      toast.error('Failed to end party');
    }
  };

  return (
    <div className="app-scroll-page party-lobby-page">
      <header>
        <h1>🎉 Party Games Lobby (#81)</h1>
        <p>Start multiplayer party mode in any group chat</p>
      </header>

      <section className="party-card glass-panel">
        <h2><FiPlay /> Start new party</h2>
        <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className="party-select">
          <option value="">— Group chat —</option>
          {groupChats.map((c) => (
            <option key={c._id} value={c._id}>{c.groupName || 'Group'}</option>
          ))}
        </select>
        <div className="party-games-row">
          {partyGames.map((g) => (
            <button
              key={g.id}
              type="button"
              className={selectedGame === g.id ? 'active' : ''}
              onClick={() => setSelectedGame(g.id)}
            >
              {g.emoji} {g.name}
            </button>
          ))}
        </div>
        <button type="button" className="party-start-btn" onClick={startLobby}>Open lobby</button>
      </section>

      <section className="party-card glass-panel">
        <h2><FiUsers /> Active lobbies</h2>
        {lobbies.length === 0 && <p className="muted">No active parties — start one above!</p>}
        {lobbies.map((lobby) => (
          <div key={lobby._id} className="lobby-row">
            <img src={lobby.groupImage || '/default-avatar.png'} alt="" />
            <div>
              <strong>{lobby.groupName}</strong>
              <span>{lobby.participants?.length} members · Party ON</span>
            </div>
            <button type="button" onClick={() => joinLobby(lobby._id)}>Join</button>
            <button type="button" className="end-btn" onClick={() => endParty(lobby._id)}><FiX /></button>
          </div>
        ))}
      </section>
    </div>
  );
}

export default PartyLobbyPage;
