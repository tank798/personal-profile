import { apiFetch, escapeHtml, showToast } from './common.js';

const DEFAULT_ABOUT = '\u6b22\u8fce\u6765\u5230\u6211\u7684\u4e2a\u4eba\u7a7a\u95f4\uff0c\u8fd9\u91cc\u8bb0\u5f55\u6211\u7684\u5b9e\u4e60\u3001\u79d1\u7814\u548c\u5174\u8da3\u63a2\u7d22\u3002';
const TAGLINE_PATTERN = /^[A-Za-z0-9 .,&+\/\-]{2,24}$/;

const state = {
  items: [],
  currentIndex: 0,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDown: false,
  pointerId: null,
  suppressClickUntil: 0,
};

const profileNameEl = document.getElementById('profile-name');
const profileAboutEl = document.getElementById('profile-about');
const avatarWrapEl = document.getElementById('avatar-wrap');
const carouselWrapEl = document.getElementById('post-carousel-wrap');
const carouselEl = document.getElementById('post-carousel');
const prevBtnEl = document.getElementById('carousel-prev');
const nextBtnEl = document.getElementById('carousel-next');

function renderAvatar(url, name) {
  if (url) {
    avatarWrapEl.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />`;
    return;
  }

  const fallback = (name || '\u6211').slice(0, 1);
  avatarWrapEl.innerHTML = `<div class="avatar-fallback">${escapeHtml(fallback)}</div>`;
}

function renderProfileAbout(text) {
  const source = (text || DEFAULT_ABOUT).trim();
  const lines = source
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const normalized = lines.length ? lines : [DEFAULT_ABOUT];

  return normalized
    .map((line, index) => {
      const classNames = ['profile-line'];
      if (index === 0) {
        classNames.push('is-lead');
      }
      if (TAGLINE_PATTERN.test(line)) {
        classNames.push('is-tagline');
      }
      return `<span class="${classNames.join(' ')}">${escapeHtml(line)}</span>`;
    })
    .join('');
}

function renderPostCard(post, index) {
  const cover = post.coverImage?.url
    ? `<img class="post-cover" src="${escapeHtml(post.coverImage.url)}" alt="${escapeHtml(post.title)}" />`
    : '<div class="post-cover cover-placeholder">\u5185\u5bb9\u9884\u89c8</div>';

  return `
    <article class="post-card deck-card" data-index="${index}" data-post-id="${post.id}" role="button" tabindex="-1">
      ${cover}
      <div class="carousel-title-wrap">
        <h3 class="post-title">${escapeHtml(post.title)}</h3>
      </div>
    </article>
  `;
}

function navigateToPost(postId) {
  if (!postId) return;
  window.location.href = `/post.html?postId=${encodeURIComponent(postId)}`;
}

function getDeckMetrics() {
  if (window.innerWidth >= 1180) {
    return { xStep: 236, yStep: 22, scaleStep: 0.11, rotateStep: 4.5 };
  }

  if (window.innerWidth >= 840) {
    return { xStep: 190, yStep: 20, scaleStep: 0.1, rotateStep: 4 };
  }

  return { xStep: 124, yStep: 16, scaleStep: 0.09, rotateStep: 3.1 };
}

function getLoopOffset(index, activeIndex, count) {
  const forward = (index - activeIndex + count) % count;
  const backward = forward - count;
  return Math.abs(forward) <= Math.abs(backward) ? forward : backward;
}

function updateDeck() {
  const cards = [...carouselEl.querySelectorAll('.deck-card')];
  if (!cards.length) {
    carouselWrapEl?.style.removeProperty('--carousel-btn-top');
    prevBtnEl.classList.add('hidden');
    nextBtnEl.classList.add('hidden');
    return;
  }

  const metrics = getDeckMetrics();
  let activeCard = null;

  for (const card of cards) {
    const index = Number(card.dataset.index);
    const offset = getLoopOffset(index, state.currentIndex, cards.length);
    const absOffset = Math.abs(offset);

    card.classList.remove('is-active', 'is-left', 'is-right', 'is-neighbor');

    if (absOffset > 3) {
      card.classList.add('deck-hidden');
      card.tabIndex = -1;
      card.setAttribute('aria-hidden', 'true');
      continue;
    }

    const translateX = offset * metrics.xStep;
    const translateY = absOffset * metrics.yStep;
    const scale = 1 - absOffset * metrics.scaleStep;
    const opacity = Math.max(0.18, 1 - absOffset * 0.22);
    const rotate = offset === 0 ? 0 : Math.sign(offset) * Math.min(absOffset * metrics.rotateStep, metrics.rotateStep + 1.2);

    card.classList.remove('deck-hidden');
    card.classList.toggle('is-active', offset === 0);
    card.classList.toggle('is-left', offset < 0);
    card.classList.toggle('is-right', offset > 0);
    card.classList.toggle('is-neighbor', absOffset === 1);
    card.style.setProperty('--deck-x', `${translateX}px`);
    card.style.setProperty('--deck-y', `${translateY}px`);
    card.style.setProperty('--deck-scale', String(scale));
    card.style.setProperty('--deck-opacity', String(opacity));
    card.style.setProperty('--deck-rotate', `${rotate}deg`);
    card.style.zIndex = String(offset === 0 ? 140 : 120 - absOffset);
    card.tabIndex = offset === 0 ? 0 : -1;
    card.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');

    if (offset === 0) {
      activeCard = card;
    }
  }

  if (activeCard && carouselWrapEl) {
    const wrapRect = carouselWrapEl.getBoundingClientRect();
    const activeRect = activeCard.getBoundingClientRect();
    const buttonTop = activeRect.top - wrapRect.top + activeRect.height / 2;
    carouselWrapEl.style.setProperty('--carousel-btn-top', `${buttonTop}px`);
  }

  if (cards.length <= 1) {
    prevBtnEl.classList.add('hidden');
    nextBtnEl.classList.add('hidden');
    return;
  }

  prevBtnEl.classList.remove('hidden');
  nextBtnEl.classList.remove('hidden');
  prevBtnEl.disabled = false;
  nextBtnEl.disabled = false;
}

function goToIndex(nextIndex) {
  if (!state.items.length) return;

  const total = state.items.length;
  const normalized = ((nextIndex % total) + total) % total;
  if (normalized === state.currentIndex) return;

  state.currentIndex = normalized;
  updateDeck();
}

function goNext() {
  goToIndex(state.currentIndex + 1);
}

function goPrev() {
  goToIndex(state.currentIndex - 1);
}


function bindDeckInteractions() {
  prevBtnEl.addEventListener('click', (event) => {
    event.stopPropagation();
    goPrev();
  });

  nextBtnEl.addEventListener('click', (event) => {
    event.stopPropagation();
    goNext();
  });

  carouselEl.tabIndex = 0;

  carouselEl.addEventListener('click', (event) => {
    if (Date.now() < state.suppressClickUntil) return;

    const card = event.target.closest('.deck-card');
    if (!card) return;

    const index = Number(card.dataset.index);
    if (!Number.isFinite(index)) return;

    if (index !== state.currentIndex) {
      goToIndex(index);
      return;
    }

    navigateToPost(card.dataset.postId);
  });

  carouselEl.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const activeCard = carouselEl.querySelector('.deck-card.is-active');
      if (!activeCard) return;
      event.preventDefault();
      navigateToPost(activeCard.dataset.postId);
    }
  });

  carouselEl.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    state.pointerDown = true;
    state.pointerId = event.pointerId;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;

    if (carouselEl.setPointerCapture) {
      carouselEl.setPointerCapture(event.pointerId);
    }
  });

  carouselEl.addEventListener('pointerup', (event) => {
    if (!state.pointerDown || event.pointerId !== state.pointerId) return;

    const dx = event.clientX - state.pointerStartX;
    const dy = event.clientY - state.pointerStartY;

    state.pointerDown = false;
    state.pointerId = null;

    if (carouselEl.hasPointerCapture?.(event.pointerId)) {
      carouselEl.releasePointerCapture(event.pointerId);
    }

    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;

    state.suppressClickUntil = Date.now() + 280;

    if (dx < 0) {
      goNext();
      return;
    }

    goPrev();
  });

  carouselEl.addEventListener('pointercancel', (event) => {
    if (!state.pointerDown || event.pointerId !== state.pointerId) return;

    state.pointerDown = false;
    state.pointerId = null;

    if (carouselEl.hasPointerCapture?.(event.pointerId)) {
      carouselEl.releasePointerCapture(event.pointerId);
    }
  });

  window.addEventListener('resize', updateDeck);
}

async function loadProfile() {
  const profile = await apiFetch('/profile');
  profileNameEl.textContent = profile.displayName || '\u6211\u7684\u4e3b\u9875';
  profileAboutEl.innerHTML = renderProfileAbout(profile.site?.aboutMd || DEFAULT_ABOUT);
  renderAvatar(profile.avatarUrl, profile.displayName);
  document.title = profile.site?.title || profile.displayName || '\u4e2a\u4eba\u4e3b\u9875';
}

async function loadPosts() {
  carouselEl.innerHTML = '<div class="loading-block">\u5185\u5bb9\u52a0\u8f7d\u4e2d...</div>';

  const data = await apiFetch('/posts?page=1&pageSize=50');
  state.items = data.items || [];
  state.currentIndex = 0;

  if (!state.items.length) {
    carouselEl.innerHTML = '<div class="empty-block post-carousel-empty">\u6682\u65f6\u8fd8\u6ca1\u6709\u5185\u5bb9\uff0c\u7a0d\u540e\u518d\u6765\u770b\u770b\u3002</div>';
    updateDeck();
    return;
  }

  carouselEl.innerHTML = state.items.map((post, index) => renderPostCard(post, index)).join('');
  updateDeck();
}

async function boot() {
  bindDeckInteractions();
  await Promise.all([loadProfile(), loadPosts()]);
}

boot().catch((error) => {
  console.error(error);
  showToast(error.message || '\u9875\u9762\u52a0\u8f7d\u5931\u8d25');
  carouselEl.innerHTML = '<div class="empty-block post-carousel-empty">\u9875\u9762\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002</div>';
});
