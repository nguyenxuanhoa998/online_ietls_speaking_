/**
 * submission.js
 * New speaking submission page logic.
 * Depends on: auth.js (must be loaded first)
 */

'use strict';

/* ── Auth guard ────────────────────────────────────────────────── */
if (!Auth.requireAuth()) { /* redirects if no token */ }

/* ── State ─────────────────────────────────────────────────────── */
let currentPart   = 'part1';
let currentQuestion = null;
let mediaRecorder = null;
let audioChunks   = [];
let audioBlob     = null;
let isRecording   = false;

/* ── Part data ─────────────────────────────────────────────────── */
const PARTS = {
  part1: {
    label: 'Part 1',
    guide: {
      title: 'Part 1 guide',
      badge: '4–5 min',
      bullets: [
        '10–12 questions',
        'Short answers (2–3 sentences)',
        'Personal &amp; familiar topics',
        'No preparation time',
      ],
    },
    hint: 'Aim for 4–5 min for Part 1.',
    tip: 'Give direct answers and extend with personal details or examples. Avoid one-word replies.',
    questions: [
      { tag: 'PART 1 — HOMETOWN',  text: '"Tell me about the town or city where you grew up. What did you like most about it?"' },
      { tag: 'PART 1 — HOBBIES',   text: '"What do you enjoy doing in your free time? How long have you been doing this?"' },
      { tag: 'PART 1 — WORK/STUDY',text: '"Do you work or are you a student? What do you enjoy most about it?"' },
      { tag: 'PART 1 — TRANSPORT', text: '"How do you usually travel around your city? Do you prefer public transport or private vehicles?"' },
      { tag: 'PART 1 — FOOD',      text: '"What kinds of food do you enjoy eating? Is there a particular dish you cook at home?"' },
    ],
  },
  part2: {
    label: 'Part 2',
    guide: {
      title: 'Part 2 guide',
      badge: '3–4 min',
      bullets: [
        '1 cue card topic',
        'Speak for 1–2 minutes',
        '1 minute to prepare',
        'Follow-up questions after',
      ],
    },
    hint: 'Aim for 3–4 min for Part 2.',
    tip: 'Use your 1-minute prep time well. Structure your answer: situation → action → result → reflection.',
    questions: [
      { tag: 'PART 2 — MEMORABLE EXPERIENCE', text: '"Describe a time when you helped a stranger. You should say what happened, how you helped, and how you felt."' },
      { tag: 'PART 2 — PERSON',               text: '"Describe a person who has had a big influence on your life. You should say who this person is, how you know them, and why they influenced you."' },
      { tag: 'PART 2 — PLACE',                text: '"Describe a place you have visited that you found particularly interesting. You should say where it is, when you went, and why it was interesting."' },
    ],
  },
  part3: {
    label: 'Part 3',
    guide: {
      title: 'Part 3 guide',
      badge: '4–5 min',
      bullets: [
        '4–6 abstract questions',
        'Discuss ideas &amp; opinions',
        'Linked to Part 2 topic',
        'Longer, complex answers',
      ],
    },
    hint: 'Aim for 4–5 min for Part 3.',
    tip: 'Give your opinion, then support it with reasons or examples. Try to discuss both sides.',
    questions: [
      { tag: 'PART 3 — SOCIETY &amp; TECHNOLOGY', text: '"Do you think technology has improved communication between people? In what ways might it have negative effects?"' },
      { tag: 'PART 3 — ENVIRONMENT',              text: '"How responsible do you think individuals are for protecting the environment? What can governments do to help?"' },
      { tag: 'PART 3 — EDUCATION',                text: '"Do you think the way children are taught in schools has changed significantly in recent years? What further changes might be needed?"' },
    ],
  },
};

/* ── Init ──────────────────────────────────────────────────────── */
(async function init() {
  const user = await Auth.getCurrentUser();
  if (user) {
    document.getElementById('nav-name').textContent   = user.full_name || 'User';
    const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('nav-avatar').textContent = initials;
  }
  selectPart('part1');
  loadRecentSubmissions();
})();

