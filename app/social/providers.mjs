// Arvela Social — kanal sağlayıcıları: Meta (Facebook sayfası + Instagram işletme) ve LinkedIn (kişisel profil, onaylıysa şirket sayfası).
// Adresler ortam değişkeniyle değiştirilebilir (testlerde sahte sunucu kullanılır). Sürümler: META_GRAPH_VERSION, LINKEDIN_VERSION.
const env = (k, d) => process.env[k] || d;
const GRAPH = () => env('META_GRAPH_URL', 'https://graph.facebook.com').replace(/\/$/, '');
const META_WWW = () => env('META_OAUTH_URL', 'https://www.facebook.com').replace(/\/$/, '');
const GV = () => env('META_GRAPH_VERSION', 'v26.0');
const LI_API = () => env('LINKEDIN_API_URL', 'https://api.linkedin.com').replace(/\/$/, '');
const LI_WWW = () => env('LINKEDIN_OAUTH_URL', 'https://www.linkedin.com').replace(/\/$/, '');
const LIV = () => env('LINKEDIN_VERSION', '202609');
const base = () => String(process.env.SOCIAL_URL || 'https://social.arveladigital.com').replace(/\/$/, '');
export const redirectUri = (prov) => `${base()}/kanallar/${prov}/donus`;

export const META_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'read_insights'];
export const LI_SCOPES = () => ['openid', 'profile', 'w_member_social', ...(process.env.LINKEDIN_ORG === '1' ? ['w_organization_social', 'r_organization_social', 'rw_organization_admin'] : [])];
export const PROVIDERS = {
  meta: { name: 'Instagram + Facebook', ready: () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET) },
  linkedin: { name: 'LinkedIn', ready: () => !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) },
};
// Hesap türü → platform anahtarı (plans.PLATFORMS)
export const KIND_PLATFORM = { fb_page: 'facebook', ig_business: 'instagram', li_person: 'linkedin', li_org: 'linkedin' };

export class ProviderError extends Error {
  constructor(msg, { auth = false, retry = true, code } = {}) { super(msg); this.auth = auth; this.retry = retry; this.code = code; }
}
async function call(url, opts = {}) {
  let r; try { r = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || 60_000) }); } catch (e) { throw new ProviderError('Platforma ulaşılamadı: ' + e.message); }
  const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text.slice(0, 300) }; }
  return { r, j };
}
const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));

