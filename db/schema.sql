BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE media_purpose AS ENUM ('avatar', 'cover', 'post', 'site');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  username citext NOT NULL,
  password_hash text NOT NULL,
  display_name varchar(80) NOT NULL,
  bio varchar(280),
  avatar_media_id uuid,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format_chk CHECK (position('@' in email::text) > 1),
  CONSTRAINT users_username_format_chk CHECK (username::text ~ '^[a-z0-9][a-z0-9_-]{2,31}$')
);

CREATE UNIQUE INDEX ux_users_email ON users (email);
CREATE UNIQUE INDEX ux_users_username ON users (username);

CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug citext NOT NULL,
  title varchar(120) NOT NULL,
  subtitle varchar(180),
  about_md text,
  theme_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT uq_sites_user UNIQUE (user_id),
  CONSTRAINT sites_slug_format_chk CHECK (slug::text ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')
);

CREATE UNIQUE INDEX ux_sites_slug ON sites (slug);

CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  object_key text NOT NULL,
  url text NOT NULL,
  mime_type varchar(120) NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  purpose media_purpose NOT NULL,
  provider varchar(32) NOT NULL DEFAULT 's3',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT uq_media_object_key UNIQUE (object_key),
  CONSTRAINT media_url_not_empty_chk CHECK (length(trim(url)) > 0)
);

CREATE INDEX ix_media_owner_created ON media (owner_user_id, created_at DESC);
CREATE INDEX ix_media_purpose ON media (purpose);

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  name varchar(32) NOT NULL,
  slug varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_tags_site FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE,
  CONSTRAINT uq_tags_site_slug UNIQUE (site_id, slug),
  CONSTRAINT tags_slug_format_chk CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$')
);

CREATE INDEX ix_tags_site_name ON tags (site_id, name);

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  slug varchar(80) NOT NULL,
  title varchar(160) NOT NULL,
  summary varchar(300),
  content_md text NOT NULL,
  cover_media_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  status post_status NOT NULL DEFAULT 'draft',
  is_pinned boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_posts_site FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_author FOREIGN KEY (author_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_cover_media FOREIGN KEY (cover_media_id) REFERENCES media (id) ON DELETE SET NULL,
  CONSTRAINT uq_posts_site_slug UNIQUE (site_id, slug),
  CONSTRAINT posts_slug_format_chk CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  CONSTRAINT posts_publish_rule_chk CHECK (
    (status = 'published' AND published_at IS NOT NULL)
    OR (status <> 'published')
  )
);

CREATE INDEX ix_posts_site_status_published ON posts (site_id, status, published_at DESC NULLS LAST);
CREATE INDEX ix_posts_author_created ON posts (author_user_id, created_at DESC);
CREATE INDEX ix_posts_site_pinned_created ON posts (site_id, is_pinned DESC, created_at DESC);
CREATE INDEX ix_posts_site_sort_order ON posts (site_id, sort_order ASC, created_at DESC);

CREATE TABLE post_tags (
  post_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, tag_id),
  CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_post_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);

CREATE INDEX ix_post_tags_tag_post ON post_tags (tag_id, post_id);

CREATE TABLE post_media (
  post_id uuid NOT NULL,
  media_id uuid NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, media_id),
  CONSTRAINT fk_post_media_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_post_media_media FOREIGN KEY (media_id) REFERENCES media (id) ON DELETE CASCADE,
  CONSTRAINT uq_post_media_position UNIQUE (post_id, position),
  CONSTRAINT post_media_position_chk CHECK (position >= 0)
);

CREATE INDEX ix_post_media_post_position ON post_media (post_id, position);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  refresh_token_hash text NOT NULL,
  user_agent text,
  ip inet,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT auth_sessions_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX ix_auth_sessions_user_expires ON auth_sessions (user_id, expires_at DESC);

ALTER TABLE users
  ADD CONSTRAINT fk_users_avatar_media
  FOREIGN KEY (avatar_media_id) REFERENCES media (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sites_set_updated_at
BEFORE UPDATE ON sites
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
