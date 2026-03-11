# Personal Homepage Platform (Single Owner)

This project is now simplified for personal use:

- No public registration
- One admin account from `.env`
- Public website + private `/admin` APIs

## Included

- PostgreSQL schema: `db/schema.sql`
- OpenAPI contract: `api/openapi.yaml`
- Backend API (Node + Express): `src/`
- Frontend pages (mobile-first): `public/`
- Render blueprint: `render.yaml`

## Pages

- Home: `GET /`
- Post detail: `GET /post.html?postId=<uuid>`
- Admin: `GET /admin`

## Core Capabilities

- Admin login (`/api/v1/auth/login`)
- Profile update (avatar, name, bio)
- Site config update (title, subtitle, about)
- Post CRUD + publish/unpublish
- Media upload URL + upload completion
- Public profile/posts/tags APIs

## Quick Start

1. Install dependencies:

```powershell
npm.cmd install
```

2. Create DB and apply schema:

```sql
CREATE DATABASE homepage_platform;
```

```powershell
psql -d homepage_platform -f db/schema.sql
```

3. Create env file:

```powershell
Copy-Item .env.example .env
```

4. Set your admin credentials in `.env`:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`

5. Start API:

```powershell
npm.cmd run start
```

Server: `http://localhost:8080`

## Important Behavior

- On startup, server auto-initializes one owner account if missing.
- Registration endpoint is removed.
- Public APIs are simplified to single-site routes:
  - `GET /api/v1/profile`
  - `GET /api/v1/posts`
  - `GET /api/v1/posts/{postId}`
  - `GET /api/v1/tags`

## Upload Note

`/admin` uses signed upload URL flow. If object storage is not configured, upload will fall back to data-url demo mode for local development.

## Deploy to Render

- Blueprint file is ready: `render.yaml`
- Deployment guide: `docs/render-deploy.md`

## Can You Upload to GitHub?

Yes. Publishing this repository to GitHub allows others to clone and deploy their own copy.
They will still need to configure their own `.env`, database, and object storage.
