import { z } from 'zod';
import { badRequest } from './errors.js';

export const uuidSchema = z.string().uuid();

const slugPattern = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(64),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
  avatarMediaId: uuidSchema.nullable().optional(),
});

export const updateSiteSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  subtitle: z.string().max(180).nullable().optional(),
  aboutMd: z.string().nullable().optional(),
  theme: z.record(z.string(), z.any()).optional(),
});

export const postStatusSchema = z.enum(['draft', 'published', 'archived']);

export const createPostSchema = z.object({
  title: z.string().min(1).max(160),
  slug: z.string().regex(slugPattern),
  summary: z.string().max(300).optional(),
  contentMd: z.string().min(1),
  coverMediaId: uuidSchema.nullable().optional(),
  tagIds: z.array(uuidSchema).optional(),
  isPinned: z.boolean().optional(),
  status: postStatusSchema.optional(),
});

export const updatePostSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  slug: z.string().regex(slugPattern).optional(),
  summary: z.string().max(300).nullable().optional(),
  contentMd: z.string().min(1).optional(),
  coverMediaId: uuidSchema.nullable().optional(),
  tagIds: z.array(uuidSchema).optional(),
  isPinned: z.boolean().optional(),
  status: postStatusSchema.optional(),
});

export const createUploadUrlSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  purpose: z.enum(['avatar', 'cover', 'post', 'site']),
});

export const completeUploadSchema = z.object({
  objectKey: z.string().min(1),
  url: z.string().url().optional(),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(1),
  width: z.number().int().min(1).nullable().optional(),
  height: z.number().int().min(1).nullable().optional(),
  purpose: z.enum(['avatar', 'cover', 'post', 'site']),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const listAdminPostsQuerySchema = paginationQuerySchema.extend({
  status: postStatusSchema.optional(),
  keyword: z.string().max(80).optional(),
});

export const listPublicPostsQuerySchema = paginationQuerySchema.extend({
  tag: z.string().max(40).optional(),
});

export const listMediaQuerySchema = paginationQuerySchema.extend({
  purpose: z.enum(['avatar', 'cover', 'post', 'site']).optional(),
});

export const publishPostSchema = z.object({
  publishedAt: z.string().datetime().optional(),
});

export const postIdParamSchema = z.object({
  postId: uuidSchema,
});

export function validate(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest('Validation failed', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}
