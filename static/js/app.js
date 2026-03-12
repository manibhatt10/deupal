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

// ===== State =====
let currentCardId = null;
let isFlipped = false;
let isTransitioning = false;
let currentFilter = null;

// Guest State
let isGuest = false;
let allGuestCards = [];
let guestProgress = {};

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

// ===== Card Rendering =====
function renderCard(data) {
    const german = document.getElementById('card-german');
    const english = document.getElementById('card-english');
    const nepali = document.getElementById('card-nepali');
    const badgeFront = document.getElementById('card-badge');
    const badgeBack = document.getElementById('card-badge-back');
    const cardContainer = document.getElementById('active-card');
    const counter = document.getElementById('card-counter');

    if (!german) return;

    const card = data.card;
    currentCardId = card.id;

    // Update text
    german.textContent = card.german_text;
    english.textContent = card.english_text;
    nepali.textContent = card.nepali_text;

    // Update badges
    const badgeClass = `badge-${card.status.toLowerCase()}`;
    [badgeFront, badgeBack].forEach(badge => {
        if (!badge) return;
        badge.classList.remove('badge-new', 'badge-revision', 'badge-mastered');
        badge.classList.add(badgeClass);
        const span = badge.querySelector('span');
        if (span) span.textContent = card.status;
    });

    // Reset flip state
    if (cardContainer) {
        cardContainer.classList.remove('flipped');
        isFlipped = false;
    }

    // Highlight active status button
    highlightStatusButton(card.status);

    // Update counter
    if (counter && data.position !== undefined) {
        counter.textContent = `Card ${data.position} of ${data.total}`;
        counter.classList.remove('opacity-0');
        counter.classList.add('opacity-100');
    }
}

function highlightStatusButton(status) {
    const buttons = document.querySelectorAll('#status-buttons .btn-status');
    buttons.forEach(btn => {
        btn.classList.remove('ring-2', 'ring-sky-300', 'dark:ring-white', 'scale-105', 'ring-white');
        if (btn.dataset.status === status) {
            btn.classList.add('ring-2', 'ring-sky-300', 'scale-105');
        }
    });
}

// ===== Card Fetching =====
async function fetchCard(direction = 'next') {
    if (isTransitioning) return;
    isTransitioning = true;

    const container = document.getElementById('single-card');
    if (!container) { isTransitioning = false; return; }

    // Slide out animation
    const slideOutClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
    const slideInClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';

    container.classList.add(slideOutClass);

    await new Promise(r => setTimeout(r, 250));

    try {
        if (isGuest) {
            const localData = getGuestCard(direction, currentCardId);
            if (localData) renderCard({ success: true, ...localData });
        } else {
            let url = '/api/card/?direction=' + direction;
            if (currentCardId) {
                url += '&current_id=' + currentCardId;
            }
            if (currentFilter) {
                url += '&filter_status=' + currentFilter;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.success) {
                renderCard(data);
            } else {
                console.error('Failed to fetch card:', data.error);
            }
        }
    } catch (err) {
        console.error('Network error:', err);
    }

    // Remove slide-out, add slide-in
    container.classList.remove(slideOutClass);
    container.classList.add(slideInClass);

    await new Promise(r => setTimeout(r, 350));
    container.classList.remove(slideInClass);

    isTransitioning = false;
}

function getGuestCard(direction, currentId) {
    let cardsWithMeta = allGuestCards.map(c => {
        const s = guestProgress[c.id] || 'New';
        let p = 0;
        if (s === 'Revision') p = 1;
        if (s === 'Mastered') p = 2;
        return { ...c, status: s, priority: p };
    });

    if (currentFilter) {
        cardsWithMeta = cardsWithMeta.filter(c => c.status === currentFilter);
    }

    cardsWithMeta.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.id - b.id;
    });

    if (cardsWithMeta.length === 0) return null;

    let currentIndex = -1;
    if (currentId) currentIndex = cardsWithMeta.findIndex(c => c.id == currentId);

    let nextIndex = 0;
    if (currentIndex !== -1) {
        if (direction === 'next') {
            nextIndex = (currentIndex + 1) % cardsWithMeta.length;
        } else {
            nextIndex = (currentIndex - 1 + cardsWithMeta.length) % cardsWithMeta.length;
        }
    }

    return {
        card: cardsWithMeta[nextIndex],
        position: nextIndex + 1,
        total: cardsWithMeta.length
    };
}

