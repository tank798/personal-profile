import {
  apiFetch,
  escapeHtml,
  formatDateTime,
  getImageDimensions,
  getToken,
  readFileAsDataUrl,
  setToken,
  showToast,
  slugify,
} from './common.js';

const LAST_LOGIN_EMAIL_KEY = 'homepage_last_login_email';
const DASHBOARD_INIT_RETRY = 3;

const loginWrapEl = document.getElementById('login-wrap');
const loginFormEl = document.getElementById('login-form');
const loginEmailEl = document.getElementById('login-email');
const loginPasswordEl = document.getElementById('login-password');

const adminShellEl = document.getElementById('admin-shell');
const adminTitleEl = document.getElementById('admin-title');
const logoutBtnEl = document.getElementById('logout-btn');

const profileFormEl = document.getElementById('profile-form');
const displayNameEl = document.getElementById('display-name');
const bioEl = document.getElementById('bio');
const avatarFileEl = document.getElementById('avatar-file');
const uploadAvatarBtnEl = document.getElementById('upload-avatar-btn');
const avatarMediaIdEl = document.getElementById('avatar-media-id');
const avatarPreviewEl = document.getElementById('avatar-preview');

const siteFormEl = document.getElementById('site-form');
const siteTitleEl = document.getElementById('site-title');
const siteSubtitleEl = document.getElementById('site-subtitle');
const siteAboutEl = document.getElementById('site-about');

const postFormEl = document.getElementById('post-form');
const editingPostIdEl = document.getElementById('editing-post-id');
const postTitleEl = document.getElementById('post-title');
const postSlugEl = document.getElementById('post-slug');
const postSummaryEl = document.getElementById('post-summary');
const postContentEl = document.getElementById('post-content');
const coverFileEl = document.getElementById('cover-file');
const uploadCoverBtnEl = document.getElementById('upload-cover-btn');
const coverMediaIdEl = document.getElementById('cover-media-id');
const coverPreviewEl = document.getElementById('cover-preview');
const postStatusEl = document.getElementById('post-status');
const postPinnedEl = document.getElementById('post-pinned');
const savePostBtnEl = document.getElementById('save-post-btn');
const resetPostBtnEl = document.getElementById('reset-post-btn');

const postListEl = document.getElementById('post-list');

const state = {
  posts: [],
};

function requireFile(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) {
    throw new Error('请先选择图片文件');
  }
  return file;
}

function showPreview(el, url) {
  if (!url) {
    el.classList.add('hidden');
    el.removeAttribute('src');
    return;
  }
  el.src = url;
  el.classList.remove('hidden');
}

function getLastLoginEmail() {
  return localStorage.getItem(LAST_LOGIN_EMAIL_KEY) || '';
}