/* ── Part selection ────────────────────────────────────────────── */
function selectPart(part) {
  if (isRecording) return; // lock during recording

  currentPart = part;
  audioBlob   = null;

  // Update part buttons
  ['part1', 'part2', 'part3'].forEach(p => {
    document.getElementById('btn-' + p).classList.toggle('active', p === part);
  });

  // Load a random question for the selected part
  loadNewQuestion();

  // Update guide sidebar
  _updateGuide(part);

  // Reset recorder state back to idle
  _setRecordState('idle');
  _updateChecklist(false);
}

/* ── Questions ─────────────────────────────────────────────────── */
function loadNewQuestion() {
  const data = PARTS[currentPart];
  const q    = data.questions[Math.floor(Math.random() * data.questions.length)];
  currentQuestion = q;

  document.getElementById('question-tag').innerHTML  = q.tag;
  document.getElementById('question-text').innerHTML = q.text;
}

/* ── Guide sidebar ─────────────────────────────────────────────── */
function _updateGuide(part) {
  const data = PARTS[part];
  const g    = data.guide;

  document.getElementById('guide-title').textContent = g.title;
  document.getElementById('guide-badge').textContent = g.badge;

  const list = document.getElementById('guide-list');
  list.innerHTML = g.bullets.map(b => `<li>${b}</li>`).join('');

  document.getElementById('tip-label').textContent = `Tip for ${data.label}`;
  document.getElementById('tip-text').textContent  = data.tip;

  document.getElementById('rec-hint').textContent      = data.hint;
  document.getElementById('rec-hint-done').textContent = data.hint;
}

/* ── Recording state machine ───────────────────────────────────── */
function _setRecordState(state) {
  // state: 'idle' | 'recording' | 'done' | 'submitted'
  ['idle', 'recording', 'done', 'submitted'].forEach(s => {
    document.getElementById('state-' + s).classList.toggle('hidden', s !== state);
  });

  // Update stepper
  if (state === 'done') {
    document.getElementById('step-3').classList.add('done');
    document.getElementById('step-3').classList.remove('active');
    document.getElementById('step-4').classList.add('active');
    document.getElementById('line-2').classList.add('done');
    document.getElementById('line-3').classList.add('done');
  } else if (state === 'submitted') {
    document.getElementById('step-4').classList.add('done');
    document.getElementById('step-4').classList.remove('active');
    document.getElementById('line-3').classList.add('done');
    // Update submit button
    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.textContent = 'Submitted ✓';
    btnSubmit.classList.add('submitted');
    btnSubmit.disabled = true;
  } else if (state === 'idle') {
    // Reset stepper to step 3 active
    document.getElementById('step-3').classList.remove('done');
    document.getElementById('step-3').classList.add('active');
    document.getElementById('step-4').classList.remove('active', 'done');
    document.getElementById('line-2').classList.remove('done');
    document.getElementById('line-3').classList.remove('done');
  }
}

function _updateChecklist(hasAudio) {
  const icon = document.getElementById('chk-audio');
  if (hasAudio) {
    icon.className = 'check-icon check-done';
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else {
    icon.className = 'check-icon check-empty';
    icon.innerHTML = '';
  }

  const btnSubmit = document.getElementById('btn-submit');
  if (!btnSubmit.classList.contains('submitted')) {
    btnSubmit.disabled = !hasAudio;
  }
}

/* ── Start recording ───────────────────────────────────────────── */
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
      isRecording = false;
      _setRecordState('done');
      _updateChecklist(true);
    };

    mediaRecorder.start();
    isRecording = true;

    // Pulse animation on stop button
    document.querySelector('.mic-btn-stop').classList.add('pulsing');

    _setRecordState('recording');
  } catch (err) {
    alert('Microphone access denied. Please allow microphone access and try again.');
    console.error(err);
  }
}

/* ── Stop recording ────────────────────────────────────────────── */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

/* ── File upload ───────────────────────────────────────────────── */
function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const validExts = ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.flac'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    alert('Invalid audio format. Please upload .mp3, .wav, .m4a, .webm, .ogg or .flac');
    return;
  }

  audioBlob = file;
  _setRecordState('done');
  _updateChecklist(true);

  // Reset file input so same file can be re-selected
  input.value = '';
}

