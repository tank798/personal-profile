import { Router } from 'express';
import { asyncHandler, notFound } from '../lib/errors.js';
import { query } from '../lib/db.js';
import { env } from '../lib/env.js';
import { decodeInlineMediaUrl, isInlineMediaUrl, toDeliveredMediaUrl } from '../lib/media.js';
import {
  getCoverMediaByIds,
  getPostImages,
  getPostTags,
  getPrimarySite,
  listTagsBySite,
} from '../lib/repositories.js';
import { buildPublicCacheKey, getPublicCache, setPublicCache } from '../lib/public-cache.js';
import {
  listPublicPostsQuerySchema,
  mediaIdParamSchema,
  postIdParamSchema,
  validate,
} from '../lib/validators.js';
import { mapPostSummary, toOffset, toSite } from '../lib/utils.js';

export const publicRouter = Router();

publicRouter.get(
  '/media/:mediaId/content',
  asyncHandler(async (req, res) => {
    const { mediaId } = validate(mediaIdParamSchema, req.params);
    const result = await query(
      `
        SELECT m.id, m.url, m.mime_type, m.size_bytes
        FROM media m
        WHERE m.id = $1
          AND (
            EXISTS (
              SELECT 1
              FROM sites s
              JOIN users u ON u.id = s.user_id
              WHERE u.email = $2 AND u.avatar_media_id = m.id
            )
            OR EXISTS (
              SELECT 1
              FROM posts p
              JOIN sites s ON s.id = p.site_id
              JOIN users u ON u.id = s.user_id
              WHERE u.email = $2 AND p.status = 'published' AND p.cover_media_id = m.id
            )
            OR EXISTS (
              SELECT 1
              FROM post_media pm
              JOIN posts p ON p.id = pm.post_id
              JOIN sites s ON s.id = p.site_id
              JOIN users u ON u.id = s.user_id
              WHERE u.email = $2 AND p.status = 'published' AND pm.media_id = m.id
            )
          )
        LIMIT 1
      `,
      [mediaId, env.adminEmail]
    );

    if (result.rowCount === 0) {
      throw notFound('Media not found');
    }

    const media = result.rows[0];
    res.set('Cache-Control', 'public, max-age=31536000, immutable');

    if (!isInlineMediaUrl(media.url)) {
      res.redirect(302, media.url);
      return;
    }

    const decoded = decodeInlineMediaUrl(media.url, media.mime_type);
    res.type(decoded?.mimeType || media.mime_type || 'application/octet-stream');
    res.set('Content-Length', String(decoded?.buffer.length ?? media.size_bytes ?? 0));
    res.send(decoded?.buffer);
  })
);

publicRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const cacheKey = buildPublicCacheKey(req);
    const cached = getPublicCache(cacheKey);
    if (cached) {
      res.set('x-cache', 'HIT');
      res.json(cached);
      return;
    }

    const siteRow = await getPrimarySite({ delivery: 'public' });

    const payload = {
      username: siteRow.username,
      displayName: siteRow.display_name,
      bio: siteRow.bio,
      avatarUrl: toDeliveredMediaUrl({
        mediaId: siteRow.avatar_media_id ?? null,
        url: siteRow.avatar_url,
        delivery: 'public',
        isInline: siteRow.avatar_is_inline,
      }),
      site: toSite(siteRow),
    };

    res.set('x-cache', 'MISS');
    res.json(setPublicCache(cacheKey, payload));
  })
);

publicRouter.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const cacheKey = buildPublicCacheKey(req);
    const cached = getPublicCache(cacheKey);
    if (cached) {
      res.set('x-cache', 'HIT');
      res.json(cached);
      return;
    }

    const { page, pageSize, tag } = validate(listPublicPostsQuerySchema, req.query);
    const siteRow = await getPrimarySite();

    const conditions = ['p.site_id = $1', `p.status = 'published'`];
    const params = [siteRow.site_id];

    if (tag) {
      params.push(tag);
      conditions.push(`EXISTS (
        SELECT 1
        FROM post_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id AND t.slug = $${params.length}
      )`);
    }

    const whereSql = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*)::int AS total FROM posts p WHERE ${whereSql}`, params);
    const total = countResult.rows[0].total;

    const offset = toOffset(page, pageSize);
    params.push(pageSize, offset);

    const listResult = await query(
      `
        SELECT p.id, p.slug, p.title, p.summary, p.cover_media_id, p.sort_order, p.status, p.is_pinned, p.published_at
        FROM posts p
        WHERE ${whereSql}
        ORDER BY p.sort_order ASC, p.published_at DESC NULLS LAST, p.created_at DESC, p.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    const rows = listResult.rows;
    const postIds = rows.map((row) => row.id);
    const coverIds = rows.map((row) => row.cover_media_id).filter(Boolean);

    const [tagMap, coverMap] = await Promise.all([
      getPostTags(postIds),
      getCoverMediaByIds(coverIds, { delivery: 'public' }),
    ]);

    const items = rows.map((row) =>
      mapPostSummary(row, tagMap.get(row.id) ?? [], row.cover_media_id ? coverMap.get(row.cover_media_id) ?? null : null)
    );

    const payload = {
      items,
      page,
      pageSize,
      total,
    };

    res.set('x-cache', 'MISS');
    res.json(setPublicCache(cacheKey, payload));
  })
);

publicRouter.get(
  '/posts/:postId',
  asyncHandler(async (req, res) => {
    const cacheKey = buildPublicCacheKey(req);
    const cached = getPublicCache(cacheKey);
    if (cached) {
      res.set('x-cache', 'HIT');
      res.json(cached);
      return;
    }

    const { postId } = validate(postIdParamSchema, req.params);
    const siteRow = await getPrimarySite();

    const postResult = await query(
      `
        SELECT p.id, p.slug, p.title, p.summary, p.content_md, p.cover_media_id, p.sort_order, p.status, p.is_pinned,
               p.published_at, p.created_at, p.updated_at
        FROM posts p
        WHERE p.site_id = $1 AND p.id = $2 AND p.status = 'published'
      `,
      [siteRow.site_id, postId]
    );

    if (postResult.rowCount === 0) {
      throw notFound('Post not found');
    }

    const post = postResult.rows[0];

    const [tagMap, coverMap, images] = await Promise.all([
      getPostTags([post.id]),
      getCoverMediaByIds(post.cover_media_id ? [post.cover_media_id] : [], { delivery: 'public' }),
      getPostImages(post.id, { delivery: 'public' }),
    ]);

    const payload = {
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      contentMd: post.content_md,
      images,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    };

    res.set('x-cache', 'MISS');
    res.json(setPublicCache(cacheKey, payload));
  })
);

publicRouter.get(
  '/tags',
  asyncHandler(async (req, res) => {
    const cacheKey = buildPublicCacheKey(req);
    const cached = getPublicCache(cacheKey);
    if (cached) {
      res.set('x-cache', 'HIT');
      res.json(cached);
      return;
    }

    const siteRow = await getPrimarySite();
    const items = await listTagsBySite(siteRow.site_id);
    const payload = { items };

    res.set('x-cache', 'MISS');
    res.json(setPublicCache(cacheKey, payload));
  })
);