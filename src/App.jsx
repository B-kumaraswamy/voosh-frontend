// src/App.jsx
import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import ChatWindow from './components/ChatWindow';
import './styles/main.scss';

export default function App() {
  // sessions: array of { id, createdAt, messagesCount, updatedAt, title? }
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(
    localStorage.getItem('sessionId') || null
  );

  useEffect(() => {
    if (selectedSessionId) localStorage.setItem('sessionId', selectedSessionId);
    else localStorage.removeItem('sessionId');
  }, [selectedSessionId]);

  // fetch sessions list (from backend) on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/sessions');
        if (!r.ok) throw new Error('Failed to fetch sessions');
        const list = await r.json();
        setSessions(Array.isArray(list) ? list : []);
        // if no selectedSessionId, select first (if any)
        if (!selectedSessionId && Array.isArray(list) && list.length > 0) {
          setSelectedSessionId(list[0].id);
        }
      } catch (e) {
        console.warn('Could not load sessions:', e.message || e);
        setSessions([]); // fallback to empty
      }
    })();
  }, []); // only once

  // Handlers to pass down

  // Add a session (optimistic if backend not available)
  const createSession = async () => {
    try {
      const resp = await fetch('/sessions', { method: 'POST' });
      if (!resp.ok) throw new Error('create session failed');
      const data = await resp.json();
      const newSession = {
        id: data.id,
        createdAt: data.createdAt || Date.now(),
        messagesCount: 0,
        updatedAt: data.createdAt || Date.now(),
      };
      setSessions((s) => [newSession, ...s]);
      setSelectedSessionId(newSession.id);
      return newSession;
    } catch (e) {
      // Fallback: create local session id (uuid-like)
      const fallbackId = `local-${Date.now()}`;
      const newSession = {
        id: fallbackId,
        createdAt: Date.now(),
        messagesCount: 0,
        updatedAt: Date.now(),
      };
      setSessions((s) => [newSession, ...s]);
      setSelectedSessionId(newSession.id);
      console.warn('Session API create failed - using local session', e.message || e);
      return newSession;
    }
  };

  const deleteSession = async (id) => {
    // optimistic UI removal
    setSessions((s) => s.filter((x) => x.id !== id));
    if (selectedSessionId === id) {
      setSelectedSessionId(null);
    }
    try {
      await fetch(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Failed to delete session on server', e.message || e);
    }
  };

  // Called by ChatWindow when messages change (so sidebar can update counts)
  const patchSessionMessages = (sessionId, { deltaCount = 0, updatedAt = Date.now() }) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messagesCount: Math.max(0, (s.messagesCount || 0) + deltaCount),
          updatedAt,
        };
      })
    );
  };

  // Replace session info (useful when server returns authoritative session)
  const replaceSession = (sessionId, newSessionFields) => {
    setSessions((prev) => {
      const found = prev.find((p) => p.id === sessionId);
      if (!found) return [ { id: sessionId, ...newSessionFields }, ...prev ];
      return prev.map((p) => (p.id === sessionId ? { ...p, ...newSessionFields } : p));
    });
  };

  return (
    <div className="app-root" style={{ display: 'flex', height: '100vh' }}>
      <Sidebar
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelect={(id) => setSelectedSessionId(id)}
        onCreate={createSession}
        onDelete={deleteSession}
      />
      <main style={{ flex: 1 }}>
        <ChatWindow
          sessionId={selectedSessionId}
          onMessagesChange={(patch) => patchSessionMessages(selectedSessionId, patch)}
          replaceSession={(fields) => selectedSessionId && replaceSession(selectedSessionId, fields)}
        />
      </main>
    </div>
  );
}