function setLastLoginEmail(email) {
  if (!email) return;
  localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email.trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadMedia(file, purpose) {
  const upload = await apiFetch('/admin/media/upload-url', {
    method: 'POST',
    auth: true,
    body: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      purpose,
    },
  });

  let uploadedUrl;

  try {
    const putResp = await fetch(upload.uploadUrl, {
      method: upload.method || 'PUT',
      headers: upload.headers || {
        'content-type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!putResp.ok) {
      throw new Error(`上传失败(${putResp.status})`);
    }
  } catch {
    // Dev fallback: store as data URL when object storage is not configured.
    uploadedUrl = await readFileAsDataUrl(file);
    showToast('未检测到对象存储，已切换为本地演示上传模式');
  }

  const dimensions = file.type.startsWith('image/') ? await getImageDimensions(file) : {};

  const media = await apiFetch('/admin/media/complete', {
    method: 'POST',
    auth: true,
    body: {
      objectKey: upload.objectKey,
      url: uploadedUrl,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      width: dimensions.width,
      height: dimensions.height,
      purpose,
    },
  });

  return media;
}

function openDashboard() {
  loginWrapEl.classList.add('hidden');
  adminShellEl.classList.remove('hidden');
}

function openLogin() {
  adminShellEl.classList.add('hidden');
  loginWrapEl.classList.remove('hidden');

  const rememberedEmail = getLastLoginEmail();
  if (rememberedEmail && !loginEmailEl.value.trim()) {
    loginEmailEl.value = rememberedEmail;
  }
}

async function fetchMe() {
  const me = await apiFetch('/me', { auth: true });

  adminTitleEl.textContent = `${me.user.displayName || '我的'} · 内容管理`;

  displayNameEl.value = me.user.displayName || '';
  bioEl.value = me.user.bio || '';
  avatarMediaIdEl.value = me.user.avatarMediaId || '';
  showPreview(avatarPreviewEl, me.user.avatarUrl || '');

  siteTitleEl.value = me.site.title || '';
  siteSubtitleEl.value = me.site.subtitle || '';
  siteAboutEl.value = me.site.aboutMd || '';
}

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function renderPostList() {
  if (!state.posts.length) {
    postListEl.innerHTML = '<div class="empty-block">还没有帖子，先创建第一篇吧。</div>';
    return;
  }

  postListEl.innerHTML = state.posts
    .map(
      (post) => `
      <article class="admin-post-item" data-post-id="${post.id}">
        <div class="row-inline" style="justify-content:space-between">
          <p class="item-title">${escapeHtml(post.title)}</p>
          ${statusBadge(post.status)}
        </div>
        <p class="item-meta">更新时间：${escapeHtml(formatDateTime(post.updatedAt))}</p>
        <div class="item-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="edit">编辑</button>
          ${
            post.status === 'published'
              ? '<button class="btn btn-ghost btn-sm" type="button" data-action="unpublish">转草稿</button>'
              : '<button class="btn btn-primary btn-sm" type="button" data-action="publish">发布</button>'
          }
          <button class="btn btn-danger btn-sm" type="button" data-action="delete">删除</button>
        </div>
      </article>
    `
    )
    .join('');

  for (const card of postListEl.querySelectorAll('.admin-post-item')) {
    card.addEventListener('click', async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;

      const postId = card.dataset.postId;
      if (!postId) return;

      const post = state.posts.find((item) => item.id === postId);
      if (!post) return;

      try {
        if (action === 'edit') {
          fillPostForm(post);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        if (action === 'delete') {
          const ok = window.confirm(`确认删除《${post.title}》吗？`);
          if (!ok) return;
          await apiFetch(`/admin/posts/${postId}`, { method: 'DELETE', auth: true });
          showToast('已删除');
          await loadPosts();
          if (editingPostIdEl.value === postId) {
            resetPostForm();
          }
          return;
        }

        if (action === 'publish') {
          await apiFetch(`/admin/posts/${postId}/publish`, { method: 'POST', auth: true, body: {} });
          showToast('发布成功');
          await loadPosts();
          return;
        }

        if (action === 'unpublish') {
          await apiFetch(`/admin/posts/${postId}/unpublish`, { method: 'POST', auth: true, body: {} });
          showToast('已转为草稿');
          await loadPosts();
        }
      } catch (error) {
        showToast(error.message || '操作失败');
      }
    });
  }
}

async function loadPosts() {
  postListEl.innerHTML = '<div class="loading-block">加载中...</div>';
  const data = await apiFetch('/admin/posts?page=1&pageSize=50', { auth: true });
  state.posts = data.items || [];
  renderPostList();
}

function fillPostForm(post) {
  editingPostIdEl.value = post.id;
  postTitleEl.value = post.title || '';
  postSlugEl.value = post.slug || '';
  postSummaryEl.value = post.summary || '';
  postContentEl.value = post.contentMd || '';
  postStatusEl.value = post.status || 'draft';
  postPinnedEl.value = String(Boolean(post.isPinned));
  coverMediaIdEl.value = post.coverMediaId || '';
  showPreview(coverPreviewEl, post.coverImage?.url || '');
  savePostBtnEl.textContent = '更新帖子';
}

function resetPostForm() {
  editingPostIdEl.value = '';
  postFormEl.reset();
  postStatusEl.value = 'draft';
  postPinnedEl.value = 'false';
  coverMediaIdEl.value = '';
  showPreview(coverPreviewEl, '');
  savePostBtnEl.textContent = '保存帖子';
}

async function handleLogin(event) {
  event.preventDefault();
  const email = loginEmailEl.value.trim();
  const password = loginPasswordEl.value;

  const result = await apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  setToken(result.accessToken);
  setLastLoginEmail(email);
  loginPasswordEl.value = '';

  showToast('登录成功');
  await initializeDashboard();
}

async function initializeDashboard() {
  openDashboard();
  await fetchMe();
  await loadPosts();
}

async function initializeDashboardWithRetry() {
  for (let attempt = 1; attempt <= DASHBOARD_INIT_RETRY; attempt += 1) {
    try {
      await initializeDashboard();
      return true;
    } catch (error) {
      if (error?.status === 401) {
        setToken('');
        openLogin();
        showToast('登录状态失效，请重新登录');
        return false;
      }

      if (attempt < DASHBOARD_INIT_RETRY) {
        showToast(`服务正在唤醒，自动重试(${attempt}/${DASHBOARD_INIT_RETRY - 1})...`);
        await sleep(2500 * attempt);
        continue;
      }

      openLogin();
      showToast('服务响应较慢，请稍后再试');
      return false;
    }
  }

  return false;
}

async function handleProfileSubmit(event) {
  event.preventDefault();

  const payload = {
    displayName: displayNameEl.value.trim(),
    bio: bioEl.value.trim() || null,
    avatarMediaId: avatarMediaIdEl.value || null,
  };

  await apiFetch('/admin/profile', {
    method: 'PUT',
    auth: true,
    body: payload,
  });

  showToast('资料已保存');
}

async function handleSiteSubmit(event) {
  event.preventDefault();

  const payload = {
    title: siteTitleEl.value.trim(),
    subtitle: siteSubtitleEl.value.trim() || null,
    aboutMd: siteAboutEl.value.trim() || null,
  };

  await apiFetch('/admin/site', {
    method: 'PUT',
    auth: true,
    body: payload,
  });

  showToast('站点信息已保存');
}

async function handlePostSubmit(event) {
  event.preventDefault();

  const payload = {
    title: postTitleEl.value.trim(),
    slug: postSlugEl.value.trim(),
    summary: postSummaryEl.value.trim() || undefined,
    contentMd: postContentEl.value,
    coverMediaId: coverMediaIdEl.value || null,
    status: postStatusEl.value,
    isPinned: postPinnedEl.value === 'true',
  };

  const editingId = editingPostIdEl.value;

  if (editingId) {
    await apiFetch(`/admin/posts/${editingId}`, {
      method: 'PUT',
      auth: true,
      body: payload,
    });
    showToast('帖子已更新');
  } else {
    await apiFetch('/admin/posts', {
      method: 'POST',
      auth: true,
      body: payload,
    });
    showToast('帖子已创建');
  }

  resetPostForm();
  await loadPosts();
}

async function handleAvatarUpload() {
  const file = requireFile(avatarFileEl);
  const media = await uploadMedia(file, 'avatar');
  avatarMediaIdEl.value = media.id;
  showPreview(avatarPreviewEl, media.url);
  showToast('头像上传完成，请点击“保存资料”');
}

async function handleCoverUpload() {
  const file = requireFile(coverFileEl);
  const media = await uploadMedia(file, 'cover');
  coverMediaIdEl.value = media.id;
  showPreview(coverPreviewEl, media.url);
  showToast('封面上传完成，保存帖子后生效');
}

function wireEvents() {
  loginFormEl.addEventListener('submit', (event) => {
    handleLogin(event).catch((error) => showToast(error.message || '登录失败'));
  });

  logoutBtnEl.addEventListener('click', () => {
    setToken('');
    loginPasswordEl.value = '';
    openLogin();
    showToast('已退出');
  });

  profileFormEl.addEventListener('submit', (event) => {
    handleProfileSubmit(event).catch((error) => showToast(error.message || '保存失败'));
  });

  siteFormEl.addEventListener('submit', (event) => {
    handleSiteSubmit(event).catch((error) => showToast(error.message || '保存失败'));
  });

  postTitleEl.addEventListener('input', () => {
    if (!postSlugEl.value.trim()) {
      postSlugEl.value = slugify(postTitleEl.value);
    }
  });

  postFormEl.addEventListener('submit', (event) => {
    handlePostSubmit(event).catch((error) => showToast(error.message || '保存失败'));
  });

  resetPostBtnEl.addEventListener('click', () => {
    resetPostForm();
  });

  uploadAvatarBtnEl.addEventListener('click', () => {
    handleAvatarUpload().catch((error) => showToast(error.message || '上传失败'));
  });

  uploadCoverBtnEl.addEventListener('click', () => {
    handleCoverUpload().catch((error) => showToast(error.message || '上传失败'));
  });
}

async function boot() {
  wireEvents();

  const rememberedEmail = getLastLoginEmail();
  if (rememberedEmail) {
    loginEmailEl.value = rememberedEmail;
  }

  const token = getToken();
  if (!token) {
    openLogin();
    return;
  }

  await initializeDashboardWithRetry();
}

boot().catch((error) => {
  console.error(error);
  showToast(error.message || '后台初始化失败');
});
