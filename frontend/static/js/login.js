/**
 * login.js
 * Handles Login + Register form logic.
 * Depends on: auth.js (must be loaded first)
 */

'use strict';

/* ── Auth guard: redirect if already logged in ─────────────────── */
if (Auth.getToken()) {
  window.location.href = '/dashboard.html';
}

/* ── Tab switching ─────────────────────────────────────────────── */
function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('panel-login').classList.toggle('active', tab === 'login');
  document.getElementById('panel-register').classList.toggle('active', tab === 'register');
  _clearAlerts();
}

function _clearAlerts() {
  ['login-alert', 'reg-alert', 'reg-success'].forEach(id => {
    document.getElementById(id).classList.remove('show');
  });
}

/* ── Password show / hide ──────────────────────────────────────── */
function togglePw(inputId, btn) {
  const input  = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type   = isText ? 'password' : 'text';

  btn.querySelector('svg').innerHTML = isText
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

/* ── Password strength meter ───────────────────────────────────── */
function checkStrength(pw) {
  const bars  = [1, 2, 3, 4].map(i => document.getElementById('bar-' + i));
  const label = document.getElementById('pw-label');

  bars.forEach(b => (b.className = 'pw-bar'));

  if (!pw) { label.textContent = ''; return; }

  let score = 0;
  if (pw.length >= 8)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = ['', 'weak',    'fair',    'good',    'strong'];
  const names  = ['', 'Weak',    'Fair',    'Good',    'Strong'];
  const colors = ['', '#E53E3E', '#F6AD55', '#48BB78', '#00C853'];

  for (let i = 0; i < score; i++) bars[i].classList.add(levels[score]);
  label.textContent = score > 0 ? names[score] : '';
  label.style.color = colors[score] || '';
}

/* ── Role selector ─────────────────────────────────────────────── */
function selectRole(radio) {
  document.querySelectorAll('#panel-register .role-opt').forEach(o => o.classList.remove('selected'));
  radio.closest('.role-opt').classList.add('selected');
  document.getElementById('teacher-notice')
    .classList.toggle('show', radio.value === 'teacher');
}

function selectLoginRole(radio) {
  document.querySelectorAll('#panel-login .role-opt').forEach(o => o.classList.remove('selected'));
  radio.closest('.role-opt').classList.add('selected');
}

/* ── Validation helpers ────────────────────────────────────────── */
function _showErr(id, msg) {
  const el = document.getElementById(id);
  if (msg) { el.textContent = msg; el.classList.add('show'); }
  else      { el.classList.remove('show'); }
}

function _clearErrs(...ids) {
  ids.forEach(id => _showErr(id, ''));
}

function _isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function _setLoading(btnId, state) {
  const btn = document.getElementById(btnId);
  btn.classList.toggle('loading', state);
  btn.disabled = state;
}

function _showAlert(alertId, msgId, message) {
  document.getElementById(msgId).textContent = message;
  document.getElementById(alertId).classList.add('show');
}

/* ── LOGIN ─────────────────────────────────────────────────────── */
async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const role     = document.querySelector('input[name="login-role"]:checked').value;

  _clearErrs('login-email-err', 'login-pw-err');
  document.getElementById('login-alert').classList.remove('show');

  let valid = true;
  if (!_isValidEmail(email)) { _showErr('login-email-err', 'Please enter a valid email.'); valid = false; }
  if (!password)             { _showErr('login-pw-err',    'Password is required.');        valid = false; }
  if (!valid) return;

  _setLoading('login-btn', true);

  try {
    const res  = await fetch(`${Auth.API_BASE}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, role }),
    });

    const data = await res.json();

    if (res.ok && data.access_token) {
      localStorage.setItem('token',      data.access_token);
      localStorage.setItem('token_type', data.token_type || 'bearer');
      window.location.href = '/dashboard.html';
    } else {
      _showAlert('login-alert', 'login-alert-msg', data.detail || 'Invalid email or password.');
    }
  } catch {
    _showAlert('login-alert', 'login-alert-msg', 'Cannot connect to server. Please try again.');
  } finally {
    _setLoading('login-btn', false);
  }
}

/* ── REGISTER ──────────────────────────────────────────────────── */
async function handleRegister() {
  const full_name = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-password').value;
  const role      = document.querySelector('input[name="role"]:checked').value;

  _clearErrs('reg-name-err', 'reg-email-err', 'reg-pw-err');
  document.getElementById('reg-alert').classList.remove('show');
  document.getElementById('reg-success').classList.remove('show');

  let valid = true;
  if (!full_name)            { _showErr('reg-name-err',  'Full name is required.');                   valid = false; }
  if (!_isValidEmail(email)) { _showErr('reg-email-err', 'Please enter a valid email.');              valid = false; }
  if (password.length < 8)  { _showErr('reg-pw-err',    'Password must be at least 8 characters.');  valid = false; }
  if (!valid) return;

  _setLoading('reg-btn', true);

  try {
    const res  = await fetch(`${Auth.API_BASE}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ full_name, email, password, role }),
    });

    const data = await res.json();

    if (res.status === 201 || res.ok) {
      const msg = role === 'teacher'
        ? 'Account created! Please wait for admin approval before logging in.'
        : 'Account created! Redirecting to login...';

      _showAlert('reg-success', 'reg-success-msg', msg);

      if (role !== 'teacher') {
        setTimeout(() => switchTab('login'), 1800);
      }
    } else {
      _showAlert('reg-alert', 'reg-alert-msg', data.detail || 'Registration failed. Please try again.');
    }
  } catch {
    _showAlert('reg-alert', 'reg-alert-msg', 'Cannot connect to server. Please try again.');
  } finally {
    _setLoading('reg-btn', false);
  }
}

/* ── Enter key support ─────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const loginActive = document.getElementById('panel-login').classList.contains('active');
  loginActive ? handleLogin() : handleRegister();
});