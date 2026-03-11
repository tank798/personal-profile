import { Router } from 'express';
import { authRequired } from '../lib/auth.js';
import { query, withTransaction } from '../lib/db.js';
import { asyncHandler, badRequest, notFound } from '../lib/errors.js';
import {
  ensureMediaOwnedByUser,
  ensurePostOwnedByUser,
  getCoverMediaByIds,
  getCurrentUserWithSite,
  getPostImages,
  getPostTags,
  getTagsByIdsForSite,
  replacePostImages,
  replacePostTags,
} from '../lib/repositories.js';
import {
  completeUploadSchema,
  createPostSchema,
  createUploadUrlSchema,
  listAdminPostsQuerySchema,
  listMediaQuerySchema,
  postIdParamSchema,
  publishPostSchema,
  updatePostSchema,
  updateProfileSchema,
  updateSiteSchema,
  validate,
} from '../lib/validators.js';
import {
  buildObjectKey,
  buildPublicMediaUrl,
  createSignedUploadUrl,
  mapMedia,
  mapPostSummary,
  toOffset,
  toSite,
  toUserBrief,
} from '../lib/utils.js';
import { env } from '../lib/env.js';

export const adminRouter = Router();

adminRouter.use(authRequired());

adminRouter.put(
  '/admin/profile',
  asyncHandler(async (req, res) => {
    const input = validate(updateProfileSchema, req.body);

    if (!Object.keys(input).length) {
      throw badRequest('No fields provided');
    }

    if (Object.hasOwn(input, 'avatarMediaId') && input.avatarMediaId) {
      await ensureMediaOwnedByUser(input.avatarMediaId, req.user.id);
    }

    const updates = [];
    const values = [];

    if (Object.hasOwn(input, 'displayName')) {
      values.push(input.displayName);
      updates.push(`display_name = $${values.length}`);
    }

    if (Object.hasOwn(input, 'bio')) {
      values.push(input.bio);
      updates.push(`bio = $${values.length}`);
    }

    if (Object.hasOwn(input, 'avatarMediaId')) {
      values.push(input.avatarMediaId ?? null);
      updates.push(`avatar_media_id = $${values.length}`);
    }

    values.push(req.user.id);
    await query(
      `
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${values.length}
      `,
      values
    );

    const row = await getCurrentUserWithSite(req.user.id);

    res.json({
      user: toUserBrief(row),
      site: toSite(row),
    });
  })
);

adminRouter.put(
  '/admin/site',
  asyncHandler(async (req, res) => {
    const input = validate(updateSiteSchema, req.body);

    if (!Object.keys(input).length) {
      throw badRequest('No fields provided');
    }

    const current = await getCurrentUserWithSite(req.user.id);

    const updates = [];
    const values = [];

    if (Object.hasOwn(input, 'title')) {
      values.push(input.title);
      updates.push(`title = $${values.length}`);
    }

    if (Object.hasOwn(input, 'subtitle')) {
      values.push(input.subtitle ?? null);
      updates.push(`subtitle = $${values.length}`);
    }

    if (Object.hasOwn(input, 'aboutMd')) {
      values.push(input.aboutMd ?? null);
      updates.push(`about_md = $${values.length}`);
    }

    if (Object.hasOwn(input, 'theme')) {
      values.push(input.theme ?? {});
      updates.push(`theme_json = $${values.length}`);
    }

    values.push(current.site_id);

    const result = await query(
      `
        UPDATE sites
        SET ${updates.join(', ')}
        WHERE id = $${values.length}
        RETURNING
          id AS site_id,
          slug::text AS site_slug,
          title AS site_title,
          subtitle AS site_subtitle,
          about_md AS site_about_md,
          theme_json AS site_theme_json
      `,
      values
    );

    res.json(toSite(result.rows[0]));
  })
);

