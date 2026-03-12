const DEFAULT_PUBLIC_CACHE_TTL_MS = 60 * 1000;

const publicCache = new Map();

export function buildPublicCacheKey(req) {
  return `${req.method}:${req.originalUrl}`;
}

export function getPublicCache(key) {
  const entry = publicCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    publicCache.delete(key);
    return null;
  }

  return entry.value;
}

export function setPublicCache(key, value, ttlMs = DEFAULT_PUBLIC_CACHE_TTL_MS) {
  publicCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  return value;
}

export function clearPublicCache() {
  publicCache.clear();
}
