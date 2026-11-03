import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiMusic, FiPlay, FiPause, FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../styles/MusicStatus.css';

function MusicStatus({ userId, editable = false }) {
  const [song, setSong] = useState('');
  const [artist, setArtist] = useState('');
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const fetchMusic = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/music/status/${userId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.data) {
          setSong(res.data.song || '');
          setArtist(res.data.artist || '');
          setActive(res.data.active || false);
        }
      } catch (err) {
        console.error('Error fetching music status:', err);
      } finally {
        setLoading(false);
      }
    };
    if (userId) fetchMusic();
  }, [userId]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/music/status', { song, artist, active: true }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setActive(true);
      setIsEditing(false);
      toast.success('Music status updated! 🎵');
    } catch (err) {
      toast.error('Failed to update music status');
    }
  };

  const handleToggleActive = async () => {
    try {
      const token = localStorage.getItem('token');
      const nextActive = !active;
      await axios.put('/api/music/status', { song, artist, active: nextActive }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setActive(nextActive);
      toast.success(nextActive ? 'Music status active 🎶' : 'Music status paused ⏸️');
    } catch (err) {
      toast.error('Failed to toggle music status');
    }
  };

  if (loading) return null;

  if (editable && isEditing) {
    return (
      <form onSubmit={handleUpdate} className="music-status-edit-form">
        <h4>🎵 Update Now Playing</h4>
        <input
          type="text"
          placeholder="Song Title..."
          value={song}
          onChange={(e) => setSong(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Artist..."
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          required
        />
        <div className="music-edit-actions">
          <button type="submit" className="music-save-btn">Save</button>
          <button type="button" className="music-cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  if (!active && !editable) return null;

  return (
    <div className={`music-status-card ${active ? 'playing' : ''}`}>
      <div className="vinyl-wrapper">
        <div className="vinyl-disc">
          <div className="vinyl-center"></div>
        </div>
        <FiMusic className="music-center-icon" />
      </div>

      <div className="music-info">
        {active ? (
          <>
            <span className="song-title">{song || 'Unknown Song'}</span>
            <span className="artist-name">{artist || 'Unknown Artist'}</span>
            <div className="waveform-animation">
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
            </div>
          </>
        ) : (
          <span className="no-music-text">Not listening to anything</span>
        )}
      </div>

      {editable && (
        <div className="music-controls">
          {song && artist && (
            <button className="music-toggle-btn" onClick={handleToggleActive} title={active ? 'Pause Status' : 'Activate Status'}>
              {active ? <FiPause /> : <FiPlay />}
            </button>
          )}
          <button className="music-add-btn" onClick={() => setIsEditing(true)} title="Change Song">
            <FiPlus />
          </button>
        </div>
      )}
    </div>
  );
}

export default MusicStatus;
