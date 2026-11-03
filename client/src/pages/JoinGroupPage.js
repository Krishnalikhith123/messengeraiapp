import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import '../styles/GroupFeatures.css';

function JoinGroupPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/groups/invite/${code}/preview`)
      .then((res) => setPreview(res.data))
      .catch(() => toast.error('Invalid or expired invite'))
      .finally(() => setLoading(false));
  }, [code]);

  const join = async () => {
    try {
      const res = await axios.post(`/api/groups/invite/${code}/join`);
      toast.success('Welcome to the group!');
      navigate(`/chat/${res.data.chatId || res.data.chat?._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Join failed');
    }
  };

  if (loading) return <div className="app-scroll-page join-page">Loading invite…</div>;

  return (
    <div className="app-scroll-page join-page">
      <div className="join-card glass-panel">
        <span className="feature-tag">#102 Invite link</span>
        {preview ? (
          <>
            <img src={preview.groupImage || '/default-avatar.png'} alt="" className="join-avatar" />
            <h1>{preview.groupName}</h1>
            <p>{preview.description}</p>
            <p>{preview.memberCount} members</p>
            <button type="button" className="join-btn" onClick={join}>Join group</button>
          </>
        ) : (
          <p>This invite link is invalid or has expired.</p>
        )}
      </div>
    </div>
  );
}

export default JoinGroupPage;
