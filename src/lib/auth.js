import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { unauthorized } from './errors.js';
import { query } from './db.js';

const SALT_ROUNDS = 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresInSeconds }
  );
}

export function authRequired() {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      next(unauthorized('Missing bearer token'));
      return;
    }

    try {
      const payload = jwt.verify(match[1], env.jwtSecret);
      const userId = payload.sub;

      const result = await query(
        `
          SELECT id, email::text AS email, username::text AS username, display_name, bio, avatar_media_id
          FROM users
          WHERE id = $1
        `,
        [userId]
      );

      if (result.rowCount === 0) {
        next(unauthorized('Invalid token user'));
        return;
      }

      req.user = {
        id: result.rows[0].id,
        email: result.rows[0].email,
        username: result.rows[0].username,
        displayName: result.rows[0].display_name,
        bio: result.rows[0].bio,
        avatarMediaId: result.rows[0].avatar_media_id,
      };

      next();
    } catch {
      next(unauthorized('Invalid bearer token'));
    }
  };
}
