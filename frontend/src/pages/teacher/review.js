/**
 * teacher-review.js
 * Logic for the review queue page.
 * Handles: queue list, submission detail, scoring, review submission.
 */

'use strict';

if (!Auth.requireAuth()) { /* redirects */ }

/* ── State ─────────────────────────────────────────────────────── */
let allSubmissions = [];
let filteredQueue = [];
let currentSubmission = null;
let currentAiData = null;
let transcriptExpanded = false;

const OVERDUE_HOURS = 48;

/* ── Init ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.getCurrentUser();
  if (!user || user.role !== 'teacher') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('nav-name').textContent = user.full_name || 'Teacher';
  document.getElementById('nav-avatar').textContent = initials(user.full_name);

  await loadQueue();

  // If ?id= in URL, open that submission directly
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');
  if (targetId) {
    openSubmission(parseInt(targetId));
  }
});

/* ── Load ───────────────────────────────────────────────────────── */
async function loadQueue() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/submissions`, { headers: Auth.getHeaders() });
    if (!res.ok) throw new Error('Failed');

    allSubmissions = await res.json();

    const pendingCount = allSubmissions.filter(s => !s.teacher_overall_score && s.status !== 'completed').length;
    const navBadge = document.getElementById('nav-pending-count');
    if (navBadge) navBadge.textContent = pendingCount || '';

    filterReviewQueue('pending', document.querySelector('.filter-tab.active'));
  } catch (err) {
    console.error(err);
    document.getElementById('review-queue-list').innerHTML =
      '<div class="empty-state">Failed to load queue.</div>';
  }
}

/* ── Queue Filter ───────────────────────────────────────────────── */
function filterReviewQueue(filter, btn) {
  if (btn) {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  const now = Date.now();

  if (filter === 'pending') {
    filteredQueue = allSubmissions.filter(s => !s.teacher_overall_score && s.status !== 'completed');
  } else if (filter === 'done') {
    filteredQueue = allSubmissions.filter(s => s.teacher_overall_score || s.status === 'completed');
  } else {
    filteredQueue = [...allSubmissions];
  }

  renderQueueList(now);
}

/* ── Render queue ───────────────────────────────────────────────── */
function renderQueueList(now = Date.now()) {
  const listEl = document.getElementById('review-queue-list');

  if (filteredQueue.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No submissions in this view.</div>';
    return;
  }

  listEl.innerHTML = filteredQueue.map(sub => {
    const isDone = sub.teacher_overall_score || sub.status === 'completed';
    const age = (now - new Date(sub.submitted_at).getTime()) / 3600000;
    const isOverdue = !isDone && age > OVERDUE_HOURS;
    const isActive = currentSubmission && currentSubmission.id === sub.id;
    const partDisplay = sub.part ? sub.part.replace('part', 'Part ') : '—';
    const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');

    let statusBadge = '';
    if (isDone) statusBadge = `<span class="badge badge-done" style="font-size:10px;">Done</span>`;
    else if (isOverdue) statusBadge = `<span class="badge badge-overdue" style="font-size:10px;">⚠ Overdue</span>`;
    else statusBadge = `<span class="badge badge-pending" style="font-size:10px;">Pending</span>`;

    return `
      <div class="queue-item ${isActive ? 'active' : ''}" onclick="openSubmission(${sub.id})">
        <div class="queue-item-header">
          <span class="queue-item-name">${sub.student_name || 'Student'} — #${sub.id}</span>
          ${statusBadge}
        </div>
        <div class="queue-item-meta">
          <span>${partDisplay}</span>
          <span>${dateStr}</span>
        </div>
        <div class="queue-item-question">${sub.question || 'Question not available'}</div>
      </div>
    `;
  }).join('');
}

/* ── Open submission ────────────────────────────────────────────── */
async function openSubmission(submissionId) {
  try {
    document.getElementById('review-empty').style.display = 'none';
    document.getElementById('review-content').style.display = 'block';

    // Reset form
    resetReviewForm();

    // Show loading state in header
    document.getElementById('review-header-name').textContent = 'Loading...';
    document.getElementById('review-header-meta').textContent = '';

    // Fetch full detail
    const res = await fetch(`${Auth.API_BASE}/v1/submissions/${submissionId}`, {
      headers: Auth.getHeaders()
    });

    if (!res.ok) {
      showToast('Failed to load submission', 'error');
      return;
    }

    const data = await res.json();
    currentSubmission = data;
    currentAiData = data.ai_evaluation;

    // Update active state in queue
    renderQueueList();

    // Populate header
    const partDisplay = data.question?.part?.replace('part', 'Part ') || '—';
    const dateStr = new Date(data.submitted_at).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    document.getElementById('review-header-name').textContent =
      `${data.student_name || 'Student'} — Submission #${data.id}`;
    document.getElementById('review-header-meta').textContent =
      `${partDisplay} · Submitted ${dateStr} · ${data.status === 'ai_evaluated' ? 'AI evaluated' : data.status}`;

    // Audio
    const audio = document.getElementById('review-audio');
    audio.src = data.audio_url.startsWith('http') ? data.audio_url : Auth.API_BASE.replace('/api', '') + data.audio_url;
    document.getElementById('review-audio-meta').textContent = `submission_${data.id}_${data.question?.part || ''}.webm`;

    // Transcript
    const transcriptEl = document.getElementById('review-transcript');
    transcriptEl.textContent = data.transcript || 'No transcript available.';
    transcriptExpanded = false;
    transcriptEl.style.maxHeight = '180px';
    document.getElementById('show-more-btn').textContent = 'Show full transcript ↓';

    // AI scores
    const ai = currentAiData;
    if (ai) {
      document.getElementById('ai-fluency').textContent = ai.fluency_coherence?.score ?? '—';
      document.getElementById('ai-lexical').textContent = ai.lexical_resource?.score ?? '—';
      document.getElementById('ai-grammar').textContent = ai.grammar?.score ?? '—';
      document.getElementById('ai-overall').textContent = ai.overall_band ?? '—';

      const strengths = [ai.fluency_coherence?.strengths, ai.lexical_resource?.strengths, ai.grammar?.strengths]
        .filter(Boolean).join(' ');
      const weaknesses = [ai.fluency_coherence?.weaknesses, ai.lexical_resource?.weaknesses, ai.grammar?.weaknesses]
        .filter(Boolean).join(' ');

      document.getElementById('ai-strengths').textContent = strengths || '—';
      document.getElementById('ai-improvements').textContent = weaknesses || '—';
    } else {
      ['ai-fluency', 'ai-lexical', 'ai-grammar', 'ai-overall'].forEach(id => {
        document.getElementById(id).textContent = '—';
      });
      document.getElementById('ai-strengths').textContent = 'No AI evaluation available.';
      document.getElementById('ai-improvements').textContent = '—';
    }

    // If already reviewed, prefill scores
    if (data.teacher_review) {
      const tr = data.teacher_review;
      setSelectValue('score-pronunciation', tr.pronunciation_score);
      setSelectValue('score-fluency', tr.adjusted_fluency);
      setSelectValue('score-lexical', tr.adjusted_lexical);
      setSelectValue('score-grammar', tr.adjusted_grammar);
      document.getElementById('teacher-feedback').value = tr.teacher_feedback || '';
      updateCharCount();
      recalcOverall();
      document.getElementById('submit-review-btn').textContent = 'Update review';
    }

    recalcOverall();

  } catch (err) {
    console.error(err);
    showToast('Error loading submission', 'error');
  }
}

