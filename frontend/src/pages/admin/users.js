'use strict';

/**
 * Global Error Handler for Debugging
 */
window.onerror = function(msg, url, lineNo, columnNo, error) {
  const tbody = document.getElementById('users-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:red; padding:20px;">
      <strong>JS Error:</strong> ${msg}<br>
      <small>At ${url}:${lineNo}:${columnNo}</small>
    </td></tr>`;
  }
  return false;
};

/* ── Helpers ──────────────────────────────────────── */
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return '—';
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}
function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : ''; }
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ── State ────────────────────────────────────────── */
let allUsers = [];
let currentTab = 'pending';
let pendingAction = null;

/* ── Init ─────────────────────────────────────────── */
async function init() {
  const tbody = document.getElementById('users-tbody');
  try {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Authenticating...</td></tr>`;
    
    const ok = await Auth.requireRole('admin');
    if (!ok) return;

    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Loading users...</td></tr>`;

    const user = await Auth.getCurrentUser();
    if (user) {
      setText('nav-name', user.full_name);
      const av = document.getElementById('nav-avatar');
      if (av) {
        av.textContent = initials(user.full_name);
        av.style.background = avatarColor(user.full_name);
      }
    }

    await loadUsers();
    updateCounts();
    switchTab(currentTab);
  } catch (err) {
    console.error('Admin users init failed:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:red; padding:20px;">Failed to initialize: ${err.message}</td></tr>`;
  }
}

/* ── Load users ───────────────────────────────────── */
async function loadUsers() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/users`, { 
      headers: Auth.getHeaders() 
    });
    if (res.ok) {
      allUsers = await res.json();
    } else {
      console.error('API error:', res.status);
      showToast('Error loading users from server', 'error');
    }
  } catch (e) {
    console.error('Failed to load users:', e);
    showToast('Network error loading users', 'error');
  }
}

/* ── Count tabs ───────────────────────────────────── */
function updateCounts() {
  if (!allUsers) return;
  const pending  = allUsers.filter(u => u.status === 'pending');
  const students = allUsers.filter(u => u.role === 'student' && u.status === 'approved');
  const teachers = allUsers.filter(u => u.role === 'teacher' && u.status === 'approved');
  const admins   = allUsers.filter(u => u.role === 'admin'   && u.status === 'approved');

  setText('count-pending',  pending.length);
  setText('count-students', students.length);
  setText('count-teachers', teachers.length);
  setText('count-admins',   admins.length);

  const nb = document.getElementById('nav-pending-badge');
  if (nb) {
    if (pending.length > 0) { 
      nb.textContent = pending.length; 
      nb.classList.remove('hidden'); 
    } else {
      nb.classList.add('hidden');
    }
  }

  const pw = document.getElementById('pending-warning');
  if (pw) {
    if (currentTab === 'pending' && pending.length > 0) {
      pw.classList.remove('hidden');
      setText('pending-warning-text', `${pending.length} account${pending.length > 1 ? 's' : ''} require approval before users can access the platform.`);
    } else {
      pw.classList.add('hidden');
    }
  }
}

/* ── Switch tab ───────────────────────────────────── */
function switchTab(tab) {
  currentTab = tab;
  ['pending','students','teachers','admins'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.toggle('active', t === tab);
  });
  updateCounts();
  const searchInput = document.getElementById('search-input');
  renderTab(tab, searchInput ? searchInput.value : '');
}

/* ── Render table ─────────────────────────────────── */
function renderTab(tab, query = '') {
  if (!allUsers) return;
  let filtered;

  switch (tab) {
    case 'pending':  filtered = allUsers.filter(u => u.status === 'pending'); break;
    case 'students': filtered = allUsers.filter(u => u.role === 'student' && u.status === 'approved'); break;
    case 'teachers': filtered = allUsers.filter(u => u.role === 'teacher' && u.status === 'approved'); break;
    case 'admins':   filtered = allUsers.filter(u => u.role === 'admin'   && u.status === 'approved'); break;
    default:         filtered = allUsers;
  }

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.institution || '').toLowerCase().includes(q)
    );
  }

  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No users matching this criteria.</td></tr>`;
    return;
  }

  const isPending = (tab === 'pending');
  const fmtDateTime = str => {
    if (!str) return '—';
    const d = new Date(str);
    if (isNaN(d.getTime())) return '—';
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}<br><small>${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}</small>`;
  };
  tbody.innerHTML = filtered.map(u => {
    const color = avatarColor(u.full_name);
    const ini   = initials(u.full_name);
    const roleBadge = `<span class="role-badge ${u.role}">${cap(u.role)}</span>`;

    const statusBadge = u.status === 'pending'
      ? `<span class="status-pending">⏳ Pending</span>`
      : u.status === 'approved'
        ? `<span class="status-approved">✓ Approved</span>`
        : `<span class="status-rejected">✕ Rejected</span>`;

    const actions = isPending
      ? `<button class="btn btn-outline btn-sm" onclick="viewUser(${u.id})">View</button>
         <button class="btn btn-success btn-sm" onclick="openApproveModal(${u.id})">Approve</button>
         <button class="btn btn-danger btn-sm"  onclick="openRejectModal(${u.id})">Reject</button>`
      : `<button class="btn btn-outline btn-sm" onclick="viewUser(${u.id})">View</button>`;

    return `
      <tr>
        <td>
          <div class="td-user">
            <div class="user-avatar" style="background:${color};">${ini}</div>
            <div>
              <div class="user-name">${esc(u.full_name)}</div>
              <div class="user-email">${esc(u.email)}</div>
            </div>
          </div>
        </td>
        <td>${roleBadge}</td>
        <td style="color:var(--text-3);font-size:13px;">${fmtDateTime(u.created_at)}</td>
        <td>${statusBadge}</td>
        <td><div class="td-actions">${actions}</div></td>
      </tr>
    `;
  }).join('');
}

/* ── Search ───────────────────────────────────────── */
window.handleSearch = function(val) {
  renderTab(currentTab, val);
}

/* ── Approve modal ────────────────────────────────── */
window.openApproveModal = function(userId) {
  const u = allUsers.find(u => u.id === userId);
  if (!u) return;
  pendingAction = { userId, action: 'approve' };

  const color = avatarColor(u.full_name);
  const ini   = initials(u.full_name);

  const av = document.getElementById('approve-avatar');
  if (av) {
    av.textContent = ini;
    av.style.background = color;
  }
  setText('approve-name', u.full_name);
  setText('approve-meta', `${u.email} · ${cap(u.role)}`);

  document.getElementById('approve-modal')?.classList.remove('hidden');
}

window.confirmApprove = async function() {
  if (!pendingAction) return;
  const btn = document.getElementById('approve-confirm-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Approving...';
  }

  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/users/${pendingAction.userId}/approve`, {
      method: 'POST',
      headers: Auth.getHeaders(),
    });
    if (!res.ok) throw new Error('API rejection');
    const u = allUsers.find(u => u.id === pendingAction.userId);
    if (u) u.status = 'approved';
    showToast('Account approved successfully.', 'success');
  } catch (err) {
    showToast('Failed to approve account.', 'error');
  }

  window.closeModal('approve-modal');
  updateCounts();
  renderTab(currentTab);
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Approve account';
  }
  pendingAction = null;
}

