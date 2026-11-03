import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AnalyticsPage.css';

// Minimal bar chart using pure CSS/inline styles
function BarChart({ data, labelKey, valueKey, color = '#7c3aed' }) {
  if (!data || data.length === 0) return <div className="no-data">No data yet</div>;
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-item">
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ height: `${(d[valueKey] / max) * 100}%`, background: color }}
              title={`${d[valueKey]}`}
            />
          </div>
          <span className="bar-label">{d[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card" style={{ '--card-color': color }}>
      <span className="stat-icon">{icon}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/analytics/me')
      .then(res => { setStats(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="app-scroll-page analytics-loading">
      <div className="pulse-ring" />
      <p>Loading your stats…</p>
    </div>
  );

  if (!stats) return <div className="analytics-empty">Could not load analytics.</div>;

  // Format activeHours for chart (0-23 → "12am", "6am" etc.)
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    if (i === 0) return '12am';
    if (i === 12) return '12pm';
    return i < 12 ? `${i}am` : `${i - 12}pm`;
  });
  const hoursData = hourLabels.map((label, h) => {
    const found = stats.activeHours.find(a => a._id === h);
    return { label: h % 3 === 0 ? label : '', count: found ? found.count : 0 };
  });

  // Messages per day — last 14 days
  const last14 = stats.messagesPerDay.slice(-14).map(d => ({
    label: d._id.slice(5), // "05-20"
    count: d.count
  }));

  return (
    <div className="app-scroll-page analytics-page">
      <div className="analytics-header">
        <h1>📊 Your Chat Analytics</h1>
        <p>Your personal messaging stats, all in one place.</p>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards-grid">
        <StatCard icon="💬" value={stats.totalSent.toLocaleString()} label="Messages Sent" color="#7c3aed" />
        <StatCard icon="📷" value={stats.totalSnapsSent.toLocaleString()} label="Snaps Sent" color="#f59e0b" />
        <StatCard icon="🔥" value={stats.maxStreak} label="Best Streak" color="#ef4444" />
        <StatCard icon="📊" value={stats.totalPolls} label="Polls Created" color="#10b981" />
        <StatCard icon="🌐" value={stats.totalStreakDays} label="Total Streak Days" color="#3b82f6" />
      </div>

      {/* Messages Per Day */}
      <div className="analytics-card">
        <h2>📈 Messages Per Day (Last 14 Days)</h2>
        <BarChart data={last14} labelKey="label" valueKey="count" color="linear-gradient(135deg,#7c3aed,#db2777)" />
        {last14.length === 0 && <p className="no-data">No messages in the last 14 days.</p>}
      </div>

      {/* Active Hours */}
      <div className="analytics-card">
        <h2>⏰ Your Most Active Hours</h2>
        <BarChart data={hoursData} labelKey="label" valueKey="count" color="#f59e0b" />
      </div>

      {/* Top Friends */}
      <div className="analytics-card">
        <h2>🏆 Most Messaged Friends</h2>
        {stats.topFriends.length === 0 ? (
          <p className="no-data">No friends data yet.</p>
        ) : (
          <div className="top-friends-list">
            {stats.topFriends.map((f, i) => (
              <div key={f._id} className="friend-row">
                <span className="friend-rank">#{i + 1}</span>
                <img
                  src={f.profilePicture || '/default-avatar.png'}
                  alt={f.username}
                  className="friend-avatar"
                />
                <span className="friend-name">{f.username}</span>
                <div className="friend-bar-wrap">
                  <div
                    className="friend-bar"
                    style={{
                      width: `${(f.count / (stats.topFriends[0]?.count || 1)) * 100}%`
                    }}
                  />
                </div>
                <span className="friend-count">{f.count} msgs</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
