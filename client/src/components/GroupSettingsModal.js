import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiX, FiLink, FiShield, FiClock, FiBook, FiList } from 'react-icons/fi';
import '../styles/GroupFeatures.css';

function GroupSettingsModal({ chat, currentUserId, onClose, onUpdated }) {
  const [tab, setTab] = useState('roles');
  const [settings, setSettings] = useState(null);
  const [roles, setRoles] = useState([]);
  const [audit, setAudit] = useState([]);
  const [inviteHours, setInviteHours] = useState(24);
  const [lastInvite, setLastInvite] = useState(null);
  const [topicsInput, setTopicsInput] = useState('');

  const isMod = settings?.myRole === 'moderator';

  const load = async () => {
    try {
      const [setRes, roleRes] = await Promise.all([
        axios.get(`/api/groups/${chat._id}/settings`),
        axios.get(`/api/groups/${chat._id}/roles`)
      ]);
      setSettings(setRes.data);
      setRoles(roleRes.data.roles || []);
      setTopicsInput((setRes.data.topics || []).join(', '));
      if (setRes.data.myRole === 'moderator') {
        const auditRes = await axios.get(`/api/groups/${chat._id}/audit`);
        setAudit(auditRes.data || []);
      }
    } catch {
      toast.error('Failed to load group settings');
    }
  };

  useEffect(() => {
    load();
  }, [chat._id]);

  const saveSettings = async () => {
    try {
      await axios.put(`/api/groups/${chat._id}/settings`, {
        groupRules: settings.groupRules,
        welcomeBotEnabled: settings.welcomeBotEnabled,
        slowModeSeconds: settings.slowModeSeconds,
        isPublic: settings.isPublic,
        topics: topicsInput.split(',').map((t) => t.trim()).filter(Boolean)
      });
      toast.success('Group settings saved');
      onUpdated?.();
      load();
    } catch {
      toast.error('Save failed');
    }
  };

  const setRole = async (userId, role) => {
    try {
      await axios.put(`/api/groups/${chat._id}/roles`, { userId, role });
      toast.success(`Role set to ${role}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const createInvite = async () => {
    try {
      const res = await axios.post(`/api/groups/${chat._id}/invite`, { expiresInHours: inviteHours });
      setLastInvite(res.data);
      toast.success('Invite link created (#102)');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const postWelcome = async () => {
    try {
      await axios.post(`/api/groups/${chat._id}/welcome`);
      toast.success('Welcome message posted (#105)');
    } catch {
      toast.error('Failed');
    }
  };

  if (!settings) {
    return (
      <div className="group-settings-overlay" onClick={onClose}>
        <div className="group-settings-modal" onClick={(e) => e.stopPropagation()}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="group-settings-overlay" onClick={onClose}>
      <div className="group-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="gsm-header">
          <h2>👥 Group controls</h2>
          <button type="button" onClick={onClose}><FiX /></button>
        </header>

        <div className="gsm-tabs">
          {[
            { id: 'roles', label: '#101 Roles', icon: FiShield },
            { id: 'invite', label: '#102 Invite', icon: FiLink },
            { id: 'rules', label: '#105 Rules', icon: FiBook },
            { id: 'slow', label: '#106 Slow', icon: FiClock },
            { id: 'audit', label: '#107 Audit', icon: FiList }
          ].map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        <div className="gsm-body">
          {tab === 'roles' && (
            <div>
              <p className="gsm-hint">Moderators can manage settings. Read-only members cannot send messages.</p>
              {roles.map(({ user, role, isAdmin }) => (
                <div key={user._id} className="role-row">
                  <img src={user.profilePicture || '/default-avatar.png'} alt="" />
                  <span>{user.username}{isAdmin ? ' (creator)' : ''}</span>
                  {isMod && user._id !== currentUserId ? (
                    <select value={role} onChange={(e) => setRole(user._id, e.target.value)}>
                      <option value="moderator">Moderator</option>
                      <option value="member">Member</option>
                      <option value="readonly">Read-only</option>
                    </select>
                  ) : (
                    <span className={`role-badge ${role}`}>{role}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'invite' && (
            <div>
              <p className="gsm-hint">Expiring invite links for new members (#102).</p>
              {isMod && (
                <>
                  <label>Expires in (hours)</label>
                  <input type="number" min={1} max={168} value={inviteHours} onChange={(e) => setInviteHours(Number(e.target.value))} />
                  <button type="button" className="gsm-primary" onClick={createInvite}>Generate link</button>
                </>
              )}
              {lastInvite && (
                <div className="invite-box">
                  <code>{window.location.origin}/join/{lastInvite.code}</code>
                  <p>Expires: {new Date(lastInvite.expiresAt).toLocaleString()}</p>
                </div>
              )}
              {settings.inviteLinks?.map((l) => (
                <div key={l.code} className="invite-box">
                  <code>/join/{l.code}</code>
                  <span>{l.uses}/{l.maxUses} uses · exp {new Date(l.expiresAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'rules' && (
            <div>
              <label>Group rules (#105)</label>
              <textarea
                rows={4}
                value={settings.groupRules || ''}
                onChange={(e) => setSettings({ ...settings, groupRules: e.target.value })}
                disabled={!isMod}
              />
              <label className="gsm-check">
                <input
                  type="checkbox"
                  checked={settings.welcomeBotEnabled}
                  onChange={(e) => setSettings({ ...settings, welcomeBotEnabled: e.target.checked })}
                  disabled={!isMod}
                />
                Welcome bot posts rules for new members
              </label>
              <label className="gsm-check">
                <input
                  type="checkbox"
                  checked={settings.isPublic}
                  onChange={(e) => setSettings({ ...settings, isPublic: e.target.checked })}
                  disabled={!isMod}
                />
                Public group — discoverable (#103)
              </label>
              <label>Topics (comma-separated)</label>
              <input value={topicsInput} onChange={(e) => setTopicsInput(e.target.value)} disabled={!isMod} placeholder="gaming, study, music" />
              {isMod && (
                <>
                  <button type="button" className="gsm-secondary" onClick={postWelcome}>Post welcome now</button>
                  <button type="button" className="gsm-primary" onClick={saveSettings}>Save settings</button>
                </>
              )}
            </div>
          )}

          {tab === 'slow' && (
            <div>
              <p className="gsm-hint">Rate-limit messages in large groups (#106). Moderators are exempt.</p>
              <label>Seconds between messages (0 = off)</label>
              <input
                type="number"
                min={0}
                max={300}
                value={settings.slowModeSeconds || 0}
                onChange={(e) => setSettings({ ...settings, slowModeSeconds: Number(e.target.value) })}
                disabled={!isMod}
              />
              {isMod && <button type="button" className="gsm-primary" onClick={saveSettings}>Save slow mode</button>}
            </div>
          )}

          {tab === 'audit' && (
            <div>
              {!isMod ? (
                <p className="gsm-hint">Only moderators can view the audit log (#107).</p>
              ) : (
                <div className="audit-list">
                  {audit.length === 0 && <p>No audit events yet.</p>}
                  {audit.map((log, i) => (
                    <div key={i} className="audit-row">
                      <strong>{log.action}</strong>
                      <span>{log.details}</span>
                      <small>{new Date(log.createdAt).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GroupSettingsModal;