/* ── Submit evaluation ─────────────────────────────────────────── */
async function submitEvaluation() {
  if (!audioBlob) return;

  const btnSubmit = document.getElementById('btn-submit');
  btnSubmit.textContent = 'Submitting...';
  btnSubmit.disabled    = true;

  try {
    const formData = new FormData();
    const filename = audioBlob instanceof File ? audioBlob.name : 'recording.webm';
    formData.append('file', audioBlob, filename);
    formData.append('part', currentPart);
    if (currentQuestion && currentQuestion.text) {
      formData.append('question_text', currentQuestion.text);
    }

    const res = await fetch(`${Auth.API_BASE}/v1/submissions`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
      body:    formData,
    });

    if (res.ok) {
      _setRecordState('submitted');
      loadRecentSubmissions(); // refresh list
    } else {
      const data = await res.json().catch(() => ({}));
      alert('Submission failed: ' + (data.detail || 'Unknown error'));
      btnSubmit.textContent = 'Submit for evaluation';
      btnSubmit.disabled    = false;
    }
  } catch (err) {
    console.error(err);
    alert('Cannot connect to server. Please try again.');
    btnSubmit.textContent = 'Submit for evaluation';
    btnSubmit.disabled    = false;
  }
}

/* ── Submit another ────────────────────────────────────────────── */
function submitAnother() {
  audioBlob   = null;
  isRecording = false;

  // Reset submit button
  const btnSubmit = document.getElementById('btn-submit');
  btnSubmit.textContent = 'Submit for evaluation';
  btnSubmit.classList.remove('submitted');
  btnSubmit.disabled = true;

  // Reset stepper fully
  document.getElementById('step-3').classList.remove('done');
  document.getElementById('step-3').classList.add('active');
  document.getElementById('step-4').classList.remove('active', 'done');
  document.getElementById('line-2').classList.remove('done');
  document.getElementById('line-3').classList.remove('done');

  _setRecordState('idle');
  _updateChecklist(false);
  loadNewQuestion();
}

/* ── Fetch recent submissions ──────────────────────────────────── */
async function loadRecentSubmissions() {
  try {
    const res = await fetch(`${Auth.API_BASE}/v1/submissions`, {
      headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    
    const listEl = document.querySelector('.recent-list');
    if (!listEl) return;
    
    if (data.length === 0) {
      listEl.innerHTML = '<div style="color:#64748b; font-size:14px; text-align:center; padding:10px;">No recent submissions.</div>';
      return;
    }
    
    // Take top 4 max
    const recent = data.slice(0, 4);
    listEl.innerHTML = recent.map(sub => {
      const dateStr = new Date(sub.submitted_at).toLocaleDateString('en-GB');
      let statusBadge = '';
      let scoreBadge = '';
      
      const isEvaluated = ['ai_evaluated', 'reviewed'].includes(sub.status) || sub.score !== null;
      
      if (isEvaluated) {
        const score = sub.score !== null ? sub.score : '-';
        scoreBadge = `<span class="recent-score">${score}</span>`;
        statusBadge = `<span class="badge badge-reviewed">Reviewed</span>`;
      } else {
        statusBadge = `<span class="badge badge-pending">Pending</span>`;
      }
      
      let partDisplay = sub.part;
      if (sub.part === 'part1') partDisplay = 'Part 1';
      else if (sub.part === 'part2') partDisplay = 'Part 2';
      else if (sub.part === 'part3') partDisplay = 'Part 3';
      
      return `
        <div class="recent-item" style="cursor:pointer;" onclick="window.location.href='/result.html?id=${sub.id}'" title="View details">
            <div class="recent-meta">
                <span class="recent-id">#${sub.id}</span>
                <span class="recent-part">${partDisplay || 'Part ?'}</span>
                <div class="recent-date">${dateStr}</div>
            </div>
            ${scoreBadge ? `<div class="recent-score-wrap">${scoreBadge}${statusBadge}</div>` : statusBadge}
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Error loading recent submissions', err);
  }
}