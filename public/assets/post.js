import { apiFetch, escapeHtml, formatDate, queryParam, showToast } from './common.js';

const postDetailEl = document.getElementById('post-detail');
const recommendListEl = document.getElementById('recommend-list');
const viewerEl = document.getElementById('image-viewer');
const viewerImageEl = document.getElementById('viewer-image');

const galleryState = {
  items: [],
  currentIndex: 0,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDown: false,
  pointerId: null,
  suppressClickUntil: 0,
  galleryEl: null,
  countEl: null,
  prevBtnEl: null,
  nextBtnEl: null,
};

function renderTags(tags = []) {
  return tags.map((tag) => `<span class="tag-chip">#${escapeHtml(tag.name)}</span>`).join('');
}

function getPostImages(post) {
  const items = [];
  const seen = new Set();

  function pushImage(image) {
    if (!image?.url) return;
    const key = image.id || image.url;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(image);
  }

  pushImage(post.coverImage);
  for (const image of post.images || []) {
    pushImage(image);
  }

  return items;
}

function renderGalleryCard(image, index, title) {
  const alt = `${title || '\u5e16\u5b50\u56fe\u7247'} - \u7b2c${index + 1}\u5f20\u56fe\u7247`;
  return `
    <button class="detail-gallery-card" type="button" data-index="${index}" data-preview-src="${escapeHtml(image.url)}" aria-label="${escapeHtml(alt)}">
      <span class="detail-gallery-media">
        <img src="${escapeHtml(image.url)}" alt="${escapeHtml(alt)}" loading="lazy" />
      </span>
    </button>
  `;
}

function renderGallerySection(images, title) {
  if (!images.length) return '';

  return `
    <section class="post-gallery-section">
      <div class="post-gallery-head">
        <span class="post-gallery-label">\u5f71\u50cf\u8bb0\u5f55</span>
        <span class="post-gallery-count" id="post-gallery-count">1 / ${images.length}</span>
      </div>
      <div class="post-gallery-wrap">
        <button class="detail-gallery-btn prev hidden" id="post-gallery-prev" type="button" aria-label="\u4e0a\u4e00\u5f20">
          <svg class="detail-gallery-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 5.5 8 12l6.5 6.5" />
            <path d="M8.5 12H16" />
          </svg>
        </button>
        <div class="post-gallery" id="post-gallery" aria-label="\u5e16\u5b50\u56fe\u7247\u8f6e\u64ad">
          ${images.map((image, index) => renderGalleryCard(image, index, title)).join('')}
        </div>
        <button class="detail-gallery-btn next hidden" id="post-gallery-next" type="button" aria-label="\u4e0b\u4e00\u5f20">
          <svg class="detail-gallery-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 5.5 16 12l-6.5 6.5" />
            <path d="M8 12h7.5" />
          </svg>
        </button>
      </div>
    </section>
  `;
}

function openPreview(src) {
  if (!src) return;
  viewerImageEl.src = src;
  if (!viewerEl.open) {
    viewerEl.showModal();
  }
}

function getLoopOffset(index, activeIndex, count) {
  const forward = (index - activeIndex + count) % count;
  const backward = forward - count;
  return Math.abs(forward) <= Math.abs(backward) ? forward : backward;
}

function getGalleryMetrics() {
  if (window.innerWidth >= 1180) {
    return { xStep: 174, yStep: 18, scaleStep: 0.08, rotateStep: 3.8 };
  }

  if (window.innerWidth >= 840) {
    return { xStep: 146, yStep: 16, scaleStep: 0.08, rotateStep: 3.4 };
  }

  return { xStep: 78, yStep: 12, scaleStep: 0.08, rotateStep: 2.6 };
}

