import express from 'express';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';
import { emitToUser } from '../socket.js';

const router = express.Router();

async function searchItunes(query, limit = 20) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).map((t) => ({
    trackId: String(t.trackId),
    title: t.trackName,
    artist: t.artistName,
    artwork: t.artworkUrl100?.replace('100x100', '300x300') || '',
    previewUrl: t.previewUrl || '',
    youtubeVideoId: '',
    source: 'itunes',
    duration: Math.round((t.trackTimeMillis || 0) / 1000)
  }));
}

async function searchYouTube(query, limit = 12) {
  try {
    const instances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.adminforge.de'
    ];
    for (const base of instances) {
      try {
        const res = await fetch(
          `${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const items = (data.items || data || []).slice(0, limit);
        if (items.length) {
          return items.map((v) => ({
            trackId: v.url?.split('v=')[1] || v.id || String(Math.random()),
            title: v.title || 'Unknown',
            artist: v.uploaderName || v.uploader || 'YouTube',
            artwork: v.thumbnail || '',
            previewUrl: '',
            youtubeVideoId: (v.url || '').includes('watch?v=')
              ? v.url.split('v=')[1]?.split('&')[0]
              : (v.id || ''),
            source: 'youtube',
            duration: v.duration || 0
          }));
        }
      } catch { /* try next instance */ }
    }
  } catch (e) {
    console.error('YouTube search fallback:', e.message);
  }
  return [];
}

// GET /api/music/search?q=...&source=all|itunes|youtube
router.get('/search', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ itunes: [], youtube: [] });

    const source = req.query.source || 'all';
    const [itunes, youtube] = await Promise.all([
      source !== 'youtube' ? searchItunes(q) : [],
      source !== 'itunes' ? searchYouTube(q) : []
    ]);

    res.json({ itunes, youtube, query: q });
  } catch (err) {
    console.error('Music search error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('musicFavorites recentlyPlayed');
    res.json({
      favorites: user.musicFavorites || [],
      recentlyPlayed: user.recentlyPlayed || []
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/favorites', auth, async (req, res) => {
  try {
    const track = req.body;
    if (!track?.trackId) return res.status(400).json({ message: 'trackId required' });

    const user = await User.findById(req.user.id);
    const exists = user.musicFavorites?.some((f) => f.trackId === track.trackId);
    if (!exists) {
      user.musicFavorites = [
        { ...track, addedAt: new Date() },
        ...(user.musicFavorites || [])
      ].slice(0, 100);
      await user.save();
    }
    res.json({ favorites: user.musicFavorites, message: 'Added to favorites' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/favorites/:trackId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.musicFavorites = (user.musicFavorites || []).filter(
      (f) => f.trackId !== req.params.trackId
    );
    await user.save();
    res.json({ favorites: user.musicFavorites });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/play', auth, async (req, res) => {
  try {
    const track = req.body;
    const user = await User.findById(req.user.id);
    user.nowPlaying = {
      song: track.title,
      artist: track.artist,
      albumArt: track.artwork,
      previewUrl: track.previewUrl || '',
      youtubeVideoId: track.youtubeVideoId || '',
      source: track.source || 'itunes',
      active: true
    };
    user.recentlyPlayed = [
      { ...track, playedAt: new Date() },
      ...(user.recentlyPlayed || []).filter((r) => r.trackId !== track.trackId)
    ].slice(0, 25);
    await user.save();

    res.json({ nowPlaying: user.nowPlaying, recentlyPlayed: user.recentlyPlayed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/status', auth, async (req, res) => {
  try {
    const { song, artist, albumArt, active, previewUrl, youtubeVideoId, source } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { nowPlaying: { song, artist, albumArt, active, previewUrl, youtubeVideoId, source } },
      { new: true }
    );
    res.json(user.nowPlaying);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/status/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('nowPlaying');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.nowPlaying || { active: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
