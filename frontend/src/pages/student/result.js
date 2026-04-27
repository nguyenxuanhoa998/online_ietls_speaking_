/**
 * result.js
 * Logic for the result/evaluation page.
 */

'use strict';

if (!Auth.requireAuth()) { /* redirects if no token */ }

document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.getCurrentUser();
    if (user) {
        document.getElementById('nav-name').textContent = user.full_name || 'User';
        const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        document.getElementById('nav-avatar').textContent = initials;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');

    if (!submissionId) {
        window.location.href = '/results.html';
        return;
    }

    await loadResult(submissionId);
});

let _pollTimer = null;

function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

window.addEventListener('beforeunload', stopPolling);

async function loadResult(id) {
    try {
        const res = await fetch(`${Auth.API_BASE}/v1/submissions/${id}`, {
            headers: Auth.getHeaders()
        });

        if (!res.ok) {
            console.error('Failed to load submission');
            alert("Could not load the submission.");
            window.location.href = '/dashboard.html';
            return;
        }

        const data = await res.json();

        document.getElementById('loading-spinner').classList.add('hidden');

        const stillEvaluating = data.status === 'pending' || data.status === 'transcribed' || !data.ai_evaluation;

        if (stillEvaluating) {
            document.getElementById('pending-state').classList.remove('hidden');
            if (!_pollTimer) {
                _pollTimer = setInterval(async () => {
                    try {
                        const r = await fetch(`${Auth.API_BASE}/v1/submissions/${id}`, { headers: Auth.getHeaders() });
                        if (!r.ok) return;
                        const d = await r.json();
                        if (d.status !== 'pending' && d.status !== 'transcribed' && d.ai_evaluation) {
                            stopPolling();
                            document.getElementById('pending-state').classList.add('hidden');
                            document.getElementById('result-content').classList.remove('hidden');
                            renderResult(d);
                        }
                    } catch (e) { console.error('Poll error:', e); }
                }, 4000);
            }
            return;
        }

        stopPolling();
        document.getElementById('result-content').classList.remove('hidden');
        renderResult(data);

    } catch (err) {
        console.error("Error fetching submission details:", err);
        alert("An error occurred while loading results.");
    }
}

function getScoreColorClass(score) {
    const s = parseFloat(score);
    if (isNaN(s)) return 'score-color-green';
    if (s < 5.0) return 'score-color-red';
    if (s <= 6.5) return 'score-color-yellow';
    return 'score-color-green';
}

function getOverallColorClass(score) {
    const s = parseFloat(score);
    if (isNaN(s)) return 'score-green';
    if (s < 5.0) return 'score-red';
    if (s <= 6.5) return 'score-yellow';
    return 'score-green';
}

function getBandDescriptor(score) {
    const s = parseFloat(score);
    if (isNaN(s)) return "Evaluated";
    if (s >= 9.0) return "Expert User";
    if (s >= 8.0) return "Very Good User";
    if (s >= 7.0) return "Good User";
    if (s >= 6.0) return "Competent User";
    if (s >= 5.0) return "Modest User";
    if (s >= 4.0) return "Limited User";
    return "Extremely Limited";
}

function setCircleScore(elementId, score) {
    const s = parseFloat(score) || 0;
    const parent = document.getElementById(elementId);

    parent.querySelector('.percentage').textContent = s.toFixed(1);

    const colorClass = getScoreColorClass(s);
    parent.className = `circle-group ${colorClass}`;

    const percentage = Math.min((s / 9.0) * 100, 100);
    const circle = parent.querySelector('.circle');
    setTimeout(() => {
        circle.setAttribute('stroke-dasharray', `${percentage}, 100`);
    }, 100);
}

function setScoreElement(id, score) {
    const s = parseFloat(score) || 0;
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = s.toFixed(1);

    const card = el.closest('.criteria-card');
    if (card) {
        card.classList.remove('score-color-red', 'score-color-yellow', 'score-color-green');
        card.classList.add(getScoreColorClass(s));
    }
}

