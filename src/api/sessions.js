// src/api/sessions.js
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export async function listSessions() {
  const r = await fetch(`${BASE}/sessions`);
  if (!r.ok) throw new Error('Failed to fetch sessions');
  return r.json();
}

export async function createSession(title = '') {
  const r = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error('Failed to create session');
  return r.json();
}

export async function getSession(id) {
  const r = await fetch(`${BASE}/sessions/${id}`);
  if (!r.ok) throw new Error('Failed to fetch session');
  return r.json();
}

export async function deleteSession(id) {
  const r = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to delete session');
  return r.json();
}