// ---------------- Meta ----------------
function metaErr(j, status) {
  const e = j?.error || {}; const code = e.code; const msg = e.error_user_msg || e.message || `Meta hatası (${status})`;
  const auth = code === 190 || code === 102 || e.type === 'OAuthException' && /session|expired|token/i.test(e.message || '');
  const perm = code === 10 || code === 200 || (code >= 200 && code < 300);
  const rate = code === 4 || code === 17 || code === 32 || code === 613 || status === 429;
  return new ProviderError(perm ? `İzin eksik: ${msg}` : msg, { auth, retry: !auth && !perm && (rate || status >= 500 || code === 2 || code === 1), code });
}
async function graph(method, path, params = {}, token) {
  const u = new URL(`${GRAPH()}/${GV()}/${path.replace(/^\//, '')}`);
  const p = { ...params, ...(token ? { access_token: token } : {}) };
  const opts = { method };
  if (method === 'GET') for (const [k, v] of Object.entries(p)) u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  else { opts.body = form(p); opts.headers = { 'content-type': 'application/x-www-form-urlencoded' }; }
  const { r, j } = await call(u, opts); if (!r.ok || j?.error) throw metaErr(j, r.status); return j;
}
export const meta = {
  authUrl(state) {
    const u = new URL(`${META_WWW()}/${GV()}/dialog/oauth`);
    u.search = form({ client_id: process.env.META_APP_ID, redirect_uri: redirectUri('meta'), state, response_type: 'code', scope: META_SCOPES.join(',') }).toString(); return u.toString();
  },
  // Kod → uzun ömürlü kullanıcı anahtarı → sayfalar (+ bağlı Instagram işletme hesapları)
  async connect(code) {
    const short = await graph('GET', 'oauth/access_token', { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri('meta'), code });
    const long = await graph('GET', 'oauth/access_token', { grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token });
    const pages = await graph('GET', 'me/accounts', { fields: 'id,name,access_token,picture{url},followers_count,instagram_business_account{id,username,name,profile_picture_url,followers_count}', limit: 100 }, long.access_token);
    const out = [];
    for (const pg of pages.data || []) {
      out.push({ kind: 'fb_page', external_id: pg.id, name: pg.name, handle: pg.name, avatar: pg.picture?.data?.url || null, token: pg.access_token, followers: pg.followers_count ?? null, expires: null });
      const ig = pg.instagram_business_account;
      if (ig?.id) out.push({ kind: 'ig_business', external_id: ig.id, name: ig.name || ig.username, handle: ig.username ? '@' + ig.username : ig.id, avatar: ig.profile_picture_url || null, token: pg.access_token, followers: ig.followers_count ?? null, expires: null, page_id: pg.id });
    }
    return out;
  },
  async publish(acc, token, post, media) {
    const text = post.text;
    if (acc.kind === 'fb_page') {
      let id;
      if (!media.length) id = (await graph('POST', `${acc.external_id}/feed`, { message: text }, token)).id;
      else if (media.length === 1) { const r = await graph('POST', `${acc.external_id}/photos`, { url: media[0].url, message: text }, token); id = r.post_id || r.id; }
      else {
        const ids = []; for (const m of media.slice(0, 10)) ids.push((await graph('POST', `${acc.external_id}/photos`, { url: m.url, published: 'false' }, token)).id);
        id = (await graph('POST', `${acc.external_id}/feed`, { message: text, attached_media: ids.map(x => ({ media_fbid: x })) }, token)).id;
      }
      if (post.first_comment) await graph('POST', `${id}/comments`, { message: post.first_comment }, token).catch(() => {});
      return { id, url: `https://www.facebook.com/${id}` };
    }
    if (acc.kind === 'ig_business') {
      const imgs = media.filter(m => m.mime === 'image/jpeg');
      if (!imgs.length) throw new ProviderError(media.length ? 'Instagram yalnız JPEG görsel kabul ediyor; görseli JPEG olarak yeniden kaydedin.' : 'Instagram gönderisi için en az bir görsel gerekli.', { retry: false });
      let creation;
      if (imgs.length === 1) creation = (await graph('POST', `${acc.external_id}/media`, { image_url: imgs[0].url, caption: text }, token)).id;
      else {
        const kids = []; for (const m of imgs.slice(0, 10)) kids.push((await graph('POST', `${acc.external_id}/media`, { image_url: m.url, is_carousel_item: 'true' }, token)).id);
        creation = (await graph('POST', `${acc.external_id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: text }, token)).id;
      }
      for (let i = 0; i < 15; i++) { // kapsayıcı hazır olana kadar bekle (görsellerde genelde hemen)
        const s = await graph('GET', creation, { fields: 'status_code' }, token);
        if (s.status_code === 'FINISHED' || !s.status_code) break;
        if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new ProviderError('Instagram görseli işleyemedi.', { retry: false });
        await new Promise(r => setTimeout(r, Number(process.env.META_POLL_MS || 2000)));
      }
      const id = (await graph('POST', `${acc.external_id}/media_publish`, { creation_id: creation }, token)).id;
      const link = await graph('GET', id, { fields: 'permalink' }, token).catch(() => ({}));
      if (post.first_comment) await graph('POST', `${id}/comments`, { message: post.first_comment }, token).catch(() => {});
      return { id, url: link.permalink || null };
    }
    throw new ProviderError('Bilinmeyen hesap türü.', { retry: false });
  },
  async postMetrics(acc, token, extId) {
    if (acc.kind === 'ig_business') {
      let j; try { j = await graph('GET', `${extId}/insights`, { metric: 'reach,likes,comments,saved,shares,views' }, token); }
      catch { j = await graph('GET', `${extId}/insights`, { metric: 'reach,likes,comments' }, token); }
      const m = {}; for (const d of j.data || []) m[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? 0; return m;
    }
    const j = await graph('GET', extId, { fields: 'shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)' }, token);
    return { likes: j.reactions?.summary?.total_count ?? 0, comments: j.comments?.summary?.total_count ?? 0, shares: j.shares?.count ?? 0 };
  },
  async followers(acc, token) {
    const j = await graph('GET', acc.external_id, { fields: 'followers_count' }, token); return j.followers_count ?? null;
  },
};

// ---------------- LinkedIn ----------------
// Gönderi metni "little text" biçiminde: ayrılmış karakterler kaçışlanır, #etiketler hashtag olarak işaretlenir.
export function liEscape(text) {
  const esc = (t) => t.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => '\\' + c);
  return String(text || '').split(/(#[\p{L}\p{N}_]+)/u).map((part, i) => i % 2 ? `{hashtag|\\#|${part.slice(1)}}` : esc(part)).join('');
}
function liErr(j, status) {
  const msg = j?.message || j?.error_description || `LinkedIn hatası (${status})`;
  return new ProviderError(status === 403 ? `İzin eksik: ${msg}` : msg, { auth: status === 401, retry: status === 429 || status >= 500, code: j?.serviceErrorCode || j?.code });
}
const liHead = (token, json = true) => ({ Authorization: 'Bearer ' + token, 'Linkedin-Version': LIV(), 'X-Restli-Protocol-Version': '2.0.0', ...(json ? { 'content-type': 'application/json' } : {}) });
export const linkedin = {
  authUrl(state) {
    const u = new URL(`${LI_WWW()}/oauth/v2/authorization`);
    u.search = form({ response_type: 'code', client_id: process.env.LINKEDIN_CLIENT_ID, redirect_uri: redirectUri('linkedin'), state, scope: LI_SCOPES().join(' ') }).toString(); return u.toString();
  },
  async connect(code) {
    const { r, j } = await call(`${LI_WWW()}/oauth/v2/accessToken`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri('linkedin'), client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET }) });
    if (!r.ok || !j.access_token) throw liErr(j, r.status);
    const token = j.access_token; const expires = j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null;
    const me = await call(`${LI_API()}/v2/userinfo`, { headers: { Authorization: 'Bearer ' + token } }); if (!me.r.ok) throw liErr(me.j, me.r.status);
    const out = [{ kind: 'li_person', external_id: 'urn:li:person:' + me.j.sub, name: me.j.name || 'LinkedIn profili', handle: me.j.name || me.j.sub, avatar: me.j.picture || null, token, expires, followers: null }];
    if (process.env.LINKEDIN_ORG === '1') { // şirket sayfaları (Community Management onayı gerekir)
      const o = await call(`${LI_API()}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, { headers: liHead(token, false) });
      for (const el of o.r.ok ? o.j.elements || [] : []) {
        const urn = el.organization; const id = String(urn).split(':').pop();
        const org = await call(`${LI_API()}/rest/organizations/${id}`, { headers: liHead(token, false) });
        out.push({ kind: 'li_org', external_id: urn, name: org.j?.localizedName || urn, handle: org.j?.vanityName || id, avatar: null, token, expires, followers: null });
      }
    }
    return out;
  },
  async upload(owner, token, m) {
    const init = await call(`${LI_API()}/rest/images?action=initializeUpload`, { method: 'POST', headers: liHead(token), body: JSON.stringify({ initializeUploadRequest: { owner } }) });
    if (!init.r.ok) throw liErr(init.j, init.r.status);
    const put = await call(init.j.value.uploadUrl, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'content-type': m.mime }, body: m.bytes, timeout: 120_000 });
    if (!put.r.ok) throw liErr(put.j, put.r.status);
    return init.j.value.image;
  },
  async publish(acc, token, post, media) {
    const imgs = media.filter(m => /^image\/(jpeg|png|gif)$/.test(m.mime)).slice(0, 20); const ids = [];
    for (const m of imgs) ids.push(await linkedin.upload(acc.external_id, token, m));
    const body = { author: acc.external_id, commentary: liEscape(post.text), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false };
    if (ids.length === 1) body.content = { media: { id: ids[0] } }; else if (ids.length > 1) body.content = { multiImage: { images: ids.map(id => ({ id })) } };
    const { r, j } = await call(`${LI_API()}/rest/posts`, { method: 'POST', headers: liHead(token), body: JSON.stringify(body) });
    if (!r.ok) throw liErr(j, r.status);
    const id = r.headers.get('x-restli-id') || j.id; return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
  },
  async postMetrics(acc, token, extId) {
    if (acc.kind !== 'li_org') return null; // kişisel profil istatistikleri LinkedIn tarafından kapalı
    const u = `${LI_API()}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(acc.external_id)}&shares=List(${encodeURIComponent(extId)})`;
    const { r, j } = await call(u, { headers: liHead(token, false) }); if (!r.ok) throw liErr(j, r.status);
    const s = j.elements?.[0]?.totalShareStatistics || {}; return { views: s.impressionCount ?? 0, likes: s.likeCount ?? 0, comments: s.commentCount ?? 0, shares: s.shareCount ?? 0, clicks: s.clickCount ?? 0 };
  },
  async followers(acc, token) {
    if (acc.kind !== 'li_org') return null;
    const { r, j } = await call(`${LI_API()}/rest/networkSizes/${encodeURIComponent(acc.external_id)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, { headers: liHead(token, false) });
    return r.ok ? j.firstDegreeSize ?? null : null;
  },
};
export const providerFor = (kind) => (kind === 'fb_page' || kind === 'ig_business') ? meta : (kind === 'li_person' || kind === 'li_org') ? linkedin : null;
