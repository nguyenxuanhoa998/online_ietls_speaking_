/**
 * result.js
 * Logic for the result/evaluation page.
 */

'use strict';

if (!Auth.requireAuth()) { /* redirects if no token */ }

document.addEventListener('DOMContentLoaded', async () => {
    // Populate user info
    const user = await Auth.getCurrentUser();
    if (user) {
        document.getElementById('nav-name').textContent = user.full_name || 'User';
        const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        document.getElementById('nav-avatar').textContent = initials;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const submissionId = urlParams.get('id');

    if (!submissionId) {
        alert("No submission ID provided.");
        window.location.href = '/dashboard.html';
        return;
    }

    await loadResult(submissionId);
});

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

        // Check if evaluating
        if (data.status === 'pending' || data.status === 'transcribed') {
            document.getElementById('pending-state').classList.remove('hidden');
            return;
        }

        // Must have AI evaluation 
        if (!data.ai_evaluation) {
            document.getElementById('pending-state').classList.remove('hidden');
            return;
        }

        // Display results
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

    // Set text
    parent.querySelector('.percentage').textContent = s.toFixed(1);

    // Set color
    const colorClass = getScoreColorClass(s);
    parent.className = `circle-group ${colorClass}`;

    // Set stroke dasharray (Max score is 9.0, meaning 100 on the graph)
    const percentage = Math.min((s / 9.0) * 100, 100);
    const circle = parent.querySelector('.circle');
    // Using a slight delay to allow CSS transition to play
    setTimeout(() => {
        circle.setAttribute('stroke-dasharray', `${percentage}, 100`);
    }, 100);
}

function setScoreElement(id, score) {
    const s = parseFloat(score) || 0;
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = s.toFixed(1);

    // Set color class on card
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
    audio.src = Auth.API_BASE.replace('/api/v1', '') + data.audio_url;

    document.getElementById('res-transcript').textContent = data.transcript || 'No transcript generated.';

    // Bottom Feedback (Mistakes & Suggestions)
    const mistakesList = document.getElementById('res-mistakes');
    const mistakes = ai.key_mistakes || [];
    if (mistakes.length > 0) {
        mistakesList.innerHTML = mistakes.map(m => `<li>${m}</li>`).join('');
    } else {
        mistakesList.innerHTML = `<li>No major mistakes found.</li>`;
    }

    const suggestionsList = document.getElementById('res-suggestions');
    const suggestions = ai.improvement_suggestions || [];
    if (suggestions.length > 0) {
        suggestionsList.innerHTML = suggestions.map(m => `<li>${m}</li>`).join('');
    } else {
        suggestionsList.innerHTML = `<li>Keep practicing!</li>`;
    }
}
