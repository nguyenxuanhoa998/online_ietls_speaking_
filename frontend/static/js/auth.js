/**
 * auth.js — Shared authentication utilities
 * Must be loaded BEFORE login.js and any protected page script.
 *
 * Usage:
 *   <script src="/static/js/auth.js"></script>
 *
 * API:
 *   Auth.API_BASE            → 'http://localhost:8000/api'
 *   Auth.getToken()          → string | null
 *   Auth.getHeaders()        → { Authorization: 'Bearer ...', Content-Type: ... }
 *   Auth.logout()            → clears storage, redirects to /login.html
 *   Auth.requireAuth()       → redirects to login if no token (returns false)
 *   Auth.requireRole(...r)   → async, redirects if user role not in list
 *   Auth.getCurrentUser()    → Promise<user object | null>
 */

'use strict';

const Auth = (() => {

  const API_BASE = 'http://localhost:8000/api';

  /* ── Token helpers ─────────────────────────────────────────── */
  function getToken() {
    return localStorage.getItem('token');
  }

  function getHeaders() {
    const token = getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  }

  /* ── Logout ────────────────────────────────────────────────── */
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('token_type');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }

  /* ── Route guards ──────────────────────────────────────────── */
  function requireAuth() {
    if (!getToken()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  async function getCurrentUser() {
    const cached = localStorage.getItem('user');
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through */ }
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: getHeaders() });
      if (res.status === 401) { logout(); return null; }
      if (res.ok) {
        const user = await res.json();
        localStorage.setItem('user', JSON.stringify(user));
        return user;
      }
    } catch { /* network error */ }

    return null;
  }

  async function requireRole(...roles) {
    if (!requireAuth()) return false;
    const user = await getCurrentUser();
    if (!user || !roles.includes(user.role)) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  return { API_BASE, getToken, getHeaders, logout, requireAuth, getCurrentUser, requireRole };

})();