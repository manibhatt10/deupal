// ===== CSRF Token Utility =====
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

const csrftoken = getCookie('csrftoken');

// ===== Theme Toggle =====
function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
        const html = document.documentElement;
        const isDark = html.classList.contains('dark');

        if (isDark) {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
    });
}

// ===== Card Flip =====
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme toggle
    initTheme();

    // Flip cards on click (only on the card area, not the buttons)
    document.querySelectorAll('.card-container').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't flip if clicking a button
            if (e.target.closest('.btn-status') || e.target.closest('.status-buttons')) {
                return;
            }
            card.classList.toggle('flipped');
        });
    });

    // Status buttons
    document.querySelectorAll('.btn-status').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = btn.dataset.cardId;
            const newStatus = btn.dataset.status;
            updateStatus(cardId, newStatus, btn);
        });
    });
});

// ===== AJAX Status Update =====
async function updateStatus(cardId, newStatus, button) {
    const cardEl = button.closest('.card-wrapper');

    // Optimistic UI: update badge immediately
    const badge = cardEl.querySelector('.status-badge');
    const badgeText = badge.querySelector('span') || badge;

    // Remove old badge classes
    badge.classList.remove('badge-new', 'badge-revision', 'badge-mastered');

    // Add new badge class
    const badgeClass = `badge-${newStatus.toLowerCase()}`;
    badge.classList.add(badgeClass);
    badgeText.textContent = newStatus;

    // Highlight active button
    cardEl.querySelectorAll('.btn-status').forEach(b => {
        b.classList.remove('ring-2', 'ring-sky-300', 'ring-white', 'scale-105');
    });
    button.classList.add('ring-2', 'ring-sky-300', 'scale-105');

    try {
        const response = await fetch('/update/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify({
                card_id: parseInt(cardId),
                new_status: newStatus,
            }),
        });

        const data = await response.json();

        if (data.success) {
            // Update progress bar
            updateProgressBar(data.new_count, data.revision_count, data.mastered_count, data.total);

            // Flash feedback
            button.classList.add('animate-pulse-soft');
            setTimeout(() => button.classList.remove('animate-pulse-soft'), 1000);
        } else {
            console.error('Update failed:', data.error);
        }
    } catch (err) {
        console.error('Network error:', err);
    }
}

// ===== Progress Bar Update =====
function updateProgressBar(newCount, revisionCount, masteredCount, total) {
    if (total === 0) return;

    const newBar = document.getElementById('progress-new');
    const revisionBar = document.getElementById('progress-revision');
    const masteredBar = document.getElementById('progress-mastered');

    if (newBar) newBar.style.width = `${(newCount / total) * 100}%`;
    if (revisionBar) revisionBar.style.width = `${(revisionCount / total) * 100}%`;
    if (masteredBar) masteredBar.style.width = `${(masteredCount / total) * 100}%`;

    // Update count labels
    const newLabel = document.getElementById('count-new');
    const revisionLabel = document.getElementById('count-revision');
    const masteredLabel = document.getElementById('count-mastered');

    if (newLabel) newLabel.textContent = newCount;
    if (revisionLabel) revisionLabel.textContent = revisionCount;
    if (masteredLabel) masteredLabel.textContent = masteredCount;
}
