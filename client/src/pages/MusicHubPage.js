import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSearch, FiHeart, FiPlay, FiPause, FiMusic, FiYoutube } from 'react-icons/fi';
import './MusicHubPage.css';

function MusicHubPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [results, setResults] = useState({ itunes: [], youtube: [] });
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('search');
  const audioRef = useRef(null);

  const loadLibrary = async () => {
    try {
      const res = await axios.get('/api/music/favorites');
      setFavorites(res.data.favorites || []);
      setRecent(res.data.recentlyPlayed || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadLibrary();
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      setTimeout(() => {
        axios.get('/api/music/search', { params: { q, source: 'all' } })
          .then((res) => setResults({ itunes: res.data.itunes || [], youtube: res.data.youtube || [] }))
          .catch(() => {});
      }, 300);
    }
  }, [searchParams]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/music/search', {
        params: { q: query.trim(), source }
      });
      setResults({ itunes: res.data.itunes || [], youtube: res.data.youtube || [] });
      setTab('search');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const isFav = (trackId) => favorites.some((f) => f.trackId === trackId);

  const toggleFavorite = async (track) => {
    try {
      if (isFav(track.trackId)) {
        await axios.delete(`/api/music/favorites/${track.trackId}`);
        toast.success('Removed from favorites');
      } else {
        await axios.post('/api/music/favorites', track);
        toast.success('Added to favorites ❤️');
      }
      loadLibrary();
    } catch {
      toast.error('Could not update favorites');
    }
  };

  const playTrack = async (track) => {
    setCurrent(track);
    setIsPlaying(true);
    try {
      await axios.post('/api/music/play', track);
    } catch { /* local play still works */ }

    if (track.source === 'itunes' && track.previewUrl && audioRef.current) {
      audioRef.current.src = track.previewUrl;
      audioRef.current.play().catch(() => toast.error('Preview unavailable'));
    }
  };

  const togglePlayPause = () => {
    if (!current) return;
    if (current.source === 'youtube') return;
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const allResults = [
    ...(results.itunes || []).map((t) => ({ ...t, source: 'itunes' })),
    ...(results.youtube || []).map((t) => ({ ...t, source: 'youtube' }))
  ];

  const TrackRow = ({ track, showFav = true }) => (
    <div className={`track-row ${current?.trackId === track.trackId ? 'active' : ''}`}>
      <img src={track.artwork || '/default-avatar.png'} alt="" className="track-art" />
      <div className="track-meta" onClick={() => playTrack(track)}>
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
        <span className="track-source-badge">{track.source === 'youtube' ? '▶ YouTube' : '🎵 Preview'}</span>
      </div>
      <div className="track-actions">
        <button type="button" className="icon-btn play" onClick={() => playTrack(track)} title="Play">
          <FiPlay size={18} />
        </button>
        {showFav && (
          <button
            type="button"
            className={`icon-btn fav ${isFav(track.trackId) ? 'active' : ''}`}
            onClick={() => toggleFavorite(track)}
            title="Favorite"
          >
            <FiHeart size={18} fill={isFav(track.trackId) ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-scroll-page music-hub-page">
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      <header className="music-hub-header">
        <div>
          <h1><FiMusic /> ChatFlow Music</h1>
          <p>Search iTunes previews & YouTube — save favorites, listen anytime</p>
        </div>
      </header>

      <form className="music-search-bar" onSubmit={handleSearch}>
        <FiSearch size={20} />
        <input
          type="text"
          placeholder="Search songs, artists, albums..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">All sources</option>
          <option value="itunes">iTunes previews</option>
          <option value="youtube">YouTube</option>
        </select>
        <button type="submit" disabled={loading}>{loading ? '...' : 'Search'}</button>
      </form>

      <div className="music-tabs">
        <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>Search</button>
        <button className={tab === 'favorites' ? 'active' : ''} onClick={() => setTab('favorites')}>
          Favorites ({favorites.length})
        </button>
        <button className={tab === 'recent' ? 'active' : ''} onClick={() => setTab('recent')}>Recent</button>
      </div>

      {current && (
        <div className="now-playing-bar glass-panel">
          <img src={current.artwork} alt="" />
          <div className="np-info">
            <strong>{current.title}</strong>
            <span>{current.artist}</span>
          </div>
          {current.source === 'itunes' && current.previewUrl && (
            <button type="button" className="np-play" onClick={togglePlayPause}>
              {isPlaying ? <FiPause /> : <FiPlay />}
            </button>
          )}
          {current.source === 'youtube' && current.youtubeVideoId && (
            <span className="yt-badge"><FiYoutube /> Playing below</span>
          )}
        </div>
      )}

      {current?.source === 'youtube' && current.youtubeVideoId && (
        <div className="youtube-player-wrap">
          <iframe
            title="YouTube player"
            src={`https://www.youtube.com/embed/${current.youtubeVideoId}?autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      <div className="track-list">
        {tab === 'search' && (
          allResults.length === 0 ? (
            <p className="empty-hint">Search for music to get started</p>
          ) : allResults.map((t) => <TrackRow key={`${t.source}-${t.trackId}`} track={t} />)
        )}
        {tab === 'favorites' && (
          favorites.length === 0 ? (
            <p className="empty-hint">Tap ❤️ on any track to save it here</p>
          ) : favorites.map((t) => <TrackRow key={t.trackId} track={t} />)
        )}
        {tab === 'recent' && (
          recent.length === 0 ? (
            <p className="empty-hint">Your recently played tracks appear here</p>
          ) : recent.map((t, i) => <TrackRow key={`${t.trackId}-${i}`} track={t} />)
        )}
      </div>
    </div>
  );
}

export default MusicHubPage;
