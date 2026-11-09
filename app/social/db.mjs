// Arvela Social — veritabanı: Arvela OS ile aynı PostgreSQL sunucusunda ayrı "social" veritabanı.
import pg from 'pg';

const URL = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL || 'postgres://localhost/social';
export let pool;
export const q = (t, p) => pool.query(t, p);
export const all = async (t, p) => (await pool.query(t, p)).rows;
export const one = async (t, p) => (await pool.query(t, p)).rows[0] || null;
export async function withTx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn((t, p) => c.query(t, p)); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}

// Veritabanı yoksa oluşturur (aynı kullanıcı, "postgres" veritabanı üzerinden).
export async function ensureDatabase() {
  const u = new globalThis.URL(URL); const name = u.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(name)) throw new Error('veritabanı adı geçersiz');
  const admin = new globalThis.URL(URL); admin.pathname = '/postgres';
  const c = new pg.Client({ connectionString: admin.toString() });
  try { await c.connect(); const r = await c.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]); if (!r.rowCount) { await c.query(`CREATE DATABASE ${name}`); console.log('veritabanı oluşturuldu:', name); } }
  catch (e) { console.error('veritabanı denetlenemedi:', e.message); } finally { await c.end().catch(() => {}); }
  pool = new pg.Pool({ connectionString: URL, max: 8 });
  if (typeof pool.on === 'function') pool.on('connect', (c) => { c.query(`SET timezone TO 'Europe/Istanbul'`).catch(() => {}); });
}

export async function migrate() {
  // Ay başı ve gün hesapları İstanbul saatine göre (yeni bağlantılarda geçerli)
  await q(`DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Europe/Istanbul'); END $$`);
  await q(`CREATE TABLE IF NOT EXISTS workspaces (id SERIAL PRIMARY KEY, name TEXT NOT NULL, plan TEXT CHECK (plan IN ('solo','business','agency')),
    status TEXT NOT NULL DEFAULT 'deneme' CHECK (status IN ('deneme','aktif','odeme','askida')), trial_ends DATE, paid_until DATE, extra_brands INT NOT NULL DEFAULT 0,
    editor_service BOOLEAN NOT NULL DEFAULT false, requested_plan TEXT, billing JSONB, arvela_client_id INT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','editor','approver')), pass_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
    invite_hash TEXT, invite_expires TIMESTAMPTZ, last_login TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`);
  await q(`CREATE TABLE IF NOT EXISTS brands (id SERIAL PRIMARY KEY, workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, sector TEXT, website TEXT,
    audience TEXT, offer TEXT, tone TEXT, voice_notes TEXT, banned TEXT, pillars JSONB NOT NULL DEFAULT '[]', colors JSONB NOT NULL DEFAULT '{}', font TEXT NOT NULL DEFAULT 'modern',
    logo_id INT, emoji BOOLEAN NOT NULL DEFAULT true, language TEXT NOT NULL DEFAULT 'tr', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS accounts (id SERIAL PRIMARY KEY, brand_id INT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, platform TEXT NOT NULL, handle TEXT NOT NULL,
    best_times TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS media (id SERIAL PRIMARY KEY, workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, brand_id INT REFERENCES brands(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload','render','ai','logo')), mime TEXT NOT NULL, bytes BYTEA NOT NULL, name TEXT, size INT, created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, brand_id INT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    platforms TEXT[] NOT NULL DEFAULT '{}', scheduled_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'taslak' CHECK (status IN ('fikir','taslak','onay','duzeltme','onaylandi','paylasildi','iptal')),
    title TEXT, caption TEXT, hashtags TEXT, first_comment TEXT, visual_brief TEXT, pillar TEXT, format TEXT NOT NULL DEFAULT 'kare', template TEXT, template_data JSONB NOT NULL DEFAULT '{}',
    media_ids INT[] NOT NULL DEFAULT '{}', notes TEXT, ai BOOLEAN NOT NULL DEFAULT false, created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ, published_by INT REFERENCES users(id) ON DELETE SET NULL, reminded_at TIMESTAMPTZ)`);
  await q(`CREATE INDEX IF NOT EXISTS posts_brand_time ON posts(brand_id, scheduled_at)`);
  await q(`CREATE TABLE IF NOT EXISTS post_notes (id SERIAL PRIMARY KEY, post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE SET NULL,
    author TEXT, kind TEXT NOT NULL DEFAULT 'not', body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS audit (id SERIAL PRIMARY KEY, workspace_id INT, user_id INT, action TEXT NOT NULL, detail JSONB, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  await q(`DELETE FROM sessions WHERE expires_at < now()`);
}
