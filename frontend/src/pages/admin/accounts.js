'use strict';

function cap(s) { return s?s.charAt(0).toUpperCase()+s.slice(1):''; }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(str) { if(!str) return '—'; const d=new Date(str); if(isNaN(d.getTime())) return '—'; return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; }
function setText(id, v) { const el=document.getElementById(id); if(el) el.textContent=v; }

let allUsers = [];

async function init() {
  try {
    const ok = await Auth.requireRole('admin');
    if (!ok) return;

    const user = await Auth.getCurrentUser();
    if (user) {
      setText('nav-name', user.full_name);
      const av = document.getElementById('nav-avatar');
      if (av) {
        av.textContent = initials(user.full_name);
        av.style.background = avatarColor(user.full_name);
      }
    }

    await loadAccounts();
    updateSummary();

    renderTable('', '', '');
  } catch (err) {
    console.error('Init failed:', err);
  }
}

async function loadAccounts() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/users`, { headers: Auth.getHeaders() });
    if (res.ok) {
      allUsers = await res.json();
    } else {
      console.error('API error:', res.status);
    }
  } catch (e) {
    console.error('Failed to load accounts:', e);
  }
}

function updateSummary() {
  if (!allUsers) return;
  const pending  = allUsers.filter(u => u.status === 'pending');
  const approved = allUsers.filter(u => u.status === 'approved');
  const rejected = allUsers.filter(u => u.status === 'rejected');
  const students = allUsers.filter(u => u.role === 'student');
  const teachers = allUsers.filter(u => u.role === 'teacher' && u.status === 'approved');

  setText('ac-total',    allUsers.length);
  setText('ac-approved', approved.length);
  setText('ac-pending',  pending.length);
  setText('ac-rejected', rejected.length);
  setText('ac-students', students.length);
  setText('ac-teachers', teachers.length);

  const banner = document.getElementById('pending-banner');
  if (banner) {
    if (pending.length > 0) {
      banner.classList.remove('hidden');
      setText('pending-banner-text', `${pending.length} accounts are pending approval.`);
      const nb = document.getElementById('nav-pending-badge');
      if (nb) {
        nb.textContent = pending.length;
        nb.classList.remove('hidden');
      }
    } else {
      banner.classList.add('hidden');
      const nb = document.getElementById('nav-pending-badge');
      if (nb) nb.classList.add('hidden');
    }
  }
}

function renderTable(query = '', roleF = '', statusF = '') {
  let filtered = [...allUsers];

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(u => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  }
  if (roleF)   filtered = filtered.filter(u => u.role === roleF);
  if (statusF) filtered = filtered.filter(u => u.status === statusF);

  const tbody = document.getElementById('accounts-tbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No accounts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const color = avatarColor(u.full_name || 'U');
    const ini   = initials(u.full_name || 'U');
    const statusBadge = u.status === 'approved'
      ? `<span class="status-approved">✓ Approved</span>`
      : u.status === 'rejected'
        ? `<span class="status-rejected">✕ Rejected</span>`
        : `<span class="status-pending">⏳ Pending</span>`;

    const actions = u.status === 'pending'
      ? `<button class="btn btn-outline btn-sm" onclick="viewUser(${u.id})">View</button>
         <button class="btn btn-success btn-sm" onclick="quickApprove(${u.id})">Approve</button>
         <button class="btn btn-danger btn-sm"  onclick="quickReject(${u.id})">Reject</button>`
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
        <td><span class="role-badge ${u.role}">${cap(u.role)}</span></td>
        <td>${statusBadge}</td>
        <td style="color:var(--text-3);font-size:13px;">${u.submissions ?? 0}</td>
        <td style="color:var(--text-3);font-size:13px;">${fmtDate(u.created_at)}</td>
        <td><div class="td-actions">${actions}</div></td>
      </tr>
    `;
  }).join('');
}

function handleSearch(val) {
  const roleF   = document.getElementById('role-filter')?.value || '';
  const statusF = document.getElementById('status-filter')?.value || '';
  renderTable(val, roleF, statusF);
}

function handleFilter() {
  const query   = document.getElementById('search-input')?.value || '';
  const roleF   = document.getElementById('role-filter')?.value || '';
  const statusF = document.getElementById('status-filter')?.value || '';
  renderTable(query, roleF, statusF);
}

async function quickApprove(userId) {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/users/${userId}/approve`, { method:'POST', headers: Auth.getHeaders() });
    if (!res.ok) throw new Error();
    const u = allUsers.find(u => u.id === userId);
    if (u) { u.status = 'approved'; showToast(`${u.full_name} approved.`, 'success'); }
  } catch {
    showToast('Failed to approve account.', 'error');
  }
  updateSummary();
  handleFilter();
}

async function quickReject(userId) {
  if (!confirm('Reject this account?')) return;
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/admin/users/${userId}/reject`, { method:'DELETE', headers: Auth.getHeaders() });
    if (!res.ok) throw new Error();
    const u = allUsers.find(u => u.id === userId);
    if (u) { u.status = 'rejected'; showToast(`${u.full_name} rejected.`, 'error'); }
  } catch {
    showToast('Failed to reject account.', 'error');
  }
  updateSummary();
  handleFilter();
}

function viewUser(userId) {
  const u = allUsers.find(u => u.id === userId);
  if (u) showToast(`${u.full_name} — ${u.email} (${cap(u.role)})`);
}

function exportAccounts() {
  const rows = [['Name','Email','Role','Status','Registered']];
  allUsers.forEach(u => rows.push([u.full_name, u.email, u.role, u.status || 'pending', fmtDate(u.created_at)]));
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'accounts_export.csv';
  a.click();
}

init();
