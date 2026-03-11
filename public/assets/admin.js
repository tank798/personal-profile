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
const AVATAR_CROP_SIZE = 320;
const AVATAR_EXPORT_SIZE = 512;

const loginWrapEl = document.getElementById('login-wrap');
const loginFormEl = document.getElementById('login-form');
const loginEmailEl = document.getElementById('login-email');
const loginPasswordEl = document.getElementById('login-password');

const adminShellEl = document.getElementById('admin-shell');
const adminTitleEl = document.getElementById('admin-title');
const logoutBtnEl = document.getElementById('logout-btn');

const profileFormEl = document.getElementById('profile-form');
const displayNameEl = document.getElementById('display-name');
const aboutMdEl = document.getElementById('about-md');
const avatarFileEl = document.getElementById('avatar-file');
const uploadAvatarBtnEl = document.getElementById('upload-avatar-btn');
const avatarMediaIdEl = document.getElementById('avatar-media-id');
const avatarPreviewEl = document.getElementById('avatar-preview');

const postFormEl = document.getElementById('post-form');
const editingPostIdEl = document.getElementById('editing-post-id');
const postTitleEl = document.getElementById('post-title');
const postSlugEl = document.getElementById('post-slug');
const postSummaryEl = document.getElementById('post-summary');
const postContentEl = document.getElementById('post-content');
const coverFileEl = document.getElementById('cover-file');
const coverMediaIdEl = document.getElementById('cover-media-id');
const coverPreviewEl = document.getElementById('cover-preview');
const postImagesFileEl = document.getElementById('post-images-file');
const postImagesPreviewEl = document.getElementById('post-images-preview');
const postStatusEl = document.getElementById('post-status');
const postPinnedEl = document.getElementById('post-pinned');
const savePostBtnEl = document.getElementById('save-post-btn');
const resetPostBtnEl = document.getElementById('reset-post-btn');

const postListEl = document.getElementById('post-list');

const avatarCropDialogEl = document.getElementById('avatar-crop-dialog');
const avatarCropCanvasEl = document.getElementById('avatar-crop-canvas');
const avatarZoomEl = document.getElementById('avatar-zoom');
const avatarCropCancelEl = document.getElementById('avatar-crop-cancel');
const avatarCropConfirmEl = document.getElementById('avatar-crop-confirm');

const avatarCtx = avatarCropCanvasEl?.getContext('2d');

const state = {
  posts: [],
  postImages: [],
  isUploadingCover: false,
  isUploadingPostImages: false,
};

const cropState = {
  image: null,
  baseScale: 1,
  zoom: 1,
  drawX: 0,
  drawY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  resolve: null,
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

function dedupeMediaList(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.id) continue;
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

function renderPostImagesPreview() {
  if (!state.postImages.length) {
    postImagesPreviewEl.innerHTML = '<div class="hint">当前还没有上传帖子图片。</div>';
    return;
  }

  postImagesPreviewEl.innerHTML = state.postImages
    .map(
      (media) => `
      <article class="upload-multi-item" data-media-id="${media.id}">
        <img src="${escapeHtml(media.url)}" alt="帖子图片" />
        <button class="btn btn-danger btn-sm" type="button" data-action="remove-image">删除</button>
      </article>
    `
    )
    .join('');
}

function setPostImages(items) {
  state.postImages = dedupeMediaList(items);
  renderPostImagesPreview();
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
  aboutMdEl.value = me.site.aboutMd || '';
  avatarMediaIdEl.value = me.user.avatarMediaId || '';
  showPreview(avatarPreviewEl, me.user.avatarUrl || '');
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
          const detail = await apiFetch(`/admin/posts/${postId}`, { auth: true });
          fillPostForm(detail);
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
  setPostImages(post.images || []);
  savePostBtnEl.textContent = '更新帖子';
}

function resetPostForm() {
  editingPostIdEl.value = '';
  postFormEl.reset();
  postStatusEl.value = 'draft';
  postPinnedEl.value = 'false';
  coverMediaIdEl.value = '';
  showPreview(coverPreviewEl, '');
  setPostImages([]);
  if (coverFileEl) coverFileEl.value = '';
  if (postImagesFileEl) postImagesFileEl.value = '';
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

  const displayName = displayNameEl.value.trim();
  const aboutMd = aboutMdEl.value.trim() || null;

  await apiFetch('/admin/profile', {
    method: 'PUT',
    auth: true,
    body: {
      displayName,
      avatarMediaId: avatarMediaIdEl.value || null,
    },
  });

  await apiFetch('/admin/site', {
    method: 'PUT',
    auth: true,
    body: {
      aboutMd,
    },
  });

  showToast('个人信息已保存');
}

async function handlePostSubmit(event) {
  event.preventDefault();

  if (state.isUploadingCover || state.isUploadingPostImages) {
    throw new Error('图片仍在上传中，请稍后再保存帖子');
  }

  const payload = {
    title: postTitleEl.value.trim(),
    slug: postSlugEl.value.trim(),
    summary: postSummaryEl.value.trim() || undefined,
    contentMd: postContentEl.value,
    coverMediaId: coverMediaIdEl.value || null,
    imageMediaIds: state.postImages.map((item) => item.id),
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

function createImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('头像读取失败，请更换图片重试'));
    image.src = dataUrl;
  });
}

