import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiHeart, FiDownload, FiShare2, FiZap } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import axios from 'axios';
import '../styles/ReelsViewer.css';

function ReelsViewer({ stories, onClose }) {
  const [feedMode, setFeedMode] = useState('stories'); // 'stories' or 'trending'
  const [trendingReels, setTrendingReels] = useState([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const containerRef = useRef(null);
  const videoRefs = useRef({});
  
  // Particle system for double-tap reactions
  const [particles, setParticles] = useState([]); // Array of { id, x, y, char, scale, rot, opacity }
  const particleIdRef = useRef(0);

  // Track double tap
  const lastTapRef = useRef(0);

  // Programmatic Video Autoplay Engine
  useEffect(() => {
    // Pause all inactive videos
    Object.keys(videoRefs.current).forEach(key => {
      const vid = videoRefs.current[key];
      if (vid) {
        try {
          vid.pause();
        } catch (e) {
          // ignore abort interruptions
        }
      }
    });

    // Play currently centered active video
    const currentSlides = feedMode === 'stories' ? stories : trendingReels;
    if (feedMode === 'trending' && currentSlides[activeIdx]) {
      const activeVideoId = currentSlides[activeIdx].id;
      const activeVideo = videoRefs.current[activeVideoId];
      if (activeVideo) {
        activeVideo.muted = isMuted;
        activeVideo.play().catch(err => {
          console.warn("Autoplay was interrupted or blocked by browser:", err);
        });
      }
    }
  }, [activeIdx, feedMode, trendingReels, stories, isMuted]);

  // Fetch trending reels from live Gemini/fallback service
  useEffect(() => {
    if (feedMode === 'trending' && trendingReels.length === 0) {
      fetchTrendingReels();
    }
    setActiveIdx(0);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [feedMode]);

  const fetchTrendingReels = async () => {
    setIsLoadingTrending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/stories/reels/trending?offset=0', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setTrendingReels(res.data);
    } catch (err) {
      toast.error('Failed to load trending reels.');
    } finally {
      setIsLoadingTrending(false);
    }
  };

  const fetchMoreTrendingReels = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/stories/reels/trending?offset=${trendingReels.length}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setTrendingReels(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const filteredNew = res.data.filter(item => !existingIds.has(item.id));
        if (filteredNew.length === 0) {
          // Wrap around suffix fallback to allow endless scrolling even on fallback sets
          return [...prev, ...res.data.map((item, idx) => ({ ...item, id: `${item.id}_dup_${prev.length + idx}` }))];
        }
        return [...prev, ...filteredNew];
      });
    } catch (err) {
      console.error('Error fetching more reels:', err);
    }
  };

  const currentSlides = feedMode === 'stories' ? stories : trendingReels;

  // Handle vertical snapping index tracking
  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollPos = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const currentIdx = Math.round(scrollPos / height);
    if (currentIdx !== activeIdx && currentIdx >= 0 && currentIdx < currentSlides.length) {
      setActiveIdx(currentIdx);

      // Trigger endless scroll fetch when reaching the penultimate card
      if (feedMode === 'trending' && currentIdx >= currentSlides.length - 2) {
        fetchMoreTrendingReels();
      }
    }
  };

  const handleDoubleTap = (e, story) => {
    e.preventDefault();
    const containerRect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - containerRect.left;
    const clickY = e.clientY - containerRect.top;

    triggerEmojiBurst(clickX, clickY);
    triggerReactionOnBackend(story._id);
  };

  const triggerEmojiBurst = (startX, startY) => {
    const emojis = ['❤️', '🔥', '😂', '💯', '✨', '⚡'];
    const newParticles = [];

    // Create 12 floating particle emojis bursting around the click point
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      newParticles.push({
        id: particleIdRef.current++,
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - 2, // Go upwards
        char: emojis[Math.floor(Math.random() * emojis.length)],
        scale: 0.8 + Math.random() * 0.8,
        rot: Math.random() * 45 - 22.5,
        opacity: 1
      });
    }

    setParticles(prev => [...prev, ...newParticles]);
  };

  // Animate particles
  useEffect(() => {
    if (particles.length === 0) return;

    const frame = requestAnimationFrame(() => {
      setParticles(prev => 
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.1, // Slight gravity
            rot: p.rot + 2,
            opacity: p.opacity - 0.03
          }))
          .filter(p => p.opacity > 0)
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [particles]);

  const triggerReactionOnBackend = async (storyId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/stories/${storyId}/react`, { emoji: '🔥' }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = async (url, username) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${username}_snap_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Snap saved successfully!');
    } catch (err) {
      toast.error('Failed to download snap.');
    }
  };

  return (
    <div className="reels-overlay">
      <button className="reels-close-btn" onClick={onClose} style={{ zIndex: 110 }}>
        <FiX />
      </button>

      {/* Segmented Mode Selector */}
      <div className="reels-mode-header">
        <button 
          className={`reels-mode-btn ${feedMode === 'stories' ? 'active' : ''}`} 
          onClick={() => setFeedMode('stories')}
        >
          👥 Friend Snaps
        </button>
        <button 
          className={`reels-mode-btn ${feedMode === 'trending' ? 'active' : ''}`} 
          onClick={() => setFeedMode('trending')}
        >
          🔥 Live Global Shorts
        </button>
      </div>

      {isLoadingTrending && feedMode === 'trending' && (
        <div className="reels-loader">
          <div className="spinner">🔮</div>
          <p>Tuning into trending viral feeds...</p>
        </div>
      )}

      {!isLoadingTrending && currentSlides.length === 0 && (
        <div className="reels-empty-state">
          <span>📭</span>
          <p>{feedMode === 'stories' ? 'No snaps uploaded today. Upload yours now!' : 'Trending feeds temporarily unavailable.'}</p>
        </div>
      )}

      <div 
        className="reels-container" 
        ref={containerRef} 
        onScroll={handleScroll}
      >
        {!isLoadingTrending && currentSlides.map((story, index) => {
          const isTrending = feedMode === 'trending';
          const isImage = !isTrending && story.mediaType === 'image';
          
          return (
            <div 
              key={isTrending ? story.id : story._id} 
              className="reel-slide"
              onDoubleClick={(e) => handleDoubleTap(e, story)}
            >
              {/* Immersive background/artwork/video */}
              {isTrending ? (
                <div className="reel-media-wrapper video-frame" style={{ position: 'relative' }}>
                  <video
                    key={story.id}
                    ref={el => videoRefs.current[story.id] = el}
                    src={story.videoUrl}
                    className="reel-video-element"
                    autoPlay
                    loop
                    muted={isMuted}
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                    className="video-mute-btn"
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </button>
                </div>
              ) : isImage ? (
                <div className="reel-media-wrapper">
                  <img src={story.mediaUrl} alt="Reel Moment" className="reel-image" />
                  <div className="reel-double-tap-tip">Double tap to react 🔥</div>
                </div>
              ) : (
                <div className="reel-text-wrapper">
                  <p>{story.content}</p>
                </div>
              )}

              {/* Floating hearts particles overlay */}
              {index === activeIdx && particles.map(p => (
                <div
                  key={p.id}
                  className="floating-emoji-particle"
                  style={{
                    left: `${p.x}px`,
                    top: `${p.y}px`,
                    transform: `translate(-50%, -50%) scale(${p.scale}) rotate(${p.rot}deg)`,
                    opacity: p.opacity
                  }}
                >
                  {p.char}
                </div>
              ))}

              {/* Glassmorphic Overlay Content */}
              <div className="reel-overlay-card">
                {isTrending ? (
                  <>
                    <div className="reel-creator-info">
                      <div className="reel-avatar-trending">🔥</div>
                      <div>
                        <h4>@{story.creator}</h4>
                        <p className="reel-time">{story.views || 'Live'}</p>
                      </div>
                    </div>
                    <p className="reel-caption">{story.title}</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {story.tags?.map(t => (
                        <span key={t} className="trending-tag">#{t}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="reel-creator-info">
                      <img 
                        src={story.userId.profilePicture || '/default-avatar.png'} 
                        alt={story.userId.username} 
                        className="reel-avatar"
                      />
                      <div>
                        <h4>@{story.userId.username}</h4>
                        <p className="reel-time">{formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}</p>
                      </div>
                    </div>
                    <p className="reel-caption">{story.content || 'Life updates with Kane'}</p>
                  </>
                )}
              </div>

              {/* Action Floating Buttons Panel */}
              <div className="reel-actions-panel">
                <div className="reel-action-btn-group">
                  <button className="reel-action-btn like" onClick={(e) => handleDoubleTap({ ...e, clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }, story)}>
                    <FiHeart fill="#ef4444" color="#ef4444" />
                    <span>React</span>
                  </button>
                  
                  {!isTrending && isImage && (
                    <button 
                      className="reel-action-btn save" 
                      onClick={() => handleDownload(story.mediaUrl, story.userId.username)}
                    >
                      <FiDownload />
                      <span>Save</span>
                    </button>
                  )}

                  {!isTrending && (
                    <div className="viewer-indicator-card">
                      👁️ {story.viewedBy?.length || 0}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ReelsViewer;
