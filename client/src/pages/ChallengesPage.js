import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiAward, FiCheckCircle, FiGift, FiRefreshCw, FiZap } from 'react-icons/fi';
import '../styles/ChallengesPage.css';

function ChallengesPage() {
  const [challenges, setChallenges] = useState([]);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState('Level 1 - Rookie');
  const [levelInfo, setLevelInfo] = useState(null);
  const [xpToNext, setXpToNext] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);

  const notifyProgress = useCallback((data) => {
    (data.newlyCompleted || []).forEach((challenge) => {
      toast.success(`Challenge completed: ${challenge.title}. +${challenge.xpReward} XP`);
    });

    if (data.levelUp) {
      toast.success(`Level up! You reached ${data.levelUp.title}. New rewards unlocked.`);
    }
  }, []);

  const fetchChallenges = useCallback(async (showToast = false) => {
    try {
      setLoading(true);
      const res = await axios.get('/api/challenges/today');
      setChallenges(res.data.challenges || []);
      setXp(res.data.xp || 0);
      setLevel(res.data.level || 'Level 1 - Rookie');
      setLevelInfo(res.data.levelInfo || null);
      setXpToNext(res.data.xpToNext || 0);
      setProgressPercent(res.data.progressPercent || 0);
      setMetrics(res.data.metrics || {});
      notifyProgress(res.data);
      if (showToast) toast.success('Kane re-checked your challenge progress');
    } catch (err) {
      toast.error('Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }, [notifyProgress]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  if (loading) {
    return (
      <div className="app-scroll-page challenges-loading">
        <div className="challenges-spinner" />
        <p>Kane is analyzing your progress...</p>
      </div>
    );
  }

  return (
    <div className="app-scroll-page challenges-page">
      <div className="challenges-container">
        <section className="challenges-hero">
          <div className="hero-content">
            <h1>Progression Challenges</h1>
            <p>Kane auto-checks your real activity. Complete challenges, earn XP, level up, and unlock rewards.</p>
          </div>
          <div className="hero-stats">
            <div className="stat-card level-stat">
              <span className="stat-label">Current Level</span>
              <span className="stat-value">{level}</span>
            </div>
            <div className="stat-card xp-stat">
              <span className="stat-label">Total XP</span>
              <span className="stat-value"><FiZap /> {xp}</span>
            </div>
          </div>
        </section>

        <section className="progression-card">
          <div className="progression-header">
            <div>
              <h3>Level Progress</h3>
              <p>{levelInfo?.nextXp ? `${xpToNext} XP to next level` : 'Maximum level reached'}</p>
            </div>
            <button type="button" onClick={() => fetchChallenges(true)}>
              <FiRefreshCw /> Re-check
            </button>
          </div>
          <div className="progress-bar-wrapper">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="unlock-row">
            {(levelInfo?.unlocks || []).map((unlock) => (
              <span key={unlock}><FiGift /> {unlock}</span>
            ))}
          </div>
        </section>

        <section className="metrics-strip">
          <span>Snaps: {metrics.snapsSent || 0}</span>
          <span>Messages: {metrics.messagesSent || 0}</span>
          <span>Active days: {metrics.activeDays || 0}</span>
          <span>Health check-ins: {metrics.healthCheckIns || 0}</span>
          <span>Game wins: {metrics.gameWins || 0}</span>
        </section>

        <section className="challenges-section">
          <h2>Level {levelInfo?.number || 1} Challenge Set</h2>
          <div className="challenges-grid">
            {challenges.map((challenge) => (
              <article key={challenge.id} className={`challenge-card ${challenge.completed ? 'completed' : ''}`}>
                <div className="challenge-icon">
                  {challenge.completed ? <FiCheckCircle className="icon-success" /> : <FiAward className="icon-pending" />}
                </div>
                <div className="challenge-details">
                  <div className="challenge-title-row">
                    <h3>{challenge.title}</h3>
                    <span><FiZap /> +{challenge.xpReward} XP</span>
                  </div>
                  <p>{challenge.description}</p>
                  <div className="challenge-progress-line">
                    <div style={{ width: `${challenge.progressPercent}%` }} />
                  </div>
                  <small>{challenge.progress} / {challenge.target} {challenge.unit}</small>
                </div>
                <div className="challenge-action">
                  {challenge.completed ? (
                    <span className="completed-badge">Claimed</span>
                  ) : (
                    <span className="pending-badge">Auto-tracked</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default ChallengesPage;
