import { apiFetch, escapeHtml, showToast } from './common.js';

const state = {
  items: [],
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

  const fallback = (name || '我').slice(0, 1);
  avatarWrapEl.innerHTML = `<div class="avatar-fallback">${escapeHtml(fallback)}</div>`;
}

function renderPostCard(post) {
  const cover = post.coverImage?.url
    ? `<img class="post-cover" src="${escapeHtml(post.coverImage.url)}" alt="${escapeHtml(post.title)}" />`
    : '<div class="post-cover cover-placeholder">内容预览</div>';

  return `
    <article class="post-card carousel-card" data-post-id="${post.id}" role="button" tabindex="0">
      ${cover}
      <div class="carousel-title-wrap">
        <h3 class="post-title">${escapeHtml(post.title)}</h3>
      </div>
    </article>
  `;
}

function bindPostEvents() {
  for (const card of carouselEl.querySelectorAll('.carousel-card')) {
    const navigate = () => {
      const postId = card.dataset.postId;
      if (!postId) return;
      window.location.href = `/post.html?postId=${encodeURIComponent(postId)}`;
    };

    card.addEventListener('click', navigate);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigate();
      }
    });
  }
}

function updateCarouselButtons() {
  if (!state.items.length) {
    prevBtnEl.classList.add('hidden');
    nextBtnEl.classList.add('hidden');
    return;
  }

  const isScrollable = carouselEl.scrollWidth > carouselEl.clientWidth + 4;
  if (!isScrollable) {
    prevBtnEl.classList.add('hidden');
    nextBtnEl.classList.add('hidden');
    return;
  }

  prevBtnEl.classList.remove('hidden');
  nextBtnEl.classList.remove('hidden');

  const left = Math.round(carouselEl.scrollLeft);
  const maxLeft = Math.round(carouselEl.scrollWidth - carouselEl.clientWidth);

  prevBtnEl.disabled = left <= 2;
  nextBtnEl.disabled = left >= maxLeft - 2;
}

function setupCarouselControls() {
  const scrollByPage = (direction) => {
    const amount = carouselEl.clientWidth * 0.86;
    carouselEl.scrollBy({ left: amount * direction, behavior: 'smooth' });
  };

  prevBtnEl.addEventListener('click', () => scrollByPage(-1));
  nextBtnEl.addEventListener('click', () => scrollByPage(1));

  carouselEl.addEventListener('scroll', () => {
    window.requestAnimationFrame(updateCarouselButtons);
  });

  window.addEventListener('resize', updateCarouselButtons);
}

async function loadProfile() {
  const profile = await apiFetch('/profile');
  profileNameEl.textContent = profile.displayName || '我的主页';
  profileAboutEl.textContent = profile.site?.aboutMd || '欢迎来到我的个人内容空间，这里会持续更新我的实习、科研和兴趣探索。';
  renderAvatar(profile.avatarUrl, profile.displayName);
  document.title = profile.site?.title || profile.displayName || '个人主页';
}

async function loadPosts() {
  carouselEl.innerHTML = '<div class="loading-block">内容加载中...</div>';

  const data = await apiFetch('/posts?page=1&pageSize=50');
  state.items = data.items || [];

  if (!state.items.length) {
    carouselEl.innerHTML = '<div class="empty-block post-carousel-empty">暂时还没有内容，稍后再来看看。</div>';
    updateCarouselButtons();
    return;
  }

  carouselEl.innerHTML = state.items.map(renderPostCard).join('');
  bindPostEvents();
  updateCarouselButtons();
}

async function boot() {
  setupCarouselControls();
  await Promise.all([loadProfile(), loadPosts()]);
}

boot().catch((error) => {
  console.error(error);
  showToast(error.message || '页面加载失败');
  carouselEl.innerHTML = '<div class="empty-block post-carousel-empty">页面加载失败，请稍后重试。</div>';
});