function updateGallery() {
  const { galleryEl, countEl, prevBtnEl, nextBtnEl } = galleryState;
  if (!galleryEl) return;

  const cards = [...galleryEl.querySelectorAll('.detail-gallery-card')];
  if (!cards.length) {
    prevBtnEl?.classList.add('hidden');
    nextBtnEl?.classList.add('hidden');
    if (countEl) countEl.textContent = '0 / 0';
    return;
  }

  const metrics = getGalleryMetrics();

  for (const card of cards) {
    const index = Number(card.dataset.index);
    const offset = getLoopOffset(index, galleryState.currentIndex, cards.length);
    const absOffset = Math.abs(offset);

    card.classList.remove('is-active', 'is-left', 'is-right', 'is-neighbor', 'gallery-hidden');

    if (absOffset > 2) {
      card.classList.add('gallery-hidden');
      card.tabIndex = -1;
      card.setAttribute('aria-hidden', 'true');
      continue;
    }

    const direction = offset === 0 ? 0 : offset > 0 ? 1 : -1;
    const signedAbs = direction * absOffset;
    const scale = Math.max(0.78, 1 - absOffset * metrics.scaleStep);
    const opacity = absOffset === 0 ? 1 : absOffset === 1 ? 0.74 : 0.44;
    const y = absOffset * metrics.yStep;
    const x = signedAbs * metrics.xStep;
    const rotate = signedAbs * metrics.rotateStep;

    card.style.setProperty('--gallery-x', `${x}px`);
    card.style.setProperty('--gallery-y', `${y}px`);
    card.style.setProperty('--gallery-scale', scale.toFixed(3));
    card.style.setProperty('--gallery-rotate', `${rotate.toFixed(2)}deg`);
    card.style.setProperty('--gallery-opacity', opacity.toString());
    card.style.zIndex = String(30 - absOffset);
    card.classList.toggle('is-active', absOffset === 0);
    card.classList.toggle('is-left', direction < 0 && absOffset > 0);
    card.classList.toggle('is-right', direction > 0 && absOffset > 0);
    card.classList.toggle('is-neighbor', absOffset === 1);
    card.tabIndex = absOffset === 0 ? 0 : -1;
    card.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
  }

  if (countEl) {
    countEl.textContent = `${galleryState.currentIndex + 1} / ${cards.length}`;
  }

  if (cards.length <= 1) {
    prevBtnEl?.classList.add('hidden');
    nextBtnEl?.classList.add('hidden');
    return;
  }

  prevBtnEl?.classList.remove('hidden');
  nextBtnEl?.classList.remove('hidden');
}

function goToGalleryIndex(nextIndex) {
  const total = galleryState.items.length;
  if (!total) return;

  const normalized = ((nextIndex % total) + total) % total;
  if (normalized === galleryState.currentIndex) return;

  galleryState.currentIndex = normalized;
  updateGallery();
}

function goToNextImage() {
  goToGalleryIndex(galleryState.currentIndex + 1);
}

function goToPrevImage() {
  goToGalleryIndex(galleryState.currentIndex - 1);
}

function resolveGalleryCard(event) {
  const directCard = event.target.closest?.('.detail-gallery-card');
  if (directCard) return directCard;

  if (typeof document.elementsFromPoint !== 'function') return null;

  const stack = document.elementsFromPoint(event.clientX, event.clientY);
  return stack.find((element) => element.classList?.contains('detail-gallery-card')) || null;
}

function classifyGalleryImage(image) {
  const width = image.naturalWidth || 0;
  const height = image.naturalHeight || 0;
  if (!width || !height) return;

  let orientation = 'square';
  if (width > height * 1.08) {
    orientation = 'landscape';
  } else if (height > width * 1.08) {
    orientation = 'portrait';
  }

  image.dataset.orientation = orientation;
}

function syncGalleryImageOrientation() {
  if (!galleryState.galleryEl) return;

  const images = galleryState.galleryEl.querySelectorAll('.detail-gallery-media img');
  for (const image of images) {
    if (image.complete) {
      classifyGalleryImage(image);
      continue;
    }

    image.addEventListener('load', () => classifyGalleryImage(image), { once: true });
  }
}

