// src/components/Sidebar/Sidebar.jsx
import React, { useEffect, useState } from 'react';

export default function Sidebar({ selectedSessionId, onSelect }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

  async function loadSessions() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/sessions`, { method: 'GET' });
      if (!r.ok) throw new Error('Failed to load sessions');
      const j = await r.json();
      setSessions(j.result || []);
    } catch (e) {
      console.error('loadSessions error', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
    // optional: poll or websocket for updates
  }, []);

  async function handleNew() {
    try {
      const r = await fetch(`${BASE}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!r.ok) throw new Error('Create session failed');
      const j = await r.json();
      const id = j.id;
      // refresh and select
      await loadSessions();
      onSelect?.(id);
    } catch (e) {
      console.error('create session error', e);
      alert('Failed to create session');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this chat?')) return;
    try {
      const r = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      await loadSessions();
      // if deleted session was selected, clear selection
      if (id === selectedSessionId) onSelect?.(null);
    } catch (e) {
      console.error('delete session err', e);
      alert('Delete failed');
    }
  }

  return (
    <aside style={{ width: 300, padding: 16, background: '#061027' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: 'white' }}>Chats</h3>
        <button onClick={handleNew}>New</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {loading && <div style={{ color: '#888' }}>Loading... <span className="spinner" /></div>}
         
        {!loading && sessions.length === 0 && <div style={{ color: '#666' }}>No chats</div>}
        {sessions.map((s, index) => (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <div
              onClick={() => onSelect(s.id)}
              style={{
                padding: 10,
                borderRadius: 8,
                background: s.id === selectedSessionId ? '#0b3353' : '#082135',
                cursor: 'pointer',
                color: '#fff'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>Chat {sessions.length - index} , 💬 {(s.msgCount || 0)} msgs </div>
             
            </div>
            <div style={{ marginTop: 6 }}>
              <button onClick={() => handleDelete(s.id)} style={{ color: 'white', background: '#b33' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
