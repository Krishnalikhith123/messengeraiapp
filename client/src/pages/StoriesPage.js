import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import StoryViewer from '../components/StoryViewer';
import StoryCreator from '../components/StoryCreator';
import ReelsViewer from '../components/ReelsViewer';
import toast from 'react-hot-toast';
import axios from 'axios';
import { FiArrowLeft, FiPlus, FiSearch, FiZap } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import '../styles/StoriesPage.css';

function StoriesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [showCreator, setShowCreator] = useState(false);
  const [showReels, setShowReels] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, friends, my

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get('/api/stories');
      setStories(response.data);
    } catch (error) {
      toast.error('Failed to load stories');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStory = async (content, mediaUrl, mediaType) => {
    try {
      const response = await axios.post('/api/stories', {
        content,
        mediaUrl,
        mediaType
      });
      setStories([response.data, ...stories]);
      setShowCreator(false);
      toast.success('Story created!');
    } catch (error) {
      toast.error('Failed to create story');
      console.error('Error:', error);
    }
  };

  const handleDeleteStory = async (storyId) => {
    try {
      await axios.delete(`/api/stories/${storyId}`);
      setStories(stories.filter(s => s._id !== storyId));
      setSelectedStory(null);
      toast.success('Story deleted');
    } catch (error) {
      toast.error('Failed to delete story');
    }
  };

  // Filter stories based on search and type
  const filteredStories = stories.filter(story => {
    const matchesSearch = story.userId.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'my') {
      return story.userId._id === user.id && matchesSearch;
    } else if (filterType === 'friends') {
      return story.userId._id !== user.id && matchesSearch;
    }
    return matchesSearch;
  });

  // Group stories by user
  const groupedStories = filteredStories.reduce((acc, story) => {
    const key = story.userId._id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(story);
    return acc;
  }, {});

  // Get unique users with stories
  const storyUsers = Object.keys(groupedStories).map(userId => {
    const userStories = groupedStories[userId];
    return {
      userId,
      user: userStories[0].userId,
      stories: userStories,
      unviewedCount: userStories.filter(s => !s.viewedBy?.some(v => v.userId === user.id)).length
    };
  });

  return (
    <div className="stories-page">
      {/* Header */}
      <div className="stories-header">
        <div className="stories-header-top">
          <button className="stories-back-btn" onClick={() => navigate('/chats')}>
            <FiArrowLeft size={24} />
          </button>
          <div className="stories-title-section">
            <h1>Stories</h1>
            <p className="stories-subtitle">Share your moments</p>
          </div>
          <button 
            className="watch-reels-btn"
            onClick={() => setShowReels(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(236, 72, 153, 0.3)',
              transition: 'transform 0.2s ease',
              marginRight: '12px'
            }}
          >
            <span>🎬 Reels</span>
          </button>
          <button 
            className="create-story-btn"
            onClick={() => setShowCreator(true)}
            title="Create Story"
          >
            <FiPlus size={24} />
            <span>Add</span>
          </button>
        </div>

        {/* Search and Filter */}
        <div className="stories-controls">
          <div className="search-stories">
            <FiSearch size={20} />
            <input
              type="text"
              placeholder="Search stories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-buttons">
            <button 
              className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All Stories
            </button>
            <button 
              className={`filter-btn ${filterType === 'friends' ? 'active' : ''}`}
              onClick={() => setFilterType('friends')}
            >
              Friends
            </button>
            <button 
              className={`filter-btn ${filterType === 'my' ? 'active' : ''}`}
              onClick={() => setFilterType('my')}
            >
              My Stories
            </button>
          </div>
        </div>
      </div>

      {/* Story Creator Modal */}
      {showCreator && (
        <StoryCreator
          onClose={() => setShowCreator(false)}
          onCreate={handleCreateStory}
        />
      )}

      {/* Story Viewer Modal */}
      {selectedStory && (
        <StoryViewer
          story={selectedStory}
          onClose={() => setSelectedStory(null)}
          onDelete={() => handleDeleteStory(selectedStory._id)}
          isOwner={selectedStory.userId._id === user.id}
        />
      )}

      {/* Stories Grid */}
      <div className="stories-content">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading stories...</p>
          </div>
        ) : storyUsers.length === 0 ? (
          <div className="empty-stories">
            <div className="empty-icon">📖</div>
            <h3>No stories yet</h3>
            <p>Be the first to share your moment!</p>
            <button 
              className="create-first-story-btn"
              onClick={() => setShowCreator(true)}
            >
              <FiPlus size={20} /> Create Story
            </button>
          </div>
        ) : (
          <div className="stories-grid">
            {storyUsers.map(({ userId, user: storyUser, stories: userStories, unviewedCount }) => (
              <div key={userId} className="story-user-section">
                {/* User Story Ring */}
                <div className="story-user-ring">
                  <div className={`ring-container ${unviewedCount > 0 ? 'unviewed' : 'viewed'}`}>
                    <img 
                      src={storyUser.profilePicture || '/default-avatar.png'} 
                      alt={storyUser.username}
                      className="story-user-avatar"
                      onClick={() => setSelectedStory(userStories[0])}
                    />
                    {unviewedCount > 0 && (
                      <div className="unviewed-badge">{unviewedCount}</div>
                    )}
                  </div>
                  <p className="story-username">{storyUser.username}</p>
                </div>

                {/* User Stories Grid */}
                <div className="user-stories-grid">
                  {userStories.map(story => {
                    const isViewed = story.viewedBy?.some(v => v.userId === user.id);
                    
                    return (
                      <div 
                        key={story._id}
                        className={`story-card ${isViewed ? 'viewed' : 'unviewed'}`}
                        onClick={() => setSelectedStory(story)}
                      >
                        {story.mediaType === 'image' ? (
                          <img 
                            src={story.mediaUrl} 
                            alt="Story" 
                            className="story-card-image"
                          />
                        ) : (
                          <div className="story-card-text">
                            <div className="story-text-content">
                              {story.content}
                            </div>
                          </div>
                        )}
                        
                        {/* Story Overlay */}
                        <div className="story-card-overlay">
                          <div className="story-header-mini">
                            <img 
                              src={storyUser.profilePicture || '/default-avatar.png'} 
                              alt={storyUser.username}
                              className="mini-avatar"
                            />
                            <div className="mini-user-info">
                              <p className="mini-username">{storyUser.username}</p>
                              <p className="mini-time">
                                {new Date(story.createdAt).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>

                          <div className="story-actions-mini">
                            <span className="view-count">
                              👁️ {story.viewedBy?.length || 0}
                            </span>
                            {story.userId._id === user.id && (
                              <button 
                                className="delete-story-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm('Delete this story?')) {
                                    handleDeleteStory(story._id);
                                  }
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Viewed Indicator */}
                        {isViewed && (
                          <div className="viewed-indicator">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showReels && (
        <ReelsViewer
          stories={stories || []}
          onClose={() => setShowReels(false)}
        />
      )}
    </div>
  );
}

export default StoriesPage;