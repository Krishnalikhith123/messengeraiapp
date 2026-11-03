import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiCpu, FiRefreshCw, FiX } from 'react-icons/fi';
import '../styles/SmartComposer.css';

const TONES = ['friendly', 'professional', 'short', 'warm', 'confident', 'funny', 'apology'];

function SmartComposer({ draft, chatName, onApply, onClose }) {
  const [tone, setTone] = useState('friendly');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [variants, setVariants] = useState([]);

  const compose = async (nextTone = tone, multi = false) => {
    if (!draft?.trim()) {
      toast.error('Type a rough message first');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/ai/compose', {
        draft,
        tone: nextTone,
        context: chatName ? `Chat with ${chatName}` : '',
        variants: multi
      });
      if (multi) {
        setVariants(res.data.variants || []);
        setResult('');
      } else {
        setResult(res.data.message || '');
        setVariants([]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Composer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="smart-composer-popover">
      <div className="smart-composer-head">
        <div>
          <strong><FiCpu /> Kane Composer</strong>
          <span>Polish your rough thought before sending</span>
        </div>
        <button type="button" onClick={onClose}><FiX /></button>
      </div>

      <div className="tone-chip-row">
        {TONES.map((item) => (
          <button
            key={item}
            type="button"
            className={tone === item ? 'active' : ''}
            onClick={() => {
              setTone(item);
              compose(item, false);
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="composer-actions">
        <button type="button" onClick={() => compose(tone, false)} disabled={loading}>
          <FiRefreshCw /> {loading ? 'Thinking...' : 'Rewrite'}
        </button>
        <button type="button" onClick={() => compose(tone, true)} disabled={loading}>
          Generate variants
        </button>
      </div>

      {result && (
        <div className="composer-result">
          <p>{result}</p>
          <button type="button" onClick={() => onApply(result)}>Use this</button>
        </div>
      )}

      {variants.length > 0 && (
        <div className="composer-variants">
          {variants.map((variant, idx) => (
            <button key={`${variant.tone}-${idx}`} type="button" onClick={() => onApply(variant.text)}>
              <span>{variant.tone}</span>
              {variant.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartComposer;
