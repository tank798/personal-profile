import { apiFetch, escapeHtml, formatDate, queryParam, renderMarkdownBasic, showToast } from './common.js';

const postDetailEl = document.getElementById('post-detail');
const recommendListEl = document.getElementById('recommend-list');
const viewerEl = document.getElementById('image-viewer');
const viewerImageEl = document.getElementById('viewer-image');

function renderTags(tags = []) {
  return tags.map((tag) => `<span class="tag-chip">#${escapeHtml(tag.name)}</span>`).join('');
}

function bindImagePreview() {
  const images = postDetailEl.querySelectorAll('[data-preview-src]');
  for (const image of images) {
    image.addEventListener('click', () => {
      const src = image.getAttribute('data-preview-src');
      if (!src) return;
      viewerImageEl.src = src;
      viewerEl.showModal();
    });
  }
}

async function loadPost(postId) {
  const post = await apiFetch(`/posts/${encodeURIComponent(postId)}`);
  const primaryImage = post.coverImage || (post.images || [])[0] || null;
  const galleryImages = (post.images || []).filter((image) => image?.id !== primaryImage?.id);

  postDetailEl.innerHTML = `
    <header>
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <div class="post-meta">
        <span>${escapeHtml(formatDate(post.publishedAt || post.createdAt))}</span>
        <span>${renderTags(post.tags || [])}</span>
      </div>
    </header>
    ${primaryImage?.url ? `<img class="post-cover" data-preview-src="${escapeHtml(primaryImage.url)}" src="${escapeHtml(primaryImage.url)}" alt="${escapeHtml(post.title)}" />` : ''}
    <section class="post-body">${renderMarkdownBasic(post.contentMd || '')}</section>
    ${galleryImages.length ? `<section class="post-detail-images">${galleryImages
      .map((image) => `<img data-preview-src="${escapeHtml(image.url)}" src="${escapeHtml(image.url)}" alt="\u5e16\u5b50\u56fe\u7247" />`)
      .join('')}</section>` : ''}
  `;

  bindImagePreview();
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
