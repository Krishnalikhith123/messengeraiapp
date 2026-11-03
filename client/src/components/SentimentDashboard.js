import React, { useState, useEffect } from 'react';
import './SentimentDashboard.css';

const SentimentDashboard = ({ chat, onClose }) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch('/api/users/relationship/dashboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ chatId: chat._id })
        });

        if (!response.ok) {
          throw new Error('Failed to retrieve relationship dashboard analytics');
        }

        const data = await response.json();
        setAnalytics(data);
      } catch (err) {
        console.error('Analytics retrieval error:', err);
        setError('Failed to compute relationship vibes. Spark up the chat to generate data!');
      } finally {
        setLoading(false);
      }
    };

    if (chat?._id) {
      fetchAnalytics();
    }
  }, [chat?._id]);

  // Vibe tag color mapper
  const getVibeColor = (vibe) => {
    switch (vibe?.toLowerCase()) {
      case 'vibrant': return { text: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', icon: '🔥' };
      case 'chilled': return { text: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', icon: '🥤' };
      case 'analytical': return { text: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', icon: '🧠' };
      case 'quiet': return { text: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: '#64748b', icon: '💤' };
      default: return { text: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', icon: '⚡' };
    }
  };

  const vibeStyle = getVibeColor(analytics?.vibe);

  return (
    <div className="sentiment-dashboard-overlay">
      <div className="sentiment-modal glass-panel">
        <div className="sentiment-header">
          <div className="header-left">
            <span className="analytics-logo">📊</span>
            <div>
              <h3>Relationship Health Dashboard</h3>
              <p>Opt-in Sentiment & Conversational Vibe Index</p>
            </div>
          </div>
          <button className="close-dashboard-btn" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <div className="dashboard-loading">
            <div className="spinner"></div>
            <p>Scanning conversation vibes via Kane AI...</p>
          </div>
        ) : error ? (
          <div className="dashboard-error">
            <span className="error-icon">⚠️</span>
            <p>{error}</p>
          </div>
        ) : (
          <div className="dashboard-content">
            {/* Top Grid: Vibe Badge and Radial Score Gauge */}
            <div className="dashboard-metrics-grid">
              
              {/* Radial Score Gauge */}
              <div className="metric-box score-box">
                <h4>Conversation Chemistry</h4>
                
                <div className="radial-progress-container">
                  <svg className="radial-svg" width="120" height="120" viewBox="0 0 120 120">
                    <circle 
                      className="radial-bg-circle" 
                      cx="60" 
                      cy="60" 
                      r="50" 
                      stroke="rgba(255,255,255,0.06)" 
                      strokeWidth="8" 
                      fill="none" 
                    />
                    <circle 
                      className="radial-glow-circle" 
                      cx="60" 
                      cy="60" 
                      r="50" 
                      stroke="url(#gradient)" 
                      strokeWidth="8" 
                      fill="none" 
                      strokeDasharray="314"
                      strokeDashoffset={314 - (314 * (analytics?.chemistryIndex || 50)) / 100}
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  
                  <div className="radial-score-label">
                    <span className="number">{analytics?.chemistryIndex}%</span>
                    <span className="sub">Match</span>
                  </div>
                </div>
                
                <p className="radial-desc">Based on matching styles, emotional vibes, and rhythm!</p>
              </div>

              {/* Vibe and Speed Cards */}
              <div className="metric-cards-stack">
                {/* Vibe Card */}
                <div 
                  className="metric-card vibe-card" 
                  style={{ backgroundColor: vibeStyle.bg, border: `1px solid ${vibeStyle.border}` }}
                >
                  <span className="card-icon">{vibeStyle.icon}</span>
                  <div>
                    <span className="card-label">Conversational Vibe</span>
                    <span className="card-value" style={{ color: vibeStyle.text }}>{analytics?.vibe}</span>
                  </div>
                </div>

                {/* Speed Latency Card */}
                <div className="metric-card speed-card">
                  <span className="card-icon">⚡</span>
                  <div>
                    <span className="card-label">Reply Latency Score</span>
                    <span className="card-value">{analytics?.latencyScore}/100</span>
                    <div className="speed-bar">
                      <div 
                        className="speed-fill" 
                        style={{ width: `${analytics?.latencyScore}%`, background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section: Kane's Coaching Panel */}
            <div className="coaching-panel">
              <div className="coaching-header">
                <span className="coach-avatar">🤖</span>
                <div>
                  <h5>Kane's Relationship Advice</h5>
                  <p>AI-Powered Connection Coach</p>
                </div>
              </div>
              <blockquote className="coaching-quote">
                "{analytics?.coachingTip}"
              </blockquote>
            </div>

            <div className="opt-in-disclaimer">
              🔒 Privacy Shield: This is an opt-in analytical service. No conversational telemetry is saved or stored outside your private database session.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SentimentDashboard;
