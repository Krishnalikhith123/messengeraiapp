import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiArrowRight, FiCloud, FiMessageCircle, FiTrendingUp, FiX } from 'react-icons/fi';
import '../styles/AIBriefing.css';

const MOODS = [
  { id: 'happy', label: 'Happy' },
  { id: 'focused', label: 'Focused' },
  { id: 'tired', label: 'Tired' },
  { id: 'stressed', label: 'Stressed' },
  { id: 'sad', label: 'Low' }
];

function AIBriefing({ isOpen, onClose }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('messages');
  const [askedNews, setAskedNews] = useState(false);
  const [mindfulness, setMindfulness] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    axios.get('/api/ai/briefing/morning')
      .then((res) => setBriefing(res.data))
      .catch(() => toast.error('Could not load morning briefing'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleMood = async (mood) => {
    try {
      const res = await axios.post('/api/ai/briefing/mood-checkin', { mood: mood.label, text: mood.id });
      setMindfulness(res.data.mindfulness || 'Take one calm minute before your next task.');
      toast.success('Mood check-in saved');
    } catch {
      toast.error('Could not save mood');
    }
  };

  if (!isOpen) return null;

  const data = briefing?.briefing || {};
  const unread = data.unreadMessages || { count: 0, previews: [] };
  const news = data.topNews || [];

  return (
    <div className="briefing-overlay" onClick={onClose}>
      <div className="briefing-modal" onClick={(event) => event.stopPropagation()}>
        <header className="briefing-header">
          <div className="briefing-title">
            <h2>Hey boss</h2>
            <p>Your Kane briefing is ready.</p>
          </div>
          <button className="briefing-close" onClick={onClose} type="button"><FiX /></button>
        </header>

        {loading ? (
          <div className="briefing-loading">
            <div className="spinner" />
            <p>Checking messages, news, wellness, and reminders...</p>
          </div>
        ) : (
          <div className="briefing-content">
            <div className="briefing-question">
              <strong>Want to know what happened while you were away?</strong>
              <span>Kane found {unread.count || 0} unread messages.</span>
            </div>

            <div className="briefing-tabs">
              <button className={activeTab === 'messages' ? 'tab active' : 'tab'} onClick={() => setActiveTab('messages')} type="button">
                <FiMessageCircle /> Messages
              </button>
              <button className={activeTab === 'wellness' ? 'tab active' : 'tab'} onClick={() => setActiveTab('wellness')} type="button">
                <FiTrendingUp /> Mindful
              </button>
              {askedNews && (
                <button className={activeTab === 'news' ? 'tab active' : 'tab'} onClick={() => setActiveTab('news')} type="button">
                  News
                </button>
              )}
            </div>

            {activeTab === 'messages' && (
              <section className="briefing-section">
                {unread.count === 0 ? (
                  <p className="empty-state">You are caught up. No unread messages right now.</p>
                ) : (
                  <div className="message-previews">
                    {unread.previews?.map((preview) => (
                      <div key={preview.chatId || preview.name} className="message-preview">
                        <div className="preview-header">
                          <span className="preview-name">{preview.name}</span>
                          <span className="preview-count">{preview.count} new</span>
                        </div>
                        <p className="preview-text">{preview.lastMessage}</p>
                      </div>
                    ))}
                  </div>
                )}

                {!askedNews && (
                  <div className="briefing-prompt">
                    <p>Do you want to know what is happening around the world?</p>
                    <button
                      className="prompt-btn"
                      type="button"
                      onClick={() => {
                        setAskedNews(true);
                        setActiveTab('news');
                      }}
                    >
                      Yes, show top 5 news <FiArrowRight />
                    </button>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'news' && (
              <section className="briefing-section news-section">
                <h3>Top 5 News</h3>
                <div className="news-list">
                  {news.slice(0, 5).map((article, idx) => (
                    <a key={`${article.title}-${idx}`} className="news-card" href={article.url || '#'} target="_blank" rel="noreferrer">
                      {article.image && <img src={article.image} alt="" className="news-image" />}
                      <div className="news-content">
                        <h4>{article.title}</h4>
                        <p>{article.description}</p>
                        <small>{article.source}</small>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'wellness' && (
              <section className="briefing-section wellness-section">
                <h3>Mindfulness check-in</h3>
                <div className="mood-picker">
                  {MOODS.map((mood) => (
                    <button key={mood.id} className="mood-btn" type="button" onClick={() => handleMood(mood)}>
                      {mood.label}
                    </button>
                  ))}
                </div>
                {mindfulness && <p className="mindfulness-card">{mindfulness}</p>}

                {data.weather && (
                  <div className="wellness-card weather-card">
                    <h4><FiCloud /> Weather</h4>
                    <p>{data.weather.city}: {data.weather.temp} C, {data.weather.condition}</p>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        <footer className="briefing-footer">
          <button className="briefing-close-btn" onClick={onClose} type="button">Start my day</button>
        </footer>
      </div>
    </div>
  );
}

export default AIBriefing;
