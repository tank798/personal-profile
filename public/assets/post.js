import { apiFetch, escapeHtml, formatDate, queryParam, showToast } from './common.js';

const postDetailEl = document.getElementById('post-detail');
const recommendListEl = document.getElementById('recommend-list');
const viewerEl = document.getElementById('image-viewer');
const viewerImageEl = document.getElementById('viewer-image');
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
const VISIBLE_GALLERY_IMAGE_DISTANCE = 2;
const DECODED_GALLERY_IMAGE_DISTANCE = 1;
const GALLERY_IMAGE_READY_TIMEOUT_MS = 1800;

const galleryState = {
  items: [],
  currentIndex: 0,
  pointerStartX: 0,
  pointerStartY: 0,
  touchStartX: 0,
  touchStartY: 0,
  pointerDown: false,
  pointerId: null,
  suppressClickUntil: 0,
  galleryEl: null,
  countEl: null,
  prevBtnEl: null,
  nextBtnEl: null,
  navigating: false,
  queuedIndex: null,
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
  const src = escapeHtml(image.url);
  return `
    <button class="detail-gallery-card" type="button" data-index="${index}" data-preview-src="${src}" aria-label="${escapeHtml(alt)}">
      <span class="detail-gallery-media">
        <span class="detail-gallery-stage">
          <img class="detail-gallery-photo" src="${TRANSPARENT_PIXEL}" data-src="${src}" data-loaded="false" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />
        </span>
      </span>
    </button>
  `;
}