function getDrawSize() {
  const image = cropState.image;
  const scale = cropState.baseScale * cropState.zoom;
  return {
    width: image.naturalWidth * scale,
    height: image.naturalHeight * scale,
  };
}

function clampCropPosition() {
  if (!cropState.image) return;

  const { width, height } = getDrawSize();
  const minX = AVATAR_CROP_SIZE - width;
  const minY = AVATAR_CROP_SIZE - height;

  cropState.drawX = Math.min(0, Math.max(minX, cropState.drawX));
  cropState.drawY = Math.min(0, Math.max(minY, cropState.drawY));
}

function renderAvatarCropCanvas() {
  if (!avatarCtx) return;

  avatarCtx.clearRect(0, 0, AVATAR_CROP_SIZE, AVATAR_CROP_SIZE);
  avatarCtx.fillStyle = '#f3e9dc';
  avatarCtx.fillRect(0, 0, AVATAR_CROP_SIZE, AVATAR_CROP_SIZE);

  if (!cropState.image) return;

  const { width, height } = getDrawSize();

  avatarCtx.drawImage(cropState.image, cropState.drawX, cropState.drawY, width, height);

  const radius = AVATAR_CROP_SIZE / 2 - 6;
  avatarCtx.fillStyle = 'rgba(44, 30, 20, 0.38)';
  avatarCtx.beginPath();
  avatarCtx.rect(0, 0, AVATAR_CROP_SIZE, AVATAR_CROP_SIZE);
  avatarCtx.moveTo(AVATAR_CROP_SIZE / 2 + radius, AVATAR_CROP_SIZE / 2);
  avatarCtx.arc(AVATAR_CROP_SIZE / 2, AVATAR_CROP_SIZE / 2, radius, 0, Math.PI * 2, true);
  avatarCtx.fill('evenodd');

  avatarCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  avatarCtx.lineWidth = 2;
  avatarCtx.beginPath();
  avatarCtx.arc(AVATAR_CROP_SIZE / 2, AVATAR_CROP_SIZE / 2, radius, 0, Math.PI * 2);
  avatarCtx.stroke();
}

function finalizeCrop(file) {
  if (typeof cropState.resolve === 'function') {
    cropState.resolve(file);
    cropState.resolve = null;
  }
}

function closeCropDialog(file = null) {
  cropState.dragging = false;
  cropState.image = null;
  if (avatarCropDialogEl.open) {
    avatarCropDialogEl.close();
  }
  finalizeCrop(file);
}

async function exportCroppedAvatarFile() {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = AVATAR_EXPORT_SIZE;
  exportCanvas.height = AVATAR_EXPORT_SIZE;
  const ctx = exportCanvas.getContext('2d');

  const scaleRatio = AVATAR_EXPORT_SIZE / AVATAR_CROP_SIZE;
  const { width, height } = getDrawSize();

  ctx.drawImage(
    cropState.image,
    cropState.drawX * scaleRatio,
    cropState.drawY * scaleRatio,
    width * scaleRatio,
    height * scaleRatio
  );

  const blob = await new Promise((resolve, reject) => {
    exportCanvas.toBlob((value) => {
      if (!value) {
        reject(new Error('头像裁剪失败'));
        return;
      }
      resolve(value);
    }, 'image/png', 0.96);
  });

  return new File([blob], `avatar-${Date.now()}.png`, {
    type: 'image/png',
  });
}

