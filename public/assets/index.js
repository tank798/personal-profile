import { apiFetch, escapeHtml, showToast } from './common.js';

const DEFAULT_ABOUT = '欢迎来到我的个人空间，这里记录我的实习、科研和兴趣探索。';
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
const carouselEl = document.getElementById('post-carousel');
const prevBtnEl = document.getElementById('carousel-prev');
const nextBtnEl = document.getElementById('carousel-next');

function renderAvatar(url, name) {
  if (url) {
    avatarWrapEl.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />`;
    return;
  }

  const fallback = (name || '我').slice(0, 1);
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
    : '<div class="post-cover cover-placeholder">内容预览</div>';

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

function updateDeck() {
  const cards = [...carouselEl.querySelectorAll('.deck-card')];
  if (!cards.length) {
    prevBtnEl.classList.add('hidden');
    nextBtnEl.classList.add('hidden');
    return;
  }

  const metrics = getDeckMetrics();

  for (const card of cards) {
    const index = Number(card.dataset.index);
    const offset = index - state.currentIndex;
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
  }

  if (cards.length <= 1) {
    prevBtnEl.classList.add('hidden');
    nextBtnEl.classList.add('hidden');
    return;
  }

  prevBtnEl.classList.remove('hidden');
  nextBtnEl.classList.remove('hidden');
  prevBtnEl.disabled = state.currentIndex <= 0;
  nextBtnEl.disabled = state.currentIndex >= cards.length - 1;
}

function goToIndex(nextIndex) {
  if (!state.items.length) return;

  const clamped = Math.max(0, Math.min(state.items.length - 1, nextIndex));
  if (clamped === state.currentIndex) return;

  state.currentIndex = clamped;
  updateDeck();
}

function goNext() {
  goToIndex(state.currentIndex + 1);
}

function goPrev() {
  goToIndex(state.currentIndex - 1);
}

function handleDeckAreaClick(event) {
  const activeCard = carouselEl.querySelector('.deck-card.is-active');
  if (!activeCard) return false;

  const rect = activeCard.getBoundingClientRect();
  const outerBand = Math.min(80, rect.width * 0.18);

  if (event.clientX < rect.left + outerBand && state.currentIndex > 0) {
    goPrev();
    return true;
  }

  if (event.clientX > rect.right - outerBand && state.currentIndex < state.items.length - 1) {
    goNext();
    return true;
  }

  return false;
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
    if (!card) {
      handleDeckAreaClick(event);
      return;
    }

    const index = Number(card.dataset.index);
    if (!Number.isFinite(index)) return;

    if (index !== state.currentIndex) {
      goToIndex(index);
      return;
    }

    if (handleDeckAreaClick(event)) {
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
  profileNameEl.textContent = profile.displayName || '我的主页';
  profileAboutEl.innerHTML = renderProfileAbout(profile.site?.aboutMd || DEFAULT_ABOUT);
  renderAvatar(profile.avatarUrl, profile.displayName);
  document.title = profile.site?.title || profile.displayName || '个人主页';
}

async function loadPosts() {
  carouselEl.innerHTML = '<div class="loading-block">内容加载中...</div>';

  const data = await apiFetch('/posts?page=1&pageSize=50');
  state.items = data.items || [];
  state.currentIndex = 0;

  if (!state.items.length) {
    carouselEl.innerHTML = '<div class="empty-block post-carousel-empty">暂时还没有内容，稍后再来看看。</div>';
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
  showToast(error.message || '页面加载失败');
  carouselEl.innerHTML = '<div class="empty-block post-carousel-empty">页面加载失败，请稍后重试。</div>';
});
