import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiPauseCircle, FiPlayCircle, FiTrash2, FiZap } from 'react-icons/fi';
import './AutomationPage.css';

function AutomationPage() {
  const [rules, setRules] = useState([]);
  const [text, setText] = useState('If mom messages about medicine, remind me after 30 minutes.');
  const [preview, setPreview] = useState(null);

  const loadRules = () => {
    axios.get('/api/automations')
      .then((res) => setRules(res.data || []))
      .catch(() => toast.error('Could not load automations'));
  };

  useEffect(() => {
    loadRules();
  }, []);

  const previewRule = async () => {
    try {
      const res = await axios.post('/api/automations/preview', { text });
      setPreview(res.data);
    } catch {
      toast.error('Could not preview rule');
    }
  };

  const createRule = async () => {
    try {
      await axios.post('/api/automations', { naturalLanguage: text });
      toast.success('Automation created');
      setPreview(null);
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create rule');
    }
  };

  const toggleRule = async (rule) => {
    const res = await axios.patch(`/api/automations/${rule._id}`, { enabled: !rule.enabled });
    setRules((items) => items.map((item) => item._id === rule._id ? res.data : item));
  };

  const deleteRule = async (ruleId) => {
    await axios.delete(`/api/automations/${ruleId}`);
    setRules((items) => items.filter((item) => item._id !== ruleId));
  };

  return (
    <div className="app-scroll-page automation-page">
      <header className="automation-hero">
        <div>
          <h1>Personal Automation Rules</h1>
          <p>Tell Kane what to watch for. It will convert incoming messages into reminders automatically.</p>
        </div>
        <FiZap />
      </header>

      <section className="automation-builder">
        <textarea value={text} onChange={(event) => setText(event.target.value)} />
        <div className="automation-actions">
          <button type="button" onClick={previewRule}>Preview AI parsing</button>
          <button type="button" onClick={createRule}>Create rule</button>
        </div>
        {preview && (
          <div className="automation-preview">
            <strong>Preview</strong>
            <span>Sender: {preview.trigger.senderName || 'anyone'}</span>
            <span>Keywords: {preview.trigger.keywords?.join(', ') || 'any message'}</span>
            <span>Action: remind after {preview.action.delayMinutes} minutes</span>
          </div>
        )}
      </section>

      <section className="automation-list">
        {rules.map((rule) => (
          <article key={rule._id} className={rule.enabled ? 'automation-rule' : 'automation-rule disabled'}>
            <div>
              <h3>{rule.name}</h3>
              <p>{rule.naturalLanguage}</p>
              <small>
                Runs: {rule.stats?.runCount || 0}
                {rule.stats?.lastRunAt ? ` | Last: ${new Date(rule.stats.lastRunAt).toLocaleString()}` : ''}
              </small>
            </div>
            <div className="rule-buttons">
              <button type="button" onClick={() => toggleRule(rule)} title={rule.enabled ? 'Pause' : 'Resume'}>
                {rule.enabled ? <FiPauseCircle /> : <FiPlayCircle />}
              </button>
              <button type="button" onClick={() => deleteRule(rule._id)} title="Delete"><FiTrash2 /></button>
            </div>
          </article>
        ))}
        {rules.length === 0 && <p className="empty-state">No automations yet. Create your first one above.</p>}
      </section>
    </div>
  );
}

export default AutomationPage;