// ===== Status Update =====
async function updateStatus(newStatus) {
    if (!currentCardId) return;

    // Optimistic badge update
    const badgeFront = document.getElementById('card-badge');
    const badgeBack = document.getElementById('card-badge-back');
    const badgeClass = `badge-${newStatus.toLowerCase()}`;

    [badgeFront, badgeBack].forEach(badge => {
        if (!badge) return;
        badge.classList.remove('badge-new', 'badge-revision', 'badge-mastered');
        badge.classList.add(badgeClass);
        const span = badge.querySelector('span');
        if (span) span.textContent = newStatus;
    });

    highlightStatusButton(newStatus);

    try {
        if (isGuest) {
            guestProgress[currentCardId] = newStatus;
            localStorage.setItem('guestProgress', JSON.stringify(guestProgress));
            const stats = getGuestStats();
            updateProgressBar(stats.new_count, stats.revision_count, stats.mastered_count, stats.total);
            setTimeout(() => fetchCard('next'), 400);
        } else {
            const response = await fetch('/update/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    card_id: currentCardId,
                    new_status: newStatus,
                }),
            });

            const data = await response.json();

            if (data.success) {
                updateProgressBar(data.new_count, data.revision_count, data.mastered_count, data.total);

                // Auto-advance to next card after a short delay
                setTimeout(() => fetchCard('next'), 400);
            } else {
                console.error('Update failed:', data.error);
            }
        }
    } catch (err) {
        console.error('Network error:', err);
    }
}

function getGuestStats() {
    let newCount = 0, revCount = 0, mastCount = 0;
    allGuestCards.forEach(c => {
        const s = guestProgress[c.id] || 'New';
        if (s === 'Revision') revCount++;
        else if (s === 'Mastered') mastCount++;
        else newCount++;
    });
    return {
        new_count: newCount,
        revision_count: revCount,
        mastered_count: mastCount,
        total: allGuestCards.length
    };
}

// ===== Progress Bar =====
function updateProgressBar(newCount, revisionCount, masteredCount, total) {
    if (total === 0) return;

    const newBar = document.getElementById('progress-new');
    const revisionBar = document.getElementById('progress-revision');
    const masteredBar = document.getElementById('progress-mastered');

    if (newBar) newBar.style.width = `${(newCount / total) * 100}%`;
    if (revisionBar) revisionBar.style.width = `${(revisionCount / total) * 100}%`;
    if (masteredBar) masteredBar.style.width = `${(masteredCount / total) * 100}%`;

    const newLabel = document.getElementById('count-new');
    const revisionLabel = document.getElementById('count-revision');
    const masteredLabel = document.getElementById('count-mastered');

    if (newLabel) newLabel.textContent = newCount;
    if (revisionLabel) revisionLabel.textContent = revisionCount;
    if (masteredLabel) masteredLabel.textContent = masteredCount;
}

// ===== Word List Modal =====
async function openWordList(status) {
    const modal = document.getElementById('word-list-modal');
    const title = document.getElementById('modal-title');
    const items = document.getElementById('word-items');
    const countLabel = document.getElementById('modal-count');

    if (!modal || !title || !items) return;

    title.textContent = `${status} Word List`;
    items.innerHTML = '<div class="text-center py-8 text-slate-500 animate-pulse">Fetching words...</div>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent scroll

    try {
        let words = [];
        if (isGuest) {
            words = allGuestCards.filter(c => {
                const s = guestProgress[c.id] || 'New';
                if (status === 'New') return s === 'New';
                return s === status;
            });
        } else {
            const res = await fetch(`/api/word_list/?status=${status}`);
            const data = await res.json();
            if (data.success) {
                words = data.cards;
            } else {
                items.innerHTML = `<div class="text-center py-8 text-rose-500">Error: ${data.error}</div>`;
                return;
            }
        }

        if (words.length === 0) {
            items.innerHTML = '<div class="text-center py-8 text-slate-500">No words found in this category.</div>';
            if (countLabel) countLabel.textContent = '0';
        } else {
            items.innerHTML = words.map(card => `
                <div class="p-3 rounded-lg bg-white/5 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white/10 transition-colors">
                    <div>
                        <div class="font-bold text-lg text-slate-200">${card.german_text}</div>
                        <div class="text-xs text-sky-400 font-medium">${card.nepali_text}</div>
                    </div>
                    <div class="text-sm text-slate-400 italic sm:text-right">
                        ${card.english_text}
                    </div>
                </div>
            `).join('');
            if (countLabel) countLabel.textContent = words.length;
        }
    } catch (err) {
        console.error(err);
        items.innerHTML = '<div class="text-center py-8 text-rose-500">Failed to load word list.</div>';
    }
}

