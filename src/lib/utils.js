import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { env } from './env.js';

export function toOffset(page, pageSize) {
  return (page - 1) * pageSize;
}

export function sanitizeFilename(filename) {
  const base = filename.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return base.replace(/-+/g, '-').slice(0, 120);
}

export function buildObjectKey(userId, filename) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `users/${userId}/${yyyy}/${mm}/${randomUUID()}-${sanitizeFilename(filename)}`;
}

export function createUploadSignature(objectKey, expiresAtIso) {
  const payload = `${objectKey}|${expiresAtIso}`;
  return crypto.createHmac('sha256', env.jwtSecret).update(payload).digest('hex');
}

export function createSignedUploadUrl(objectKey, expiresAtIso) {
  const signature = createUploadSignature(objectKey, expiresAtIso);
  const encodedKey = encodeURIComponent(objectKey);
  return `${env.objectStorageUploadBaseUrl}/${encodedKey}?expires=${encodeURIComponent(expiresAtIso)}&sig=${signature}`;
}

export function buildPublicMediaUrl(objectKey) {
  return `${env.objectStoragePublicBaseUrl}/${objectKey}`;
}

export function toUserBrief(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    avatarMediaId: row.avatar_media_id ?? null,
  };
}

export function toSite(row) {
  return {
    id: row.site_id,
    slug: row.site_slug,
    title: row.site_title,
    subtitle: row.site_subtitle,
    aboutMd: row.site_about_md,
    theme: row.site_theme_json ?? {},
  };
}

export function mapMedia(row) {
  return {
    id: row.id,
    url: row.url,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    purpose: row.purpose,
    createdAt: row.created_at,
  };
}

export function mapTag(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
  };
}

export function mapPostSummary(row, tags = [], coverImage = null) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverImage,
    tags,
    status: row.status,
    isPinned: row.is_pinned,
    publishedAt: row.published_at,
  };
}

