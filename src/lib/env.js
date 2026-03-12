import dotenv from 'dotenv';

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function splitCsv(value, fallback = []) {
  if (!value) return fallback;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  port: toInt(process.env.PORT, 8080),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/homepage_platform',
  jwtSecret: process.env.JWT_SECRET || 'dev-change-me',
  jwtExpiresInSeconds: toInt(process.env.JWT_EXPIRES_IN_SECONDS, 2592000),
  corsOrigins: splitCsv(process.env.CORS_ORIGINS, ['*']),
  objectStorageUploadBaseUrl: process.env.OBJECT_STORAGE_UPLOAD_BASE_URL || 'https://upload.example.com',
  objectStoragePublicBaseUrl: process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || 'https://cdn.example.com',
  uploadUrlTtlSeconds: toInt(process.env.UPLOAD_URL_TTL_SECONDS, 600),

  adminEmail: process.env.ADMIN_EMAIL || 'owner@example.com',
  adminUsername: process.env.ADMIN_USERNAME || 'owner',
  adminDisplayName: process.env.ADMIN_DISPLAY_NAME || '站点主人',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-this-password',
  adminBio: process.env.ADMIN_BIO || '',
  siteSlug: process.env.SITE_SLUG || process.env.ADMIN_USERNAME || 'owner',
  siteTitle: process.env.SITE_TITLE || '我的主页',
  siteSubtitle: process.env.SITE_SUBTITLE || '记录生活与想法',
  siteAboutMd: process.env.SITE_ABOUT_MD || '',
  syncAdminPasswordOnBoot: toBool(process.env.SYNC_ADMIN_PASSWORD_ON_BOOT, false),
};
