import { apiFetch, escapeHtml, formatDate, setQueryParam, showToast } from './common.js';

const state = {
  page: 1,
  pageSize: 10,
  total: 0,
  tag: '',
};

const profileNameEl = document.getElementById('profile-name');
const profileBioEl = document.getElementById('profile-bio');
const profileSubtitleEl = document.getElementById('profile-subtitle');
const avatarWrapEl = document.getElementById('avatar-wrap');
const feedEl = document.getElementById('post-feed');
const tagsScrollEl = document.getElementById('tags-scroll');
const loadMoreEl = document.getElementById('load-more');
const aboutDrawerEl = document.getElementById('about-drawer');
const aboutTextEl = document.getElementById('about-text');
const aboutOpenEl = document.getElementById('about-open');
const aboutCloseEl = document.getElementById('about-close');

function renderAvatar(url, name) {
  if (url) {
    avatarWrapEl.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />`;
    return;
  }

  const fallback = (name || '我').slice(0, 1);
  avatarWrapEl.innerHTML = `<div class="avatar-fallback">${escapeHtml(fallback)}</div>`;
}

function renderTags(tags = []) {
  const items = [{ id: '', name: '全部', slug: '' }, ...tags];
  tagsScrollEl.innerHTML = items
    .map((tag) => {
      const active = state.tag === tag.slug ? 'active' : '';
      return `<button class="tag-chip ${active}" type="button" data-tag="${escapeHtml(tag.slug)}">${escapeHtml(tag.name)}</button>`;
    })
    .join('');

  for (const button of tagsScrollEl.querySelectorAll('.tag-chip')) {
    button.addEventListener('click', () => {
      state.tag = button.dataset.tag || '';
      state.page = 1;
      setQueryParam('tag', state.tag || null);
      renderTags(tags);
      loadPosts(false).catch((error) => showToast(error.message));
    });
  }
}

function renderPostCard(post) {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  return `
    <article class="post-card" data-post-id="${post.id}">
      ${post.coverImage?.url ? `<img class="post-cover" src="${escapeHtml(post.coverImage.url)}" alt="${escapeHtml(post.title)}" />` : ''}
      <h2 class="post-title">${escapeHtml(post.title)}</h2>
      <p class="post-summary">${escapeHtml(post.summary || '点击进入查看完整内容。')}</p>
      <div class="post-meta">
        <span>${escapeHtml(formatDate(post.publishedAt))}</span>
        <span>${tags.slice(0, 3).map((t) => `#${t.name}`).join(' ')}</span>
      </div>
    </article>
  `;
}

function bindPostEvents() {
  for (const card of feedEl.querySelectorAll('.post-card')) {
    card.addEventListener('click', () => {
      const postId = card.dataset.postId;
      if (!postId) return;
      window.location.href = `/post.html?postId=${encodeURIComponent(postId)}`;
    });
  }
}

async function loadProfile() {
  const profile = await apiFetch('/profile');
  profileNameEl.textContent = profile.displayName || '我的主页';
  profileBioEl.textContent = profile.bio || '在这里记录生活、思考和灵感。';
  profileSubtitleEl.textContent = profile.site?.subtitle || '';
  aboutTextEl.textContent = profile.site?.aboutMd || '暂无介绍。';
  renderAvatar(profile.avatarUrl, profile.displayName);
  document.title = profile.site?.title || profile.displayName || '个人主页';
}

async function loadTags() {
  const data = await apiFetch('/tags');
  renderTags(data.items || []);
}

async function loadPosts(append) {
  if (!append) {
    feedEl.innerHTML = '<div class="loading-block">内容加载中...</div>';
  }

  const query = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
  });
  if (state.tag) {
    query.set('tag', state.tag);
  }

  const data = await apiFetch(`/posts?${query.toString()}`);
  state.total = data.total || 0;

  const listHtml = (data.items || []).map(renderPostCard).join('');

  if (!append) {
    feedEl.innerHTML = listHtml || '<div class="empty-block">暂时还没有内容，稍后再来看看。</div>';
  } else {
    feedEl.insertAdjacentHTML('beforeend', listHtml);
  }

  bindPostEvents();

  const rendered = feedEl.querySelectorAll('.post-card').length;
  const hasMore = rendered < state.total;
  loadMoreEl.classList.toggle('hidden', !hasMore);
}

function wireDrawer() {
  aboutOpenEl.addEventListener('click', () => {
    aboutDrawerEl.showModal();
  });
  aboutCloseEl.addEventListener('click', () => aboutDrawerEl.close());
  aboutDrawerEl.addEventListener('click', (event) => {
    const rect = aboutDrawerEl.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) {
      aboutDrawerEl.close();
    }
  });
}

async function boot() {
  const initialTag = new URLSearchParams(window.location.search).get('tag');
  if (initialTag) {
    state.tag = initialTag;
  }

  wireDrawer();
  loadMoreEl.addEventListener('click', async () => {
    state.page += 1;
    await loadPosts(true);
  });

  await Promise.all([loadProfile(), loadTags()]);
  await loadPosts(false);
}

boot().catch((error) => {
  console.error(error);
  showToast(error.message || '页面加载失败');
  feedEl.innerHTML = '<div class="empty-block">页面加载失败，请稍后重试。</div>';
});
