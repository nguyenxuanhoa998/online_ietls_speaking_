/**
 * dashboard.js
 * Logic for the student dashboard
 */

'use strict';

/* ── Auth guard ────────────────────────────────────────────────── */
if (!Auth.requireAuth()) { /* redirects if no token */ }

document.addEventListener('DOMContentLoaded', async () => {
    // Populate user info
    const user = await Auth.getCurrentUser();
    if (user) {
        document.getElementById('nav-name').textContent = user.full_name || 'User';
        const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        document.getElementById('nav-avatar').textContent = initials;
    }

    // Load data
    await loadDashboardSummary();
    await loadRecentSubmissions();
});

async function loadDashboardSummary() {
    try {
        const res = await fetch(`${Auth.API_BASE}/v1/dashboard/summary`, {
            headers: Auth.getHeaders()
        });
        
        if (res.ok) {
            const data = await res.json();
            document.getElementById('val-total').textContent = data.total_submissions;
            document.getElementById('val-avg').textContent = data.avg_overall_band || '-';
            document.getElementById('val-pending').textContent = data.pending_review;
            document.getElementById('val-reviewed').textContent = data.reviewed;
        } else {
            console.error('Failed to load dashboard summary', await res.text());
        }
    } catch (err) {
        console.error('Error fetching dashboard summary:', err);
    }
}

async function loadRecentSubmissions() {
    try {
        const res = await fetch(`${Auth.API_BASE}/v1/submissions`, {
            headers: Auth.getHeaders()
        });
        
        if (res.ok) {
            const data = await res.json();
            const tbody = document.getElementById('submissions-tbody');
            
            if (data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No recent submissions found.</td></tr>`;
                return;
            }
            
            tbody.innerHTML = data.map(sub => {
                const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');
                let statusBadge = '';
                
                // Determine the correct badge and status representation
                if (sub.status === 'ai_evaluated' && sub.teacher_overall_score === null) {
                    statusBadge = '<span class="badge badge-ai">AI evaluated</span>';
                } else if (sub.score !== null || sub.status === 'completed' || sub.teacher_overall_score !== null) {
                    statusBadge = '<span class="badge badge-reviewed">Reviewed</span>';
                } else {
                    statusBadge = '<span class="badge badge-pending">Pending</span>';
                }
                
                // Format part string (e.g., "part1" -> "Part 1")
                const partDisplay = sub.part ? sub.part.replace('part', 'Part ') : 'Part ?';
                const scoreDisplay = sub.score !== null ? sub.score : '—';
                
                return `
                    <tr>
                        <td class="td-id">${sub.id}</td>
                        <td class="td-question">${sub.question || 'Custom Question'}</td>
                        <td><span class="part-badge">${partDisplay}</span></td>
                        <td>${dateStr}</td>
                        <td class="td-band">${scoreDisplay}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        } else {
            console.error('Failed to load recent submissions', await res.text());
        }
    } catch (err) {
        console.error('Error fetching recent submissions:', err);
    }
}
