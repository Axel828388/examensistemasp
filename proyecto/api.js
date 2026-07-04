// api.js - Cliente API simple con fallback a localStorage
const API_BASE = window.__RRHH_API_BASE__ || 'http://127.0.0.1:3000';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return await res.json();
    return await res.text();
  } catch (err) {
    console.warn('API request failed, falling back to localStorage:', err.message);
    throw err;
  }
}

export async function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}

export async function register(username, password) {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}

export async function getMeetings(token) {
  return request('/api/meetings', { headers: { Authorization: `Bearer ${token}` } });
}

export async function createMeeting(data, token) {
  return request('/api/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
}

export async function getPositions(token) {
  return request('/api/sensors/positions', { headers: { Authorization: `Bearer ${token}` } });
}

export async function postPosition(data, token) {
  return request('/api/sensors/positions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
}

// Fallback helpers (localStorage) - kept minimal
export function local_get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch(e){return null;} }
export function local_set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
