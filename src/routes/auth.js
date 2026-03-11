import { Router } from 'express';
import { asyncHandler, unauthorized } from '../lib/errors.js';
import { signAccessToken, verifyPassword, authRequired } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { query } from '../lib/db.js';
import { validate, loginSchema } from '../lib/validators.js';
import { getCurrentUserWithSite } from '../lib/repositories.js';
import { toSite, toUserBrief } from '../lib/utils.js';

export const authRouter = Router();

authRouter.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const input = validate(loginSchema, req.body);

    if (input.email.toLowerCase() !== env.adminEmail.toLowerCase()) {
      throw unauthorized('Invalid email or password');
    }

    const result = await query(
      `
        SELECT
          u.id,
          u.email::text AS email,
          u.username::text AS username,
          u.password_hash,
          u.display_name,
          u.bio,
          u.avatar_media_id,
          am.url AS avatar_url
        FROM users u
        LEFT JOIN media am ON am.id = u.avatar_media_id
        WHERE u.email = $1
        LIMIT 1
      `,
      [env.adminEmail]
    );

    if (result.rowCount === 0) {
      throw unauthorized('Admin account is not initialized');
    }

    const user = result.rows[0];
    const isValid = await verifyPassword(input.password, user.password_hash);

    if (!isValid) {
      throw unauthorized('Invalid email or password');
    }

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    const accessToken = signAccessToken({ id: user.id, username: user.username });

    res.json({
      accessToken,
      expiresIn: env.jwtExpiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        bio: user.bio,
        avatarUrl: user.avatar_url,
        avatarMediaId: user.avatar_media_id,
      },
    });
  })
);

authRouter.post(
  '/auth/logout',
  authRequired(),
  asyncHandler(async (req, res) => {
    res.status(204).send();
  })
);

authRouter.get(
  '/me',
  authRequired(),
  asyncHandler(async (req, res) => {
    const row = await getCurrentUserWithSite(req.user.id);

    res.json({
      user: toUserBrief(row),
      site: toSite(row),
    });
  })
);
