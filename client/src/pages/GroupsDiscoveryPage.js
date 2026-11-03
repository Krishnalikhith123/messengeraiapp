import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiSearch, FiUsers } from 'react-icons/fi';
import '../styles/GroupFeatures.css';

function GroupsDiscoveryPage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async (q = '') => {
    setLoading(true);
    try {
      const res = await axios.get('/api/groups/discover', { params: { topic: q } });
      setGroups(res.data);
    } catch {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const join = async (chatId) => {
    try {
      await axios.post(`/api/groups/discover/${chatId}/join`);
      toast.success('Joined group!');
      navigate(`/chat/${chatId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not join');
    }
  };

  return (
    <div className="app-scroll-page groups-discovery-page">
      <header>
        <h1><FiUsers /> Group discovery <span className="feature-tag">#103</span></h1>
        <p>Browse public groups by topic and join instantly.</p>
      </header>

      <form className="discover-search" onSubmit={(e) => { e.preventDefault(); load(topic); }}>
        <FiSearch />
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Search topics: gaming, music, study…" />
        <button type="submit">Search</button>
      </form>

      {loading ? (
        <p>Loading public groups…</p>
      ) : (
        <div className="discover-grid">
          {groups.map((g) => (
            <div key={g._id} className="discover-card glass-panel">
              <img src={g.groupImage || '/default-avatar.png'} alt="" />
              <div>
                <h3>{g.groupName}</h3>
                <p>{g.groupDescription || 'No description'}</p>
                <div className="topic-tags">
                  {(g.topics || []).map((t) => <span key={t}>{t}</span>)}
                </div>
                <p className="member-count">{g.memberCount} members</p>
              </div>
              <button type="button" onClick={() => join(g._id)}>Join</button>
            </div>
          ))}
          {groups.length === 0 && <p className="empty-discover">No public groups match. Create one and mark it public in group settings.</p>}
        </div>
      )}
    </div>
  );
}

export default GroupsDiscoveryPage;
