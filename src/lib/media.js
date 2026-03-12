export function isInlineMediaUrl(url) {
  return typeof url === 'string' && url.startsWith('data:');
}

export function buildMediaContentUrl(mediaId) {
  return `/api/v1/media/${mediaId}/content`;
}

export function toDeliveredMediaUrl({ mediaId, url, delivery = 'direct', isInline } = {}) {
  if (delivery === 'public' && mediaId && (typeof isInline === 'boolean' ? isInline : isInlineMediaUrl(url))) {
    return buildMediaContentUrl(mediaId);
  }

  return url ?? null;
}

export function decodeInlineMediaUrl(url, fallbackMimeType = 'application/octet-stream') {
  if (!isInlineMediaUrl(url)) {
    return null;
  }

  const commaIndex = url.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Invalid inline media URL');
  }

  const metadata = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  const parts = metadata.split(';').filter(Boolean);

  let mimeType = fallbackMimeType;
  if (parts.length && !parts[0].includes('=')) {
    mimeType = parts.shift() || fallbackMimeType;
  }

  const isBase64 = parts.some((part) => part.toLowerCase() === 'base64');
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return {
    buffer,
    mimeType,
  };
}