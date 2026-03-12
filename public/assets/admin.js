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
const postContentEl = document.getElementById('post-content');
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
    throw new Error('\u8bf7\u5148\u9009\u62e9\u56fe\u7247\u6587\u4ef6');
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
    postImagesPreviewEl.innerHTML = '<div class="hint">\u5f53\u524d\u8fd8\u6ca1\u6709\u4e0a\u4f20\u5e16\u5b50\u56fe\u7247\u3002</div>';
    return;
  }

  postImagesPreviewEl.innerHTML = state.postImages
    .map(
      (media, index) => `
      <article class="upload-multi-item ${index === 0 ? 'is-primary' : ''}" data-media-id="${media.id}">
        <span class="upload-multi-label">${index === 0 ? '\u4e3b\u56fe' : '\u56fe\u7247'}</span>
        <img src="${escapeHtml(media.url)}" alt="\u5e16\u5b50\u56fe\u7247" />
        <button class="btn btn-danger btn-sm" type="button" data-action="remove-image">\u5220\u9664</button>
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
      throw new Error(`\u4e0a\u4f20\u5931\u8d25\uff08${putResp.status}\uff09`);
    }
  } catch {
    uploadedUrl = await readFileAsDataUrl(file);
    showToast('\u672a\u68c0\u6d4b\u5230\u5bf9\u8c61\u5b58\u50a8\uff0c\u5df2\u5207\u6362\u4e3a\u672c\u5730\u6f14\u793a\u4e0a\u4f20\u6a21\u5f0f\u3002');
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

  adminTitleEl.textContent = `${me.user.displayName || '\u6211\u7684'} \u00b7 \u5185\u5bb9\u7ba1\u7406`;
  displayNameEl.value = me.user.displayName || '';
  aboutMdEl.value = me.site.aboutMd || '';
  avatarMediaIdEl.value = me.user.avatarMediaId || '';
  showPreview(avatarPreviewEl, me.user.avatarUrl || '');
}

function getStatusMeta(status) {
  const map = {
    published: { className: 'published', label: '\u5df2\u53d1\u5e03' },
    draft: { className: 'draft', label: '\u8349\u7a3f' },
    archived: { className: 'archived', label: '\u5f52\u6863' },
  };
  return map[status] || map.draft;
}

function statusBadge(status) {
  const meta = getStatusMeta(status);
  return `<span class="badge ${meta.className}">${meta.label}</span>`;
}

function renderPostList() {
  if (!state.posts.length) {
    postListEl.innerHTML = '<div class="empty-block">\u8fd8\u6ca1\u6709\u5e16\u5b50\uff0c\u5148\u521b\u5efa\u7b2c\u4e00\u7bc7\u5427\u3002</div>';
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
        <p class="item-meta">\u66f4\u65b0\u65f6\u95f4\uff1a${escapeHtml(formatDateTime(post.updatedAt))}</p>
        <div class="item-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="edit">\u7f16\u8f91</button>
          ${
            post.status === 'published'
              ? '<button class="btn btn-ghost btn-sm" type="button" data-action="unpublish">\u8f6c\u4e3a\u8349\u7a3f</button>'
              : '<button class="btn btn-primary btn-sm" type="button" data-action="publish">\u53d1\u5e03</button>'
          }
          <button class="btn btn-danger btn-sm" type="button" data-action="delete">\u5220\u9664</button>
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
          const ok = window.confirm(`\u786e\u8ba4\u5220\u9664\u300a${post.title}\u300b\u5417\uff1f`);
          if (!ok) return;
          await apiFetch(`/admin/posts/${postId}`, { method: 'DELETE', auth: true });
          showToast('\u5df2\u5220\u9664\u3002');
          await loadPosts();
          if (editingPostIdEl.value === postId) {
            resetPostForm();
          }
          return;
        }

        if (action === 'publish') {
          await apiFetch(`/admin/posts/${postId}/publish`, { method: 'POST', auth: true, body: {} });
          showToast('\u53d1\u5e03\u6210\u529f\u3002');
          await loadPosts();
          return;
        }

        if (action === 'unpublish') {
          await apiFetch(`/admin/posts/${postId}/unpublish`, { method: 'POST', auth: true, body: {} });
          showToast('\u5df2\u8f6c\u4e3a\u8349\u7a3f\u3002');
          await loadPosts();
        }
      } catch (error) {
        showToast(error.message || '\u64cd\u4f5c\u5931\u8d25');
      }
    });
  }
}

async function loadPosts() {
  postListEl.innerHTML = '<div class="loading-block">\u52a0\u8f7d\u4e2d...</div>';
  const data = await apiFetch('/admin/posts?page=1&pageSize=50', { auth: true });
  state.posts = data.items || [];
  renderPostList();
}

function fillPostForm(post) {
  editingPostIdEl.value = post.id;
  postTitleEl.value = post.title || '';
  postSlugEl.value = post.slug || '';
  postContentEl.value = post.contentMd || '';
  postStatusEl.value = post.status || 'draft';
  postPinnedEl.value = String(Boolean(post.isPinned));
  setPostImages(dedupeMediaList([post.coverImage, ...(post.images || [])].filter(Boolean)));
  savePostBtnEl.textContent = '\u66f4\u65b0\u5e16\u5b50';
}

function resetPostForm() {
  editingPostIdEl.value = '';
  postFormEl.reset();
  postStatusEl.value = 'draft';
  postPinnedEl.value = 'false';
  setPostImages([]);
  if (postImagesFileEl) postImagesFileEl.value = '';
  savePostBtnEl.textContent = '\u4fdd\u5b58\u5e16\u5b50';
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

  showToast('\u767b\u5f55\u6210\u529f\u3002');
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
        showToast('\u767b\u5f55\u72b6\u6001\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002');
        return false;
      }

      if (attempt < DASHBOARD_INIT_RETRY) {
        showToast(`\u670d\u52a1\u6b63\u5728\u5524\u9192\uff0c\u81ea\u52a8\u91cd\u8bd5 ${attempt}/${DASHBOARD_INIT_RETRY - 1}...`);
        await sleep(2500 * attempt);
        continue;
      }

      openLogin();
      showToast('\u670d\u52a1\u54cd\u5e94\u8f83\u6162\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
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
    body: { aboutMd },
  });

  showToast('\u4e2a\u4eba\u4fe1\u606f\u5df2\u4fdd\u5b58\u3002');
}

async function handlePostSubmit(event) {
  event.preventDefault();

  if (state.isUploadingPostImages) {
    throw new Error('\u56fe\u7247\u4ecd\u5728\u4e0a\u4f20\u4e2d\uff0c\u8bf7\u7a0d\u540e\u518d\u4fdd\u5b58\u5e16\u5b50\u3002');
  }

  const imageMediaIds = state.postImages.map((item) => item.id);
  const payload = {
    title: postTitleEl.value.trim(),
    slug: postSlugEl.value.trim(),
    contentMd: postContentEl.value,
    coverMediaId: imageMediaIds[0] || null,
    imageMediaIds,
    status: postStatusEl.value,
    isPinned: postPinnedEl.value === 'true',
  };

  const editingId = editingPostIdEl.value;

  if (editingId) {
    payload.summary = null;
    await apiFetch(`/admin/posts/${editingId}`, {
      method: 'PUT',
      auth: true,
      body: payload,
    });
    showToast('\u5e16\u5b50\u5df2\u66f4\u65b0\u3002');
  } else {
    await apiFetch('/admin/posts', {
      method: 'POST',
      auth: true,
      body: payload,
    });
    showToast('\u5e16\u5b50\u5df2\u521b\u5efa\u3002');
  }

  resetPostForm();
  await loadPosts();
}

function createImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('\u5934\u50cf\u8bfb\u53d6\u5931\u8d25\uff0c\u8bf7\u66f4\u6362\u56fe\u7247\u540e\u91cd\u8bd5\u3002'));
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
        reject(new Error('\u5934\u50cf\u88c1\u526a\u5931\u8d25\u3002'));
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
  showToast('\u5934\u50cf\u4e0a\u4f20\u5b8c\u6210\uff0c\u8bf7\u70b9\u51fb\u201c\u4fdd\u5b58\u4e2a\u4eba\u4fe1\u606f\u201d\u3002');
}

async function handlePostImagesUpload() {
  const files = Array.from(postImagesFileEl.files || []);
  if (!files.length) return;

  state.isUploadingPostImages = true;
  postImagesFileEl.disabled = true;

  const uploadedItems = [];

  try {
    for (const file of files) {
      const media = await uploadMedia(file, 'post');
      uploadedItems.push(media);
    }

    setPostImages([...state.postImages, ...uploadedItems]);
    showToast(`\u5df2\u81ea\u52a8\u4e0a\u4f20 ${uploadedItems.length} \u5f20\u56fe\u7247\uff0c\u7b2c\u4e00\u5f20\u4f1a\u4f5c\u4e3a\u5e16\u5b50\u4e3b\u56fe\u3002`);
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
      showToast(error.message || '\u88c1\u526a\u5931\u8d25');
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
    handleLogin(event).catch((error) => showToast(error.message || '\u767b\u5f55\u5931\u8d25'));
  });

  logoutBtnEl.addEventListener('click', () => {
    setToken('');
    loginPasswordEl.value = '';
    openLogin();
    showToast('\u5df2\u9000\u51fa\u767b\u5f55\u3002');
  });

  profileFormEl.addEventListener('submit', (event) => {
    handleProfileSubmit(event).catch((error) => showToast(error.message || '\u4fdd\u5b58\u5931\u8d25'));
  });

  postTitleEl.addEventListener('input', () => {
    if (!postSlugEl.value.trim()) {
      postSlugEl.value = slugify(postTitleEl.value);
    }
  });

  postFormEl.addEventListener('submit', (event) => {
    handlePostSubmit(event).catch((error) => showToast(error.message || '\u4fdd\u5b58\u5931\u8d25'));
  });

  resetPostBtnEl.addEventListener('click', () => {
    resetPostForm();
  });

  uploadAvatarBtnEl.addEventListener('click', () => {
    handleAvatarUpload().catch((error) => showToast(error.message || '\u4e0a\u4f20\u5931\u8d25'));
  });

  postImagesFileEl.addEventListener('change', () => {
    handlePostImagesUpload().catch((error) => showToast(error.message || '\u4e0a\u4f20\u5931\u8d25'));
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
  showToast(error.message || '\u540e\u53f0\u521d\u59cb\u5316\u5931\u8d25');
});