function renderResult(data) {
    // Header Info
    let partDisplay = data.question.part;
    if (partDisplay === 'part1') partDisplay = 'Part 1';
    else if (partDisplay === 'part2') partDisplay = 'Part 2';
    else if (partDisplay === 'part3') partDisplay = 'Part 3';

    document.getElementById('res-part').textContent = partDisplay || 'Custom';
    document.getElementById('res-date').textContent = 'Submitted on ' + new Date(data.submitted_at).toLocaleString('en-GB');
    document.getElementById('res-question').textContent = `"${data.question.text}"`;

    const ai = data.ai_evaluation;

    // Overall Band
    const overallScore = typeof ai.overall_band !== 'undefined' ? ai.overall_band : 0.0;
    document.getElementById('overall-score').textContent = overallScore.toFixed(1);
    document.getElementById('overall-descriptor').textContent = getBandDescriptor(overallScore);

    const overallColor = getOverallColorClass(overallScore);
    document.getElementById('overall-score').closest('.overall-band').classList.remove('score-red', 'score-yellow', 'score-green');
    document.getElementById('overall-score').closest('.overall-band').classList.add(overallColor);

    // Component Scores (Circles)
    setCircleScore('score-fc', ai.fluency_coherence?.score || 0);
    setCircleScore('score-lr', ai.lexical_resource?.score || 0);
    setCircleScore('score-gr', ai.grammar?.score || 0);
    setCircleScore('score-pr', ai.pronunciation?.score || 0);

    // Detailed Criteria Breakdown
    setScoreElement('score-fc-val', ai.fluency_coherence?.score || 0);
    document.getElementById('fc-strengths').textContent = ai.fluency_coherence?.strengths || 'No specific strengths noted.';
    document.getElementById('fc-weaknesses').textContent = ai.fluency_coherence?.weaknesses || 'No specific weaknesses noted.';

    setScoreElement('score-lr-val', ai.lexical_resource?.score || 0);
    document.getElementById('lr-strengths').textContent = ai.lexical_resource?.strengths || 'No specific strengths noted.';
    document.getElementById('lr-weaknesses').textContent = ai.lexical_resource?.weaknesses || 'No specific weaknesses noted.';

    setScoreElement('score-gr-val', ai.grammar?.score || 0);
    document.getElementById('gr-strengths').textContent = ai.grammar?.strengths || 'No specific strengths noted.';
    document.getElementById('gr-weaknesses').textContent = ai.grammar?.weaknesses || 'No specific weaknesses noted.';

    setScoreElement('score-pr-val', ai.pronunciation?.score || 0);
    document.getElementById('pr-feedback').textContent = ai.pronunciation?.feedback || 'No feedback available.';

    if (ai.pronunciation?.weaknesses) {
        document.getElementById('pr-weaknesses').textContent = ai.pronunciation.weaknesses;
        document.getElementById('pr-weakness-wrap').classList.remove('hidden');
    }

    // Audio & Transcript
    const audio = document.getElementById('res-audio');
    audio.src = Auth.API_BASE.replace('/api', '') + data.audio_url;

    document.getElementById('res-transcript').textContent = data.transcript || 'No transcript generated.';

    // Key Mistakes & Suggestions
    const mistakesList = document.getElementById('res-mistakes');
    const mistakes = ai.key_mistakes || [];
    mistakesList.innerHTML = mistakes.length > 0
        ? mistakes.map(m => `<li>${m}</li>`).join('')
        : `<li>No major mistakes found.</li>`;

    const suggestionsList = document.getElementById('res-suggestions');
    const suggestions = ai.improvement_suggestions || [];
    suggestionsList.innerHTML = suggestions.length > 0
        ? suggestions.map(m => `<li>${m}</li>`).join('')
        : `<li>Keep practicing!</li>`;
}
