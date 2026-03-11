import { badRequest, notFound } from './errors.js';
import { query } from './db.js';
import { mapMedia, mapTag } from './utils.js';
import { env } from './env.js';

export async function getCurrentUserWithSite(userId) {
  const result = await query(
    `
      SELECT
        u.id,
        u.email::text AS email,
        u.username::text AS username,
        u.display_name,
        u.bio,
        u.avatar_media_id,
        am.url AS avatar_url,
        s.id AS site_id,
        s.slug::text AS site_slug,
        s.title AS site_title,
        s.subtitle AS site_subtitle,
        s.about_md AS site_about_md,
        s.theme_json AS site_theme_json
      FROM users u
      JOIN sites s ON s.user_id = u.id
      LEFT JOIN media am ON am.id = u.avatar_media_id
      WHERE u.id = $1
    `,
    [userId]
  );

  if (result.rowCount === 0) {
    throw notFound('User or site not found');
  }

  return result.rows[0];
}

export async function getPrimarySite() {
  const result = await query(
    `
      SELECT
        s.id AS site_id,
        s.user_id,
        s.slug::text AS site_slug,
        s.title AS site_title,
        s.subtitle AS site_subtitle,
        s.about_md AS site_about_md,
        s.theme_json AS site_theme_json,
        u.username::text AS username,
        u.display_name,
        u.bio,
        am.url AS avatar_url
      FROM sites s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN media am ON am.id = u.avatar_media_id
      WHERE u.email = $1
      LIMIT 1
    `,
    [env.adminEmail]
  );

  if (result.rowCount === 0) {
    throw notFound('Primary site not found');
  }

  return result.rows[0];
}

export async function ensureMediaOwnedByUser(mediaId, userId) {
  if (!mediaId) return;

  const result = await query(
    `SELECT id FROM media WHERE id = $1 AND owner_user_id = $2`,
    [mediaId, userId]
  );

  if (result.rowCount === 0) {
    throw badRequest('Media does not belong to current user');
  }
}

export async function ensurePostOwnedByUser(postId, userId) {
  const result = await query(
    `SELECT p.id, p.site_id FROM posts p WHERE p.id = $1 AND p.author_user_id = $2`,
    [postId, userId]
  );

  if (result.rowCount === 0) {
    throw notFound('Post not found');
  }

  return result.rows[0];
}

export async function getTagsByIdsForSite(siteId, tagIds) {
  if (!tagIds?.length) return [];

  const result = await query(
    `
      SELECT id, name, slug
      FROM tags
      WHERE site_id = $1 AND id = ANY($2::uuid[])
    `,
    [siteId, tagIds]
  );

  if (result.rowCount !== tagIds.length) {
    throw badRequest('Some tags do not belong to current site');
  }

  return result.rows.map(mapTag);
}

export async function replacePostTags(postId, tagIds, client) {
  await client.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);

  if (!tagIds?.length) {
    return;
  }

  for (const tagId of tagIds) {
    await client.query(
      'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)',
      [postId, tagId]
    );
  }
}

export async function listTagsBySite(siteId) {
  const result = await query(
    `
      SELECT id, name, slug
      FROM tags
      WHERE site_id = $1
      ORDER BY name ASC
    `,
    [siteId]
  );

  return result.rows.map(mapTag);
}

export async function getPostTags(postIds) {
  if (!postIds.length) {
    return new Map();
  }

  const result = await query(
    `
      SELECT
        pt.post_id,
        t.id,
        t.name,
        t.slug
      FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.post_id = ANY($1::uuid[])
      ORDER BY t.name ASC
    `,
    [postIds]
  );

  const map = new Map();
  for (const row of result.rows) {
    const list = map.get(row.post_id) ?? [];
    list.push(mapTag(row));
    map.set(row.post_id, list);
  }
  return map;
}

export async function getCoverMediaByIds(mediaIds) {
  if (!mediaIds.length) {
    return new Map();
  }

  const result = await query(
    `
      SELECT id, url, object_key, mime_type, size_bytes, width, height, purpose, created_at
      FROM media
      WHERE id = ANY($1::uuid[])
    `,
    [mediaIds]
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(row.id, mapMedia(row));
  }
  return map;
}

export async function getPostImages(postId) {
  const result = await query(
    `
      SELECT m.id, m.url, m.object_key, m.mime_type, m.size_bytes, m.width, m.height, m.purpose, m.created_at
      FROM post_media pm
      JOIN media m ON m.id = pm.media_id
      WHERE pm.post_id = $1
      ORDER BY pm.position ASC
    `,
    [postId]
  );

  return result.rows.map(mapMedia);
}

