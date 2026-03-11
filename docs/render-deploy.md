# Render Deployment Guide

## What is included

- `render.yaml` defines:
  - 1 Node web service (`personal-homepage-site`)
  - 1 PostgreSQL database (`personal-homepage-db`)

## Before deploy

1. Push this project to GitHub.
2. In Render dashboard, create new Blueprint and select the repository.
3. Fill required env vars in Render:
   - `CORS_ORIGINS` (set to your Render URL, e.g. `https://personal-homepage-site.onrender.com`)
   - `ADMIN_EMAIL`
   - `ADMIN_USERNAME`
   - `ADMIN_DISPLAY_NAME`
   - `ADMIN_PASSWORD`
   - Optional profile/site fields (`ADMIN_BIO`, `SITE_TITLE`, etc.)

## Deploy steps

1. Render Dashboard -> New -> Blueprint.
2. Select your GitHub repo.
3. Render reads `render.yaml`.
4. Set required env vars.
5. Click Deploy.

## After deploy

- Public site: `https://<your-service>.onrender.com/`
- Admin page: `https://<your-service>.onrender.com/admin`

## Notes

- Startup auto-creates the owner account if missing.
- First cold start on free plan can be slow.
- If object storage vars are not configured, admin upload falls back to data-url demo mode.
