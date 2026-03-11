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

  postDetailEl.innerHTML = `
    <header>
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <div class="post-meta">
        <span>${escapeHtml(formatDate(post.publishedAt || post.createdAt))}</span>
        <span>${renderTags(post.tags || [])}</span>
      </div>
    </header>
    ${post.coverImage?.url ? `<img class="post-cover" data-preview-src="${escapeHtml(post.coverImage.url)}" src="${escapeHtml(post.coverImage.url)}" alt="${escapeHtml(post.title)}" />` : ''}
    <section class="post-body">${renderMarkdownBasic(post.contentMd || '')}</section>
    ${(post.images || []).length ? `<section class="post-detail-images">${post.images
      .map((image) => `<img data-preview-src="${escapeHtml(image.url)}" src="${escapeHtml(image.url)}" alt="帖子图片" />`)
      .join('')}</section>` : ''}
  `;

  bindImagePreview();
  document.title = `${post.title} | 个人主页`;

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
    <h2 style="margin:8px 0 0">更多内容</h2>
    ${items
      .map(
        (item) => `
      <article class="post-card" data-post-id="${item.id}">
        <h3 class="post-title">${escapeHtml(item.title)}</h3>
        <p class="post-summary">${escapeHtml(item.summary || '继续阅读更多内容。')}</p>
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
    postDetailEl.innerHTML = '<div class="empty-block">缺少帖子参数。</div>';
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
  showToast(error.message || '加载失败');
  postDetailEl.innerHTML = '<div class="empty-block">内容加载失败，请稍后再试。</div>';
});