adminRouter.post(
  '/admin/posts',
  asyncHandler(async (req, res) => {
    const input = validate(createPostSchema, req.body);
    const current = await getCurrentUserWithSite(req.user.id);

    if (input.coverMediaId) {
      await ensureMediaOwnedByUser(input.coverMediaId, req.user.id);
    }

    if (input.imageMediaIds?.length) {
      for (const mediaId of input.imageMediaIds) {
        await ensureMediaOwnedByUser(mediaId, req.user.id);
      }
    }

    if (input.tagIds?.length) {
      await getTagsByIdsForSite(current.site_id, input.tagIds);
    }

    const status = input.status ?? 'draft';
    const publishedAt = status === 'published' ? new Date().toISOString() : null;

    const post = await withTransaction(async (client) => {
      const insertResult = await client.query(
        `
          INSERT INTO posts (
            site_id,
            author_user_id,
            slug,
            title,
            summary,
            content_md,
            cover_media_id,
            status,
            is_pinned,
            published_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          current.site_id,
          req.user.id,
          input.slug,
          input.title,
          input.summary ?? null,
          input.contentMd,
          input.coverMediaId ?? null,
          status,
          input.isPinned ?? false,
          publishedAt,
        ]
      );

      if (input.tagIds?.length) {
        await replacePostTags(insertResult.rows[0].id, input.tagIds, client);
      }

      if (Object.hasOwn(input, 'imageMediaIds')) {
        await replacePostImages(insertResult.rows[0].id, input.imageMediaIds ?? [], client);
      }

      return insertResult.rows[0];
    });

    const [tagMap, coverMap, images] = await Promise.all([
      getPostTags([post.id]),
      getCoverMediaByIds(post.cover_media_id ? [post.cover_media_id] : []),
      getPostImages(post.id),
    ]);

    res.status(201).json({
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      siteId: post.site_id,
      authorUserId: post.author_user_id,
      contentMd: post.content_md,
      coverMediaId: post.cover_media_id,
      images,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    });
  })
);

adminRouter.get(
  '/admin/posts',
  asyncHandler(async (req, res) => {
    const { page, pageSize, status, keyword } = validate(listAdminPostsQuerySchema, req.query);

    const conditions = ['p.author_user_id = $1'];
    const params = [req.user.id];

    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      conditions.push(`(p.title ILIKE $${params.length} OR COALESCE(p.summary, '') ILIKE $${params.length})`);
    }

    const whereSql = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*)::int AS total FROM posts p WHERE ${whereSql}`, params);
    const total = countResult.rows[0].total;

    const offset = toOffset(page, pageSize);
    params.push(pageSize, offset);

    const listResult = await query(
      `
        SELECT *
        FROM posts p
        WHERE ${whereSql}
        ORDER BY p.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    const rows = listResult.rows;
    const postIds = rows.map((row) => row.id);
    const coverIds = rows.map((row) => row.cover_media_id).filter(Boolean);

    const [tagMap, coverMap] = await Promise.all([
      getPostTags(postIds),
      getCoverMediaByIds(coverIds),
    ]);

    const items = rows.map((post) => ({
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      siteId: post.site_id,
      authorUserId: post.author_user_id,
      contentMd: post.content_md,
      coverMediaId: post.cover_media_id,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    }));

    res.json({ items, page, pageSize, total });
  })
);

adminRouter.get(
  '/admin/posts/:postId',
  asyncHandler(async (req, res) => {
    const { postId } = validate(postIdParamSchema, req.params);
    await ensurePostOwnedByUser(postId, req.user.id);

    const result = await query('SELECT * FROM posts WHERE id = $1', [postId]);
    const post = result.rows[0];
    const [tagMap, coverMap, images] = await Promise.all([
      getPostTags([post.id]),
      getCoverMediaByIds(post.cover_media_id ? [post.cover_media_id] : []),
      getPostImages(post.id),
    ]);

    res.json({
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      siteId: post.site_id,
      authorUserId: post.author_user_id,
      contentMd: post.content_md,
      coverMediaId: post.cover_media_id,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      images,
    });
  })
);

adminRouter.put(
  '/admin/posts/:postId',
  asyncHandler(async (req, res) => {
    const { postId } = validate(postIdParamSchema, req.params);
    const input = validate(updatePostSchema, req.body);

    if (!Object.keys(input).length) {
      throw badRequest('No fields provided');
    }

    const owned = await ensurePostOwnedByUser(postId, req.user.id);

    if (Object.hasOwn(input, 'coverMediaId') && input.coverMediaId) {
      await ensureMediaOwnedByUser(input.coverMediaId, req.user.id);
    }

    if (Object.hasOwn(input, 'imageMediaIds') && input.imageMediaIds?.length) {
      for (const mediaId of input.imageMediaIds) {
        await ensureMediaOwnedByUser(mediaId, req.user.id);
      }
    }

    if (input.tagIds?.length) {
      await getTagsByIdsForSite(owned.site_id, input.tagIds);
    }

    const updates = [];
    const values = [];

    if (Object.hasOwn(input, 'title')) {
      values.push(input.title);
      updates.push(`title = $${values.length}`);
    }

    if (Object.hasOwn(input, 'slug')) {
      values.push(input.slug);
      updates.push(`slug = $${values.length}`);
    }

    if (Object.hasOwn(input, 'summary')) {
      values.push(input.summary ?? null);
      updates.push(`summary = $${values.length}`);
    }

    if (Object.hasOwn(input, 'contentMd')) {
      values.push(input.contentMd);
      updates.push(`content_md = $${values.length}`);
    }

    if (Object.hasOwn(input, 'coverMediaId')) {
      values.push(input.coverMediaId ?? null);
      updates.push(`cover_media_id = $${values.length}`);
    }

    if (Object.hasOwn(input, 'isPinned')) {
      values.push(input.isPinned);
      updates.push(`is_pinned = $${values.length}`);
    }

    if (Object.hasOwn(input, 'status')) {
      values.push(input.status);
      updates.push(`status = $${values.length}`);

      if (input.status === 'published') {
        updates.push('published_at = COALESCE(published_at, now())');
      } else {
        updates.push('published_at = NULL');
      }
    }

    values.push(postId, req.user.id);

    const post = await withTransaction(async (client) => {
      const updateResult = await client.query(
        `
          UPDATE posts
          SET ${updates.join(', ')}
          WHERE id = $${values.length - 1} AND author_user_id = $${values.length}
          RETURNING *
        `,
        values
      );

      if (updateResult.rowCount === 0) {
        throw notFound('Post not found');
      }

      if (Object.hasOwn(input, 'tagIds')) {
        await replacePostTags(postId, input.tagIds ?? [], client);
      }

      if (Object.hasOwn(input, 'imageMediaIds')) {
        await replacePostImages(postId, input.imageMediaIds ?? [], client);
      }

      return updateResult.rows[0];
    });

    const [tagMap, coverMap, images] = await Promise.all([
      getPostTags([post.id]),
      getCoverMediaByIds(post.cover_media_id ? [post.cover_media_id] : []),
      getPostImages(post.id),
    ]);

    res.json({
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      siteId: post.site_id,
      authorUserId: post.author_user_id,
      contentMd: post.content_md,
      coverMediaId: post.cover_media_id,
      images,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    });
  })
);

adminRouter.delete(
  '/admin/posts/:postId',
  asyncHandler(async (req, res) => {
    const { postId } = validate(postIdParamSchema, req.params);

    const result = await query(
      'DELETE FROM posts WHERE id = $1 AND author_user_id = $2 RETURNING id',
      [postId, req.user.id]
    );

    if (result.rowCount === 0) {
      throw notFound('Post not found');
    }

    res.status(204).send();
  })
);

adminRouter.post(
  '/admin/posts/:postId/publish',
  asyncHandler(async (req, res) => {
    const { postId } = validate(postIdParamSchema, req.params);
    const { publishedAt } = validate(publishPostSchema, req.body ?? {});

    const result = await query(
      `
        UPDATE posts
        SET status = 'published', published_at = COALESCE($1::timestamptz, now())
        WHERE id = $2 AND author_user_id = $3
        RETURNING *
      `,
      [publishedAt ?? null, postId, req.user.id]
    );

    if (result.rowCount === 0) {
      throw notFound('Post not found');
    }

    const post = result.rows[0];
    const [tagMap, coverMap] = await Promise.all([
      getPostTags([post.id]),
      getCoverMediaByIds(post.cover_media_id ? [post.cover_media_id] : []),
    ]);

    res.json({
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      siteId: post.site_id,
      authorUserId: post.author_user_id,
      contentMd: post.content_md,
      coverMediaId: post.cover_media_id,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    });
  })
);

adminRouter.post(
  '/admin/posts/:postId/unpublish',
  asyncHandler(async (req, res) => {
    const { postId } = validate(postIdParamSchema, req.params);

    const result = await query(
      `
        UPDATE posts
        SET status = 'draft', published_at = NULL
        WHERE id = $1 AND author_user_id = $2
        RETURNING *
      `,
      [postId, req.user.id]
    );

    if (result.rowCount === 0) {
      throw notFound('Post not found');
    }

    const post = result.rows[0];
    const [tagMap, coverMap] = await Promise.all([
      getPostTags([post.id]),
      getCoverMediaByIds(post.cover_media_id ? [post.cover_media_id] : []),
    ]);

    res.json({
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      siteId: post.site_id,
      authorUserId: post.author_user_id,
      contentMd: post.content_md,
      coverMediaId: post.cover_media_id,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    });
  })
);

adminRouter.post(
  '/admin/media/upload-url',
  asyncHandler(async (req, res) => {
    const input = validate(createUploadUrlSchema, req.body);

    const objectKey = buildObjectKey(req.user.id, input.filename);
    const expiresAt = new Date(Date.now() + env.uploadUrlTtlSeconds * 1000).toISOString();
    const uploadUrl = createSignedUploadUrl(objectKey, expiresAt);

    res.json({
      uploadUrl,
      method: 'PUT',
      headers: {
        'content-type': input.mimeType,
      },
      objectKey,
      expiresAt,
    });
  })
);

adminRouter.post(
  '/admin/media/complete',
  asyncHandler(async (req, res) => {
    const input = validate(completeUploadSchema, req.body);

    if (!input.objectKey.startsWith(`users/${req.user.id}/`)) {
      throw badRequest('Object key does not belong to current user');
    }

    const result = await query(
      `
        INSERT INTO media (owner_user_id, object_key, url, mime_type, size_bytes, width, height, purpose)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, object_key, url, mime_type, size_bytes, width, height, purpose, created_at
      `,
      [
        req.user.id,
        input.objectKey,
        input.url || buildPublicMediaUrl(input.objectKey),
        input.mimeType,
        input.sizeBytes,
        input.width ?? null,
        input.height ?? null,
        input.purpose,
      ]
    );

    res.status(201).json(mapMedia(result.rows[0]));
  })
);

adminRouter.get(
  '/admin/media',
  asyncHandler(async (req, res) => {
    const { page, pageSize, purpose } = validate(listMediaQuerySchema, req.query);

    const conditions = ['owner_user_id = $1'];
    const params = [req.user.id];

    if (purpose) {
      params.push(purpose);
      conditions.push(`purpose = $${params.length}`);
    }

    const whereSql = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*)::int AS total FROM media WHERE ${whereSql}`, params);
    const total = countResult.rows[0].total;

    const offset = toOffset(page, pageSize);
    params.push(pageSize, offset);

    const result = await query(
      `
        SELECT id, object_key, url, mime_type, size_bytes, width, height, purpose, created_at
        FROM media
        WHERE ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    res.json({
      items: result.rows.map(mapMedia),
      page,
      pageSize,
      total,
    });
  })
);
