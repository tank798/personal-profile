import { Router } from 'express';
import { asyncHandler, notFound } from '../lib/errors.js';
import { query } from '../lib/db.js';
import {
  getCoverMediaByIds,
  getPostImages,
  getPostTags,
  getPrimarySite,
  listTagsBySite,
} from '../lib/repositories.js';
import {
  listPublicPostsQuerySchema,
  postIdParamSchema,
  validate,
} from '../lib/validators.js';
import { mapPostSummary, toOffset, toSite } from '../lib/utils.js';

export const publicRouter = Router();

publicRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const siteRow = await getPrimarySite();

    res.json({
      username: siteRow.username,
      displayName: siteRow.display_name,
      bio: siteRow.bio,
      avatarUrl: siteRow.avatar_url,
      site: toSite(siteRow),
    });
  })
);

publicRouter.get(
  '/posts',
  asyncHandler(async (req, res) => {
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
        SELECT p.id, p.slug, p.title, p.summary, p.cover_media_id, p.status, p.is_pinned, p.published_at
        FROM posts p
        WHERE ${whereSql}
        ORDER BY p.is_pinned DESC, p.published_at DESC NULLS LAST, p.created_at DESC
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

    const items = rows.map((row) =>
      mapPostSummary(row, tagMap.get(row.id) ?? [], row.cover_media_id ? coverMap.get(row.cover_media_id) ?? null : null)
    );

    res.json({
      items,
      page,
      pageSize,
      total,
    });
  })
);

publicRouter.get(
  '/posts/:postId',
  asyncHandler(async (req, res) => {
    const { postId } = validate(postIdParamSchema, req.params);
    const siteRow = await getPrimarySite();

    const postResult = await query(
      `
        SELECT p.id, p.slug, p.title, p.summary, p.content_md, p.cover_media_id, p.status, p.is_pinned,
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
      getCoverMediaByIds(post.cover_media_id ? [post.cover_media_id] : []),
      getPostImages(post.id),
    ]);

    res.json({
      ...mapPostSummary(
        post,
        tagMap.get(post.id) ?? [],
        post.cover_media_id ? coverMap.get(post.cover_media_id) ?? null : null
      ),
      contentMd: post.content_md,
      images,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    });
  })
);

publicRouter.get(
  '/tags',
  asyncHandler(async (req, res) => {
    const siteRow = await getPrimarySite();
    const items = await listTagsBySite(siteRow.site_id);
    res.json({ items });
  })
);