function closeWordList() {
    const modal = document.getElementById('word-list-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ===== Filter Logic =====
function setFilter(status) {
    if (currentFilter === status) {
        currentFilter = null; // Toggle off
    } else {
        currentFilter = status;
    }

    // Update UI highlighting
    document.querySelectorAll('.filter-category').forEach(el => {
        el.classList.remove('ring-2', 'ring-offset-2', 'ring-sky-400', 'ring-amber-400', 'ring-emerald-400', 'dark:ring-offset-neutral-800');
        if (currentFilter && el.dataset.status === currentFilter) {
            let ringClass = 'ring-sky-400';
            if (currentFilter === 'Revision') ringClass = 'ring-amber-400';
            if (currentFilter === 'Mastered') ringClass = 'ring-emerald-400';
            el.classList.add('ring-2', 'ring-offset-2', ringClass, 'dark:ring-offset-neutral-800');
        }
    });

    // Reset current card and fetch
    currentCardId = null;
    fetchCard('next');
}

// ===== Swipe Support =====
let touchStartX = 0;
let touchStartY = 0;

function initSwipe() {
    const card = document.getElementById('single-card');
    if (!card) return;

    card.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].screenX - touchStartX;
        const dy = e.changedTouches[0].screenY - touchStartY;

        // Only trigger swipe if horizontal movement is significant and more than vertical
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx > 0) {
                fetchCard('prev');
            } else {
                fetchCard('next');
            }
        }
    }, { passive: true });
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();

    const guestData = document.getElementById('guest-data');
    if (guestData) {
        isGuest = guestData.dataset.isGuest === 'true';
        if (isGuest) {
            guestProgress = JSON.parse(localStorage.getItem('guestProgress') || '{}');
            try {
                const res = await fetch('/api/all_cards/');
                const data = await res.json();
                if (data.success) {
                    allGuestCards = data.cards;
                    const stats = getGuestStats();
                    updateProgressBar(stats.new_count, stats.revision_count, stats.mastered_count, stats.total);
                }
            } catch (e) { console.error(e); }
        }
    }

    // Only init the study page features if the card elements exist
    const activeCard = document.getElementById('active-card');
    if (!activeCard) return;

    // Flip card on click
    activeCard.addEventListener('click', () => {
        activeCard.classList.toggle('flipped');
        isFlipped = !isFlipped;
    });

    // Navigation buttons
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');

    if (prevBtn) prevBtn.addEventListener('click', () => fetchCard('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => fetchCard('next'));

    // Status buttons
    document.querySelectorAll('#status-buttons .btn-status').forEach(btn => {
        btn.addEventListener('click', () => {
            updateStatus(btn.dataset.status);
        });
    });

    // Filter categories
    document.querySelectorAll('.filter-category').forEach(btn => {
        btn.addEventListener('click', () => {
            setFilter(btn.dataset.status);
        });
    });

    // Word List Buttons
    const btnNew = document.getElementById('btn-list-new');
    const btnRev = document.getElementById('btn-list-revision');
    const btnMast = document.getElementById('btn-list-mastered');
    const btnClose = document.getElementById('btn-close-modal');
    const modal = document.getElementById('word-list-modal');

    if (btnNew) btnNew.addEventListener('click', () => openWordList('New'));
    if (btnRev) btnRev.addEventListener('click', () => openWordList('Revision'));
    if (btnMast) btnMast.addEventListener('click', () => openWordList('Mastered'));
    if (btnClose) btnClose.addEventListener('click', closeWordList);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('absolute')) {
                closeWordList();
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                fetchCard('prev');
                break;
            case 'ArrowRight':
                e.preventDefault();
                fetchCard('next');
                break;
            case ' ':
                e.preventDefault();
                if (activeCard) {
                    activeCard.classList.toggle('flipped');
                    isFlipped = !isFlipped;
                }
                break;
            case '1':
                updateStatus('New');
                break;
            case '2':
                updateStatus('Revision');
                break;
            case '3':
                updateStatus('Mastered');
                break;
        }
    });

    // Initialize swipe support for mobile
    initSwipe();

    // Load the first card
    fetchCard('next');
});