function renderGallerySection(images, title) {
  if (!images.length) return '';

  const meta = images.length > 1
    ? `
      <div class="post-gallery-meta">
        <span class="post-gallery-count" id="post-gallery-count">1 / ${images.length}</span>
      </div>
    `
    : '';

  return `
    <section class="post-gallery-section">
      ${meta}
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
    return { xStep: 232, yStep: 16, scaleStep: 0.08, rotateStep: 3.2 };
  }

  if (window.innerWidth >= 840) {
    return { xStep: 194, yStep: 14, scaleStep: 0.08, rotateStep: 2.9 };
  }

  return { xStep: 104, yStep: 10, scaleStep: 0.08, rotateStep: 2.1 };
}

function bindGalleryPhotoMeasurement(image) {
  if (!image || image.dataset.measureBound === 'true') return;

  if (image.complete && image.naturalWidth) {
    classifyGalleryImage(image);
    return;
  }

  image.dataset.measureBound = 'true';
  image.addEventListener(
    'load',
    () => {
      image.dataset.measureBound = 'done';
      classifyGalleryImage(image);
      updateGallery();
    },
    { once: true }
  );
}

function waitForGalleryImageReady(image, timeoutMs = GALLERY_IMAGE_READY_TIMEOUT_MS) {
  if (!image) {
    return Promise.resolve();
  }

  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timerId);
      image.removeEventListener('load', finish);
      image.removeEventListener('error', finish);
      resolve();
    };

    const timerId = window.setTimeout(finish, timeoutMs);
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
  });
}

async function decodeGalleryImage(image) {
  await waitForGalleryImageReady(image);

  if (!image || image.dataset.decoded === 'true' || !image.naturalWidth) {
    return;
  }

  if (typeof image.decode === 'function') {
    try {
      await image.decode();
    } catch {
      // Fall back to the loaded image when decode is unavailable or interrupted.
    }
  }

  image.dataset.decoded = 'true';
}

function startGalleryImageLoad(image, absOffset) {
  if (!image) {
    return;
  }

  const nextSrc = image.dataset.src;
  if (!nextSrc) {
    return;
  }

  image.loading = absOffset === 0 ? 'eager' : 'lazy';
  image.setAttribute('fetchpriority', absOffset <= 1 ? 'high' : 'low');

  if (image.dataset.loaded !== 'true') {
    image.src = nextSrc;
    image.dataset.loaded = 'true';
  }

  bindGalleryPhotoMeasurement(image);
}

function releaseGalleryImage(image) {
  if (!image) {
    return;
  }

  if (image.src === TRANSPARENT_PIXEL && image.dataset.loaded !== 'true') {
    return;
  }
  image.src = TRANSPARENT_PIXEL;
  image.dataset.loaded = 'false';
  image.dataset.decoded = 'false';
  image.loading = 'lazy';
  image.removeAttribute('fetchpriority');
}

function releaseGalleryCard(card) {
  const photo = card?.querySelector('.detail-gallery-photo');
  releaseGalleryImage(photo);
}

function primeGalleryCard(card, absOffset, options = {}) {
  if (absOffset > VISIBLE_GALLERY_IMAGE_DISTANCE) {
    return Promise.resolve();
  }

  const { decode = false } = options;
  const photo = card?.querySelector('.detail-gallery-photo');
  if (!photo) {
    return Promise.resolve();
  }

  startGalleryImageLoad(photo, absOffset);
  if (!decode) {
    return Promise.resolve();
  }

  return decodeGalleryImage(photo);
}

async function prepareGalleryIndex(nextIndex) {
  const { galleryEl } = galleryState;
  if (!galleryEl) {
    return;
  }

  const cards = [...galleryEl.querySelectorAll('.detail-gallery-card')];
  if (!cards.length) {
    return;
  }

  const targetCard = cards.find((card) => Number(card.dataset.index) === nextIndex);
  if (!targetCard) {
    return;
  }

  await primeGalleryCard(targetCard, 0, { decode: true });

  const total = cards.length;
  const neighborIndexes = [
    (nextIndex + 1) % total,
    (nextIndex - 1 + total) % total,
  ];

  for (const index of neighborIndexes) {
    const neighborCard = cards.find((card) => Number(card.dataset.index) === index);
    if (neighborCard) {
      void primeGalleryCard(neighborCard, 1, { decode: true });
    }
  }
}

function updateGallery() {
  const { galleryEl, countEl, prevBtnEl, nextBtnEl } = galleryState;
  if (!galleryEl) return;

  const cards = [...galleryEl.querySelectorAll('.detail-gallery-card')];
  if (!cards.length) {
    delete galleryEl.dataset.activeOrientation;
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

    if (absOffset > VISIBLE_GALLERY_IMAGE_DISTANCE) {
      releaseGalleryCard(card);
      card.classList.add('gallery-hidden');
      card.tabIndex = -1;
      card.setAttribute('aria-hidden', 'true');
      continue;
    }

    const direction = offset === 0 ? 0 : offset > 0 ? 1 : -1;
    const signedAbs = direction * absOffset;
    const scale = Math.max(0.78, 1 - absOffset * metrics.scaleStep);
    const opacity = absOffset === 0 ? 1 : absOffset === 1 ? 0.54 : 0.18;
    const y = absOffset * metrics.yStep;
    const x = signedAbs * metrics.xStep;
    const rotate = signedAbs * metrics.rotateStep;
    void primeGalleryCard(card, absOffset, { decode: absOffset <= DECODED_GALLERY_IMAGE_DISTANCE });

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

  const activeCard = cards.find((card) => card.classList.contains('is-active')) || cards[galleryState.currentIndex] || null;
  const activeOrientation = activeCard?.dataset?.orientation;
  if (activeOrientation) {
    galleryEl.dataset.activeOrientation = activeOrientation;
  } else {
    delete galleryEl.dataset.activeOrientation;
  }

  syncGalleryMediaFit(cards);

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

async function goToGalleryIndex(nextIndex) {
  const total = galleryState.items.length;
  if (!total) return;

  const normalized = ((nextIndex % total) + total) % total;
  if (normalized === galleryState.currentIndex) return;

  if (galleryState.navigating) {
    galleryState.queuedIndex = normalized;
    return;
  }

  galleryState.navigating = true;

  try {
    await prepareGalleryIndex(normalized);
    galleryState.currentIndex = normalized;
    updateGallery();
  } finally {
    galleryState.navigating = false;

    if (galleryState.queuedIndex != null && galleryState.queuedIndex !== galleryState.currentIndex) {
      const queuedIndex = galleryState.queuedIndex;
      galleryState.queuedIndex = null;
      void goToGalleryIndex(queuedIndex);
      return;
    }

    galleryState.queuedIndex = null;
  }
}

function goToNextImage() {
  void goToGalleryIndex(galleryState.currentIndex + 1);
}

function goToPrevImage() {
  void goToGalleryIndex(galleryState.currentIndex - 1);
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

  const ratio = width / height;
  image.dataset.orientation = orientation;
  image.dataset.ratio = ratio.toFixed(4);

  const card = image.closest('.detail-gallery-card');
  if (card) {
    card.setAttribute('data-orientation', orientation);
    card.dataset.ratio = ratio.toFixed(4);
  }
}

function syncCardMediaFit(card) {
  if (!card) return;

  const ratio = Number(card.dataset.ratio || card.style.getPropertyValue('--image-ratio'));
  const media = card.querySelector('.detail-gallery-media');
  if (!media || !Number.isFinite(ratio) || ratio <= 0) {
    card.style.removeProperty('--media-fit-width');
    card.style.removeProperty('--media-fit-height');
    return;
  }

  const mediaStyles = window.getComputedStyle(media);
  const paddingX = parseFloat(mediaStyles.paddingLeft || '0') + parseFloat(mediaStyles.paddingRight || '0');
  const paddingY = parseFloat(mediaStyles.paddingTop || '0') + parseFloat(mediaStyles.paddingBottom || '0');
  const availableWidth = Math.max(0, media.clientWidth - paddingX);
  const availableHeight = Math.max(0, media.clientHeight - paddingY);

  if (!availableWidth || !availableHeight) return;

  let fitWidth = availableWidth;
  let fitHeight = fitWidth / ratio;

  if (fitHeight > availableHeight) {
    fitHeight = availableHeight;
    fitWidth = fitHeight * ratio;
  }

  card.style.setProperty('--image-ratio', ratio.toFixed(4));
  card.style.setProperty('--media-fit-width', `${Math.round(fitWidth)}px`);
  card.style.setProperty('--media-fit-height', `${Math.round(fitHeight)}px`);
}

function syncGalleryMediaFit(cards) {
  for (const card of cards) {
    syncCardMediaFit(card);
  }
}

function syncGalleryImageOrientation() {
  if (!galleryState.galleryEl) return;

  const images = galleryState.galleryEl.querySelectorAll('.detail-gallery-photo');
  for (const image of images) {
    if (image.complete && image.naturalWidth) {
      classifyGalleryImage(image);
    }
  }

  updateGallery();
}

function bindGalleryInteractions() {
  const { galleryEl, prevBtnEl, nextBtnEl } = galleryState;
  if (!galleryEl || !prevBtnEl || !nextBtnEl) return;

  prevBtnEl.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    goToPrevImage();
  });

  nextBtnEl.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    goToNextImage();
  });

  galleryEl.tabIndex = 0;

  const resetTouchTrack = () => {
    galleryState.touchStartX = 0;
    galleryState.touchStartY = 0;
  };

  galleryEl.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    if (!touch) return;

    galleryState.touchStartX = touch.clientX;
    galleryState.touchStartY = touch.clientY;
  }, { passive: true });

  galleryEl.addEventListener('touchmove', (event) => {
    const touch = event.touches[0];
    if (!touch) return;

    const dx = touch.clientX - galleryState.touchStartX;
    const dy = touch.clientY - galleryState.touchStartY;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      event.preventDefault();
    }
  }, { passive: false });

  galleryEl.addEventListener('touchend', resetTouchTrack);
  galleryEl.addEventListener('touchcancel', resetTouchTrack);

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
  const data = await apiFetch('/posts?page=1&pageSize=7');
  const items = (data.items || []).filter((item) => item.id !== currentId).slice(0, 6);

  if (!items.length) {
    recommendListEl.innerHTML = '';
    return;
  }

  recommendListEl.innerHTML = `
    <div class="recommend-header">
      <h2 class="recommend-title">\u66f4\u591a\u5185\u5bb9</h2>
    </div>
    <div class="recommend-grid">
      ${items
        .map((item) => {
          const title = escapeHtml(item.title);
          const imageUrl = item.coverImage?.url ? escapeHtml(item.coverImage.url) : '';
          const dateText = item.publishedAt ? escapeHtml(formatDate(item.publishedAt)) : '';

          return `
            <button class="recommend-card" type="button" data-post-id="${item.id}" aria-label="\u67E5\u770B\u300A${title}\u300B">
              <div class="recommend-card-media ${imageUrl ? '' : 'is-placeholder'}">
                ${
                  imageUrl
                    ? `<img src="${imageUrl}" alt="${title}" loading="lazy" />`
                    : '<span>\u7EE7\u7EED\u770B\u770B</span>'
                }
              </div>
              <div class="recommend-card-body">
                <h3 class="recommend-card-title">${title}</h3>
                ${dateText ? `<p class="recommend-card-date">${dateText}</p>` : ''}
              </div>
            </button>
          `;
        })
        .join('')}
    </div>
  `;

  for (const card of recommendListEl.querySelectorAll('.recommend-card')) {
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