function setSelectValue(selectId, value) {
  if (value === null || value === undefined) return;
  const select = document.getElementById(selectId);
  const formatted = parseFloat(value).toFixed(1);
  select.value = formatted;
}

/* ── Transcript toggle ──────────────────────────────────────────── */
function toggleTranscript() {
  transcriptExpanded = !transcriptExpanded;
  const el = document.getElementById('review-transcript');
  const btn = document.getElementById('show-more-btn');
  el.style.maxHeight = transcriptExpanded ? 'none' : '180px';
  btn.textContent = transcriptExpanded ? 'Show less ↑' : 'Show full transcript ↓';
}

/* ── Score calculation ──────────────────────────────────────────── */
function recalcOverall() {
  const ai = currentAiData;
  const pronunciation = parseFloat(document.getElementById('score-pronunciation').value);
  const fluency = parseFloat(document.getElementById('score-fluency').value) ||
    (ai?.fluency_coherence?.score ? parseFloat(ai.fluency_coherence.score) : null);
  const lexical = parseFloat(document.getElementById('score-lexical').value) ||
    (ai?.lexical_resource?.score ? parseFloat(ai.lexical_resource.score) : null);
  const grammar = parseFloat(document.getElementById('score-grammar').value) ||
    (ai?.grammar?.score ? parseFloat(ai.grammar.score) : null);

  const scores = [pronunciation, fluency, lexical, grammar].filter(s => s !== null && !isNaN(s));

  const finalEl = document.getElementById('final-overall');
  if (scores.length === 4) {
    const avg = scores.reduce((a, b) => a + b, 0) / 4;
    // Round to nearest 0.5
    const rounded = Math.round(avg * 2) / 2;
    finalEl.textContent = rounded.toFixed(1);
  } else {
    finalEl.textContent = '—';
  }
}

