# Backend Implementation Notes (Single Owner)

## 1. Product Mode

- Single-owner deployment
- No registration endpoint
- One admin account configured via `.env`

## 2. Auto Initialization

At server startup:

1. If `ADMIN_EMAIL` does not exist in DB, create user + site.
2. If user exists but site missing, create site.
3. Optionally sync password on boot (`SYNC_ADMIN_PASSWORD_ON_BOOT=true`).

## 3. Upload Flow (Avatar/Cover/Post Images)

1. `POST /api/v1/admin/media/upload-url`
2. Browser uploads file directly to object storage with PUT
3. `POST /api/v1/admin/media/complete`
4. Bind returned `media.id` in profile/post APIs

## 4. Public API (Single Site)

- `GET /api/v1/profile`
- `GET /api/v1/posts`
- `GET /api/v1/posts/{postId}`
- `GET /api/v1/tags`

## 5. Admin API

- `POST /api/v1/auth/login`
- `GET /api/v1/me`
- `PUT /api/v1/admin/profile`
- `PUT /api/v1/admin/site`
- `POST/GET/PUT/DELETE /api/v1/admin/posts...`
- `POST /api/v1/admin/media/upload-url`
- `POST /api/v1/admin/media/complete`
- `GET /api/v1/admin/media`

## 6. Deployment Note

You can upload this repo to GitHub. Other users can deploy their own instance by setting their own `.env` values.