/* ── Reject modal ─────────────────────────────────── */
window.openRejectModal = function(userId) {
  const u = allUsers.find(u => u.id === userId);
  if (!u) return;
  pendingAction = { userId, action: 'reject' };

  const color = avatarColor(u.full_name);
  const ini   = initials(u.full_name);

  const av = document.getElementById('reject-avatar');
  if (av) {
    av.textContent = ini;
    av.style.background = color;
  }
  setText('reject-name', u.full_name);
  setText('reject-meta', `${u.email} · ${cap(u.role)}`);
  
  const reasonEl = document.getElementById('reject-reason');
  if (reasonEl) reasonEl.value = '';

  document.getElementById('reject-modal')?.classList.remove('hidden');
}

window.confirmReject = async function() {
  if (!pendingAction) return;
  const btn = document.getElementById('reject-confirm-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Rejecting...';
  }
  const reason = document.getElementById('reject-reason')?.value || '';

  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/users/${pendingAction.userId}/reject`, {
      method: 'DELETE',
      headers: Auth.getHeaders(),
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('API rejection');
    const u = allUsers.find(u => u.id === pendingAction.userId);
    if (u) u.status = 'rejected';
    showToast('Account rejected.', 'error');
  } catch {
    showToast('Failed to reject account.', 'error');
  }

  window.closeModal('reject-modal');
  updateCounts();
  renderTab(currentTab);
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Reject account';
  }
  pendingAction = null;
}

/* ── View user ────────────────────────────────────── */
window.viewUser = function(userId) {
  const u = allUsers.find(u => u.id === userId);
  if (!u) return;
  showToast(`${u.full_name} — ${u.email} (${cap(u.role)})`);
}

/* ── Export ───────────────────────────────────────── */
window.exportUsers = function() {
  const rows = [['Name','Email','Role','Status','Registered','Institution']];
  allUsers.forEach(u => rows.push([u.full_name, u.email, u.role, u.status || 'pending', fmtDate(u.created_at), u.institution || '']));
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'users_export.csv';
  a.click();
}

/* ── Close modal ──────────────────────────────────── */
window.closeModal = function(id) {
  document.getElementById(id)?.classList.add('hidden');
  pendingAction = null;
}

window.switchTab = switchTab;

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) window.closeModal(overlay.id);
  });
});

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
