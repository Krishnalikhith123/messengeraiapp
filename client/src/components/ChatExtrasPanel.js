import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocketStore } from '../store/socketStore';
import '../styles/ChatExtrasPanel.css';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function ChatExtrasPanel({ chat, onClose }) {
  const { socket } = useSocketStore();
  const [tab, setTab] = useState('watch');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [watchParty, setWatchParty] = useState(chat?.watchParty || {});
  const [voiceActive, setVoiceActive] = useState(!!chat?.voiceLoungeActive);
  const [themes, setThemes] = useState([]);
  const [reactions, setReactions] = useState(null);

  useEffect(() => {
    axios.get('/api/features/themes', { headers: authHeader() }).then((r) => setThemes(r.data)).catch(() => {});
    if (chat?._id) {
      axios.get(`/api/features/reactions/${chat._id}`, { headers: authHeader() })
        .then((r) => setReactions(r.data))
        .catch(() => {});
    }
  }, [chat?._id]);

  useEffect(() => {
    if (!socket || !chat?._id) return;
    const onWatch = (wp) => setWatchParty(wp);
    const onWatchEnd = () => setWatchParty({ active: false });
    const onVoice = ({ active }) => setVoiceActive(active);
    socket.on('watch-party-started', onWatch);
    socket.on('watch-party-sync', (d) => setWatchParty((w) => ({ ...w, ...d })));
    socket.on('watch-party-ended', onWatchEnd);
    socket.on('voice-lounge-changed', onVoice);
    return () => {
      socket.off('watch-party-started', onWatch);
      socket.off('watch-party-sync');
      socket.off('watch-party-ended', onWatchEnd);
      socket.off('voice-lounge-changed', onVoice);
    };
  }, [socket, chat?._id]);

  const startWatchParty = async () => {
    try {
      const res = await axios.post(`/api/features/watch-party/${chat._id}/start`, {
        videoUrl,
        title: videoTitle || 'Watch Party'
      }, { headers: authHeader() });
      setWatchParty(res.data);
      toast.success('Watch party started (#36)');
    } catch {
      toast.error('Failed to start watch party');
    }
  };

  const endWatchParty = async () => {
    try {
      await axios.delete(`/api/features/watch-party/${chat._id}`, { headers: authHeader() });
      setWatchParty({ active: false });
      toast.success('Watch party ended');
    } catch {
      toast.error('Failed');
    }
  };

  const toggleVoiceLounge = async () => {
    try {
      const res = await axios.put(`/api/features/voice-lounge/${chat._id}`, { active: !voiceActive }, { headers: authHeader() });
      setVoiceActive(res.data.voiceLoungeActive);
      toast.success(res.data.voiceLoungeActive ? 'Voice lounge ON (#35)' : 'Voice lounge off');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Group chats only');
    }
  };

  const applyChatTheme = async (preset) => {
    try {
      await axios.put(`/api/features/themes/chat/${chat._id}`, {
        preset: preset.id,
        bubbleSent: preset.bubbleSent,
        bubbleReceived: preset.bubbleReceived,
        fontFamily: preset.font
      }, { headers: authHeader() });
      toast.success(`Theme "${preset.name}" for this chat (#38)`);
    } catch {
      toast.error('Theme failed');
    }
  };

  if (!chat) return null;

  return (
    <div className="chat-extras-overlay" onClick={onClose}>
      <div className="chat-extras-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Chat extras</h3>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="extras-tabs">
          {['watch', 'voice', 'theme', 'reactions'].map((t) => (
            <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'watch' && '📺 #36'}
              {t === 'voice' && '🎙 #35'}
              {t === 'theme' && '🎨 #38'}
              {t === 'reactions' && '📊 #39'}
            </button>
          ))}
        </div>

        {tab === 'watch' && (
          <div className="extras-tab-body">
            {watchParty?.active ? (
              <>
                <p><strong>{watchParty.title}</strong></p>
                {watchParty.videoUrl && (
                  <iframe
                    title="watch"
                    src={watchParty.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                    allowFullScreen
                    className="watch-iframe"
                  />
                )}
                <button type="button" onClick={endWatchParty}>End party</button>
              </>
            ) : (
              <>
                <input placeholder="YouTube URL" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
                <input placeholder="Title" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} />
                <button type="button" onClick={startWatchParty}>Start watch party</button>
              </>
            )}
          </div>
        )}

        {tab === 'voice' && (
          <div className="extras-tab-body">
            <p>Voice lounge lets group members hop into an open voice channel.</p>
            <button type="button" className={voiceActive ? 'voice-on' : ''} onClick={toggleVoiceLounge} disabled={!chat.isGroupChat}>
              {voiceActive ? '🎙 Lounge active' : 'Open voice lounge'}
            </button>
            {!chat.isGroupChat && <p className="hint">Requires a group chat</p>}
          </div>
        )}

        {tab === 'theme' && (
          <div className="extras-tab-body theme-picks">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                style={{ background: `linear-gradient(135deg, ${t.bubbleSent}, ${t.bubbleReceived})` }}
                onClick={() => applyChatTheme(t)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {tab === 'reactions' && (
          <div className="extras-tab-body">
            {reactions ? (
              <>
                <p>Total: {reactions.totalReactions}</p>
                <div className="react-cloud">
                  {reactions.topEmojis?.map(([e, n]) => <span key={e}>{e} {n}</span>)}
                </div>
              </>
            ) : (
              <p>No reactions yet in this chat.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatExtrasPanel;