async function pickCroppedAvatar(file) {
  if (!avatarCropDialogEl?.showModal || !avatarCtx) {
    return file;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await createImageFromDataUrl(dataUrl);

  cropState.image = image;
  cropState.baseScale = Math.max(AVATAR_CROP_SIZE / image.naturalWidth, AVATAR_CROP_SIZE / image.naturalHeight);
  cropState.zoom = 1;

  const drawWidth = image.naturalWidth * cropState.baseScale;
  const drawHeight = image.naturalHeight * cropState.baseScale;
  cropState.drawX = (AVATAR_CROP_SIZE - drawWidth) / 2;
  cropState.drawY = (AVATAR_CROP_SIZE - drawHeight) / 2;

  avatarZoomEl.value = '1';
  renderAvatarCropCanvas();

  avatarCropDialogEl.showModal();

  return new Promise((resolve) => {
    cropState.resolve = resolve;
  });
}

async function handleAvatarUpload() {
  const file = requireFile(avatarFileEl);
  const processedFile = await pickCroppedAvatar(file);
  if (!processedFile) return;

  const media = await uploadMedia(processedFile, 'avatar');
  avatarMediaIdEl.value = media.id;
  showPreview(avatarPreviewEl, media.url);
  showToast('头像上传完成，请点击“保存个人信息”');
}

async function handleCoverUpload() {
  const file = requireFile(coverFileEl);

  state.isUploadingCover = true;
  coverFileEl.disabled = true;

  try {
    const media = await uploadMedia(file, 'cover');
    coverMediaIdEl.value = media.id;
    showPreview(coverPreviewEl, media.url);
    showToast('封面已自动上传，保存帖子后生效');
  } finally {
    state.isUploadingCover = false;
    coverFileEl.disabled = false;
    coverFileEl.value = '';
  }
}

async function handlePostImagesUpload() {
  const files = Array.from(postImagesFileEl.files || []);
  if (!files.length) {
    return;
  }

  state.isUploadingPostImages = true;
  postImagesFileEl.disabled = true;

  const uploadedItems = [];

  try {
    for (const file of files) {
      const media = await uploadMedia(file, 'post');
      uploadedItems.push(media);
    }

    setPostImages([...state.postImages, ...uploadedItems]);
    showToast(`已自动上传${uploadedItems.length}张图片，保存帖子后生效`);
  } finally {
    state.isUploadingPostImages = false;
    postImagesFileEl.disabled = false;
    postImagesFileEl.value = '';
  }
}

function wireCropEvents() {
  if (!avatarCtx) return;

  avatarZoomEl.addEventListener('input', () => {
    if (!cropState.image) return;

    const previousZoom = cropState.zoom;
    cropState.zoom = Number.parseFloat(avatarZoomEl.value || '1');

    const previousScale = cropState.baseScale * previousZoom;
    const nextScale = cropState.baseScale * cropState.zoom;

    const centerX = AVATAR_CROP_SIZE / 2;
    const centerY = AVATAR_CROP_SIZE / 2;
    const imagePointX = (centerX - cropState.drawX) / previousScale;
    const imagePointY = (centerY - cropState.drawY) / previousScale;

    cropState.drawX = centerX - imagePointX * nextScale;
    cropState.drawY = centerY - imagePointY * nextScale;

    clampCropPosition();
    renderAvatarCropCanvas();
  });

  avatarCropCanvasEl.addEventListener('pointerdown', (event) => {
    if (!cropState.image) return;
    cropState.dragging = true;
    cropState.lastX = event.clientX;
    cropState.lastY = event.clientY;
    avatarCropCanvasEl.setPointerCapture(event.pointerId);
  });

  avatarCropCanvasEl.addEventListener('pointermove', (event) => {
    if (!cropState.dragging) return;

    const dx = event.clientX - cropState.lastX;
    const dy = event.clientY - cropState.lastY;
    cropState.lastX = event.clientX;
    cropState.lastY = event.clientY;

    cropState.drawX += dx;
    cropState.drawY += dy;

    clampCropPosition();
    renderAvatarCropCanvas();
  });

  const stopDrag = (event) => {
    cropState.dragging = false;
    if (event?.pointerId !== undefined) {
      avatarCropCanvasEl.releasePointerCapture(event.pointerId);
    }
  };

  avatarCropCanvasEl.addEventListener('pointerup', stopDrag);
  avatarCropCanvasEl.addEventListener('pointercancel', stopDrag);

  avatarCropCancelEl.addEventListener('click', () => closeCropDialog(null));
  avatarCropConfirmEl.addEventListener('click', async () => {
    try {
      const cropped = await exportCroppedAvatarFile();
      closeCropDialog(cropped);
    } catch (error) {
      showToast(error.message || '裁剪失败');
    }
  });

  avatarCropDialogEl.addEventListener('click', (event) => {
    const rect = avatarCropDialogEl.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!inside) {
      closeCropDialog(null);
    }
  });

  avatarCropDialogEl.addEventListener('close', () => {
    if (cropState.resolve) {
      finalizeCrop(null);
    }
  });
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

  coverFileEl.addEventListener('change', () => {
    handleCoverUpload().catch((error) => showToast(error.message || '上传失败'));
  });

  postImagesFileEl.addEventListener('change', () => {
    handlePostImagesUpload().catch((error) => showToast(error.message || '上传失败'));
  });

  postImagesPreviewEl.addEventListener('click', (event) => {
    const trigger = event.target?.closest('[data-action="remove-image"]');
    if (!trigger) return;

    const card = trigger.closest('[data-media-id]');
    const mediaId = card?.dataset?.mediaId;
    if (!mediaId) return;

    setPostImages(state.postImages.filter((item) => item.id !== mediaId));
  });

  wireCropEvents();
}

async function boot() {
  wireEvents();
  setPostImages([]);

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
