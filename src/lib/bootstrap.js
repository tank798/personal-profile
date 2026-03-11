import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { query, withTransaction } from './db.js';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../db/schema.sql');

function defaultThemeTokens() {
  return {
    bg: '#F6F1EB',
    primary: '#6B4F3A',
    secondary: '#A98C72',
    textPrimary: '#2E2E2E',
    textSecondary: '#7A746E',
    card: '#FFFDF9',
    divider: '#E8DED2',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDatabase(maxAttempts = 20, delayMs = 2000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await query('SELECT 1');
      if (attempt > 1) {
        console.log(`Database is ready after ${attempt} attempts`);
      }
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Database not ready (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function ensureSchema() {
  const existsResult = await query(`SELECT to_regclass('public.users') AS users_table`);
  if (existsResult.rows[0]?.users_table) {
    return;
  }

  let schemaSql = await fs.readFile(schemaPath, 'utf8');
  schemaSql = schemaSql.replace(/^\uFEFF/, '');
  await query(schemaSql);
  console.log('Database schema initialized from db/schema.sql');
}

export async function ensureSingleOwner() {
  const userResult = await query(
    `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [env.adminEmail]
  );

  if (userResult.rowCount === 0) {
    const passwordHash = await hashPassword(env.adminPassword);

    await withTransaction(async (client) => {
      const createdUser = await client.query(
        `
          INSERT INTO users (email, username, password_hash, display_name, bio)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [env.adminEmail, env.adminUsername, passwordHash, env.adminDisplayName, env.adminBio || null]
      );

      await client.query(
        `
          INSERT INTO sites (user_id, slug, title, subtitle, about_md, theme_json)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          createdUser.rows[0].id,
          env.siteSlug,
          env.siteTitle,
          env.siteSubtitle,
          env.siteAboutMd,
          defaultThemeTokens(),
        ]
      );
    });

    console.log(`Single owner initialized: ${env.adminEmail}`);
    return;
  }

  const ownerId = userResult.rows[0].id;

  if (env.syncAdminPasswordOnBoot) {
    const passwordHash = await hashPassword(env.adminPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, ownerId]);
  }

  const siteResult = await query('SELECT id FROM sites WHERE user_id = $1 LIMIT 1', [ownerId]);
  if (siteResult.rowCount === 0) {
    await query(
      `
        INSERT INTO sites (user_id, slug, title, subtitle, about_md, theme_json)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [ownerId, env.siteSlug, env.siteTitle, env.siteSubtitle, env.siteAboutMd, defaultThemeTokens()]
    );
  }
}

