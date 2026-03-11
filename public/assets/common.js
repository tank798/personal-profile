const API_BASE = '/api/v1';
const TOKEN_KEY = 'homepage_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = false,
    headers = {},
  } = options;

  const requestHeaders = {
    ...headers,
  };

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['content-type'] = 'application/json';
  }

  if (auth) {
    const token = getToken();
    if (token) {
      requestHeaders.authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.message ? payload.message : `请求失败: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

export function formatDate(input) {
  if (!input) return '-';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(input) {
  if (!input) return '-';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '-';
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

export function renderMarkdownBasic(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inList = false;
  let inOrdered = false;
  let inCode = false;

  function closeLists() {
    if (inList) {
      html.push(inOrdered ? '</ol>' : '</ul>');
      inList = false;
      inOrdered = false;
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '```') {
      closeLists();
      if (inCode) {
        html.push('</code></pre>');
        inCode = false;
      } else {
        html.push('<pre><code>');
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!line.trim()) {
      closeLists();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (!inList || !inOrdered) {
        closeLists();
        html.push('<ol>');
        inList = true;
        inOrdered = true;
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      if (!inList || inOrdered) {
        closeLists();
        html.push('<ul>');
        inList = true;
        inOrdered = false;
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeLists();
  if (inCode) {
    html.push('</code></pre>');
  }

  return html.join('');
}

export function slugify(text) {
  const fallback = `post-${Date.now()}`;
  if (!text) return fallback;

  const slug = String(text)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug || slug.length < 3) return fallback;
  if (slug.length > 80) return slug.slice(0, 80).replace(/-+$/g, '');
  return slug;
}

export function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function setQueryParam(name, value) {
  const url = new URL(window.location.href);
  if (value === null || value === undefined || value === '') {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, value);
  }
  window.history.replaceState({}, '', url);
}

export async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export async function getImageDimensions(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('读取图片尺寸失败'));
      image.src = objectUrl;
    });
    return {
      width: img.naturalWidth || undefined,
      height: img.naturalHeight || undefined,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