function bindGalleryInteractions() {
  const { galleryEl, prevBtnEl, nextBtnEl } = galleryState;
  if (!galleryEl || !prevBtnEl || !nextBtnEl) return;

  prevBtnEl.addEventListener('click', (event) => {
    event.stopPropagation();
    goToPrevImage();
  });

  nextBtnEl.addEventListener('click', (event) => {
    event.stopPropagation();
    goToNextImage();
  });

  galleryEl.tabIndex = 0;

  galleryEl.addEventListener('click', (event) => {
    if (Date.now() < galleryState.suppressClickUntil) return;

    const card = resolveGalleryCard(event);
    if (!card) return;

    const index = Number(card.dataset.index);
    if (!Number.isFinite(index)) return;

    if (index !== galleryState.currentIndex) {
      goToGalleryIndex(index);
      return;
    }

    openPreview(card.dataset.previewSrc);
  });

  galleryEl.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPrevImage();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToNextImage();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const activeCard = galleryEl.querySelector('.detail-gallery-card.is-active');
      if (!activeCard) return;
      openPreview(activeCard.dataset.previewSrc);
    }
  });

  galleryEl.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    galleryState.pointerDown = true;
    galleryState.pointerId = event.pointerId;
    galleryState.pointerStartX = event.clientX;
    galleryState.pointerStartY = event.clientY;

    if (galleryEl.setPointerCapture) {
      galleryEl.setPointerCapture(event.pointerId);
    }
  });

  galleryEl.addEventListener('pointerup', (event) => {
    if (!galleryState.pointerDown || event.pointerId !== galleryState.pointerId) return;

    const dx = event.clientX - galleryState.pointerStartX;
    const dy = event.clientY - galleryState.pointerStartY;

    galleryState.pointerDown = false;
    galleryState.pointerId = null;

    if (galleryEl.hasPointerCapture?.(event.pointerId)) {
      galleryEl.releasePointerCapture(event.pointerId);
    }

    if (Math.abs(dx) < 36 || Math.abs(dx) <= Math.abs(dy)) return;

    galleryState.suppressClickUntil = Date.now() + 280;

    if (dx < 0) {
      goToNextImage();
      return;
    }

    goToPrevImage();
  });

  galleryEl.addEventListener('pointercancel', (event) => {
    if (!galleryState.pointerDown || event.pointerId !== galleryState.pointerId) return;

    galleryState.pointerDown = false;
    galleryState.pointerId = null;

    if (galleryEl.hasPointerCapture?.(event.pointerId)) {
      galleryEl.releasePointerCapture(event.pointerId);
    }
  });

  window.addEventListener('resize', updateGallery);
}

function initGallery(images) {
  galleryState.items = images;
  galleryState.currentIndex = 0;
  galleryState.galleryEl = document.getElementById('post-gallery');
  galleryState.countEl = document.getElementById('post-gallery-count');
  galleryState.prevBtnEl = document.getElementById('post-gallery-prev');
  galleryState.nextBtnEl = document.getElementById('post-gallery-next');

  if (!galleryState.galleryEl) return;

  bindGalleryInteractions();
  syncGalleryImageOrientation();
  updateGallery();
}

async function loadPost(postId) {
  const post = await apiFetch(`/posts/${encodeURIComponent(postId)}`);
  const images = getPostImages(post);
  
  const dateLabel = formatDate(post.publishedAt || post.createdAt);

  postDetailEl.innerHTML = `
    <header class="post-detail-header">
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <time class="post-detail-date" datetime="${escapeHtml(post.publishedAt || post.createdAt || '')}">${escapeHtml(dateLabel)}</time>
    </header>
    
    ${post.tags?.length ? `<div class="post-detail-tags">${renderTags(post.tags)}</div>` : ''}
    ${renderGallerySection(images, post.title)}
  `;

  initGallery(images);
  document.title = `${post.title} | \u4e2a\u4eba\u4e3b\u9875`;

  return post;
}

async function loadRecommendations(currentId) {
  const data = await apiFetch('/posts?page=1&pageSize=3');
  const items = (data.items || []).filter((item) => item.id !== currentId).slice(0, 2);

  if (!items.length) {
    recommendListEl.innerHTML = '';
    return;
  }

  recommendListEl.innerHTML = `
    <h2 style="margin:8px 0 0">\u66f4\u591a\u5185\u5bb9</h2>
    ${items
      .map(
        (item) => `
      <article class="post-card" data-post-id="${item.id}">
        <h3 class="post-title">${escapeHtml(item.title)}</h3>
        <div class="post-meta"><span>${escapeHtml(formatDate(item.publishedAt))}</span></div>
      </article>
    `
      )
      .join('')}
  `;

  for (const card of recommendListEl.querySelectorAll('.post-card')) {
    card.addEventListener('click', () => {
      const id = card.dataset.postId;
      if (!id) return;
      window.location.href = `/post.html?postId=${encodeURIComponent(id)}`;
    });
  }
}

async function boot() {
  const postId = queryParam('postId');
  if (!postId) {
    postDetailEl.innerHTML = '<div class="empty-block">\u7f3a\u5c11\u5e16\u5b50\u53c2\u6570\u3002</div>';
    return;
  }

  await loadPost(postId);
  await loadRecommendations(postId);

  viewerEl.addEventListener('click', (event) => {
    if (event.target === viewerEl) {
      viewerEl.close();
    }
  });
}

boot().catch((error) => {
  console.error(error);
  showToast(error.message || '\u52a0\u8f7d\u5931\u8d25');
  postDetailEl.innerHTML = '<div class="empty-block">\u5185\u5bb9\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002</div>';
});