/* ── Char count ─────────────────────────────────────────────────── */
function updateCharCount() {
  const val = document.getElementById('teacher-feedback').value;
  document.getElementById('char-count').textContent = val.length;

  const errorEl = document.getElementById('feedback-error');
  if (val.length > 0 && val.length < 20) {
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
  }
}

/* ── Submit review ──────────────────────────────────────────────── */
async function submitReview() {
  if (!currentSubmission) return;

  const pronunciationVal = document.getElementById('score-pronunciation').value;
  const feedback = document.getElementById('teacher-feedback').value.trim();

  // Validate
  if (!pronunciationVal) {
    showToast('Pronunciation score is required', 'error');
    return;
  }

  if (feedback.length < 20) {
    showToast('Review must be at least 20 characters', 'error');
    document.getElementById('feedback-error').style.display = 'block';
    return;
  }

  const ai = currentAiData;
  const payload = {
    pronunciation_score: parseFloat(pronunciationVal),
    adjusted_fluency: parseFloat(document.getElementById('score-fluency').value) || null,
    adjusted_lexical: parseFloat(document.getElementById('score-lexical').value) || null,
    adjusted_grammar: parseFloat(document.getElementById('score-grammar').value) || null,
    teacher_feedback: feedback,
    final_overall_score: parseFloat(document.getElementById('final-overall').textContent) || null,
  };

  const btn = document.getElementById('submit-review-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const res = await fetch(`${Auth.API_BASE}/v1/submissions/${currentSubmission.id}/review`, {
      method: 'POST',
      headers: { ...Auth.getHeaders() },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast('Review submitted successfully!', 'success');
      btn.textContent = 'Update review';
      btn.disabled = false;

      // Refresh queue to update status
      await loadQueue();

    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.detail || 'Failed to submit review', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit review';
    }
  } catch (err) {
    console.error(err);
    showToast('Network error. Please try again.', 'error');
    btn.disabled = false;
    btn.textContent = 'Submit review';
  }
}

/* ── Skip to next ───────────────────────────────────────────────── */
function skipToNext() {
  if (!currentSubmission || filteredQueue.length === 0) return;

  const idx = filteredQueue.findIndex(s => s.id === currentSubmission.id);
  const next = filteredQueue[idx + 1];

  if (next) {
    openSubmission(next.id);
  } else {
    showToast('No more submissions in queue', '');
    document.getElementById('review-content').style.display = 'none';
    document.getElementById('review-empty').style.display = 'flex';
    currentSubmission = null;
  }
}

/* ── Reset form ─────────────────────────────────────────────────── */
function resetReviewForm() {
  ['score-pronunciation', 'score-fluency', 'score-lexical', 'score-grammar'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('teacher-feedback').value = '';
  document.getElementById('char-count').textContent = '0';
  document.getElementById('feedback-error').style.display = 'none';
  document.getElementById('final-overall').textContent = '—';
  document.getElementById('submit-review-btn').textContent = 'Submit review';
  document.getElementById('submit-review-btn').disabled = false;
}

