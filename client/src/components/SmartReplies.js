import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiCopy, FiCheck, FiEdit3, FiSliders } from 'react-icons/fi';
import '../styles/SmartReplies.css';

function SmartReplies({ messageContent, senderName, onSelectReply, onClose }) {
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTone, setSelectedTone] = useState('friendly');
  const [toneIntensity, setToneIntensity] = useState(5);
  const [adjustedMessage, setAdjustedMessage] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/ai/suggest-replies', {
        messageContent,
        senderName
      });
      setSuggestions(response.data);
      setSelectedTone(response.data.suggestedTone || 'friendly');
    } catch (error) {
      console.error('Suggestions error:', error);
      toast.error('Failed to generate suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleToneSelect = async (tone) => {
    setSelectedTone(tone);
    // Adjust the selected reply with new tone
    try {
      const baseReply = suggestions[tone];
      const response = await axios.post('/api/ai/tone-adjust', {
        message: baseReply,
        targetTone: tone,
        intensity: toneIntensity
      });
      setAdjustedMessage(response.data.adjusted);
    } catch (error) {
      console.error('Tone adjust error:', error);
    }
  };

  const handleIntensityChange = async (value) => {
    setToneIntensity(value);
    const baseReply = suggestions[selectedTone];
    try {
      const response = await axios.post('/api/ai/tone-adjust', {
        message: baseReply,
        targetTone: selectedTone,
        intensity: value
      });
      setAdjustedMessage(response.data.adjusted);
    } catch (error) {
      console.error('Tone adjust error:', error);
    }
  };

  const handleSelect = () => {
    const finalReply = adjustedMessage || suggestions[selectedTone];
    onSelectReply(finalReply);
  };

  const handleCopy = () => {
    const finalReply = adjustedMessage || suggestions[selectedTone];
    navigator.clipboard.writeText(finalReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="smart-replies-container">
        <div className="replies-loading">
          <div className="spinner"></div>
          <p>Generating AI suggestions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="smart-replies-container">
      <div className="replies-header">
        <h3>💡 Smart Replies</h3>
        <p className="replies-subtitle">From: <strong>{senderName}</strong></p>
      </div>

      {/* Sender Message Preview */}
      <div className="original-message-preview">
        <p className="preview-label">Original Message:</p>
        <div className="preview-content">
          <p>{messageContent}</p>
        </div>
      </div>

      {/* Tone Selector */}
      <div className="tone-selector">
        <h4>Choose Tone</h4>
        <div className="tone-buttons">
          {Object.keys(suggestions).filter(k => !['sentiment', 'suggestedTone'].includes(k)).map(tone => (
            <button
              key={tone}
              className={`tone-btn ${selectedTone === tone ? 'active' : ''}`}
              onClick={() => handleToneSelect(tone)}
            >
              {tone.charAt(0).toUpperCase() + tone.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Intensity Slider */}
      <div className="intensity-control">
        <label>
          <FiSliders size={16} /> Tone Intensity
        </label>
        <div className="intensity-slider-container">
          <span className="intensity-label">Subtle</span>
          <input
            type="range"
            min="1"
            max="10"
            value={toneIntensity}
            onChange={(e) => handleIntensityChange(Number(e.target.value))}
            className="intensity-slider"
          />
          <span className="intensity-label">Strong</span>
        </div>
        <p className="intensity-value">Intensity: {toneIntensity}/10</p>
      </div>

      {/* Selected Reply Preview */}
      <div className="reply-preview">
        <h4>
          <FiEdit3 size={16} /> Your Reply
        </h4>
        <div className="preview-box">
          <p className="tone-badge">{selectedTone.toUpperCase()}</p>
          <p className="reply-text">
            {adjustedMessage || suggestions[selectedTone]}
          </p>
        </div>
      </div>

      {/* Sentiment Info */}
      <div className="sentiment-info">
        <p className="sentiment-label">Detected Sentiment:</p>
        <span className={`sentiment-badge ${suggestions.sentiment}`}>
          {suggestions.sentiment?.toUpperCase()}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="replies-actions">
        <button
          className="btn-copy"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? <FiCheck size={16} /> : <FiCopy size={16} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          className="btn-send"
          onClick={handleSelect}
        >
          Send Reply
        </button>
      </div>

      {/* Refresh Suggestions */}
      <button className="btn-refresh" onClick={fetchSuggestions}>
        ↻ Regenerate Suggestions
      </button>
    </div>
  );
}

export default SmartReplies;
