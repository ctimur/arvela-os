// Arvela Social — paketler, sınırlar ve sabit sözlükler. Katalogdaki SAAS-01…06 ile aynı.
export const TRIAL_DAYS = 14;
export const PLANS = {
  solo: { code: 'SAAS-01', name: 'Solo', brands: 1, users: 1, accounts: 2, postsPerMonth: 30, approvals: false, clientLinks: false, aiImages: false, aiPerMonth: 40, aiImagesPerMonth: 0 },
  business: { code: 'SAAS-02', name: 'Business', brands: 1, users: 3, accounts: 5, postsPerMonth: 60, approvals: true, clientLinks: false, aiImages: false, aiPerMonth: 150, aiImagesPerMonth: 0 },
  agency: { code: 'SAAS-03', name: 'Agency', brands: 5, users: 10, accounts: 25, postsPerMonth: 200, approvals: true, clientLinks: true, aiImages: true, aiPerMonth: 500, aiImagesPerMonth: 60 },
};
// Deneme süresinde Business özellikleri açıktır.
export const TRIAL_PLAN = 'business';
export const TRIAL_AI = 40;
export const EXTRAS = { extra_brand: { code: 'SAAS-04', name: 'Ek marka' }, setup: { code: 'SAAS-05', name: 'Kurulum ve marka eğitimi' }, editor: { code: 'SAAS-06', name: 'İnsan editör kontrolü' } };

export const WS_ST = { deneme: 'Deneme', aktif: 'Aktif', odeme: 'Ödeme bekleniyor', askida: 'Askıda' };
export const ROLES = { owner: 'Sahip', editor: 'Editör', approver: 'Onaylayıcı' };
export const PLATFORMS = {
  instagram: { name: 'Instagram', max: 2200, tags: 30 }, facebook: { name: 'Facebook', max: 63206, tags: 10 }, tiktok: { name: 'TikTok', max: 2200, tags: 10 },
  linkedin: { name: 'LinkedIn', max: 3000, tags: 5 }, x: { name: 'X', max: 280, tags: 3 }, youtube: { name: 'YouTube', max: 5000, tags: 15 }, gbp: { name: 'Google İşletme', max: 1500, tags: 0 },
};
export const POST_ST = { fikir: 'Fikir', taslak: 'Taslak', onay: 'Onay bekliyor', duzeltme: 'Düzeltme istendi', onaylandi: 'Onaylandı', paylasildi: 'Paylaşıldı', iptal: 'İptal' };
export const POST_TONE = { fikir: '', taslak: '', onay: 'warn', duzeltme: 'bad', onaylandi: 'ok', paylasildi: 'ok', iptal: '' };
export const FORMATS = { kare: { name: 'Kare 1:1', w: 1080, h: 1080 }, dikey: { name: 'Dikey 4:5', w: 1080, h: 1350 }, hikaye: { name: 'Hikâye 9:16', w: 1080, h: 1920 } };

// Çalışma alanının geçerli sınırları (deneme → Business; ek marka eklenir)
export function limits(ws, now = new Date()) {
  const trial = ws.status === 'deneme' && ws.trial_ends && new Date(ws.trial_ends) >= new Date(now.toDateString());
  const p = PLANS[ws.plan] || (trial ? PLANS[TRIAL_PLAN] : null);
  const base = p || PLANS[TRIAL_PLAN];
  // Denemede yapay zekâ kullanımı sınırlı (maliyet): 40 istek
  return { ...base, brands: base.brands + Number(ws.extra_brands || 0), trial, usable: canUse(ws, now), ...(ws.status === 'deneme' ? { aiPerMonth: TRIAL_AI, aiImagesPerMonth: 0 } : {}) };
}
// Kullanılabilir mi: deneme sürüyor ya da aktif (ödeme tarihi geçmemiş). Askıdaysa salt okunur.
export function canUse(ws, now = new Date()) {
  const today = new Date(now.toDateString());
  if (ws.status === 'askida') return false;
  if (ws.status === 'deneme') return !!ws.trial_ends && new Date(ws.trial_ends) >= today;
  if (ws.status === 'aktif') return !ws.paid_until || new Date(ws.paid_until) >= new Date(today.getTime() - 7 * 864e5); // 7 gün tolerans
  return ws.status === 'odeme' && !!ws.trial_ends && new Date(ws.trial_ends) >= today;
}

// Durum geçişleri: kim, hangi durumdan, nereye
export function transition(action, post, role, lim) {
  const T = {
    onaya: { from: ['fikir', 'taslak', 'duzeltme'], to: 'onay', roles: ['owner', 'editor'], need: 'approvals' },
    onayla: { from: lim.approvals ? ['onay'] : ['fikir', 'taslak', 'duzeltme', 'onay'], to: 'onaylandi', roles: lim.approvals ? ['owner', 'approver'] : ['owner', 'editor'] },
    duzeltme: { from: ['onay', 'onaylandi'], to: 'duzeltme', roles: ['owner', 'approver'] },
    paylasildi: { from: ['onaylandi', ...(lim.approvals ? [] : ['taslak'])], to: 'paylasildi', roles: ['owner', 'editor'] },
    taslak: { from: ['fikir', 'iptal', 'duzeltme', 'onaylandi', 'onay'], to: 'taslak', roles: ['owner', 'editor'] },
    iptal: { from: ['fikir', 'taslak', 'onay', 'duzeltme', 'onaylandi'], to: 'iptal', roles: ['owner', 'editor'] },
  }[action];
  if (!T) return { error: 'Geçersiz işlem.' };
  if (T.need && !lim[T.need]) return { error: 'Onay akışı Business ve Agency paketlerinde var.' };
  if (!T.roles.includes(role)) return { error: 'Bu işlem için yetkiniz yok.' };
  if (!T.from.includes(post.status)) return { error: `"${POST_ST[post.status]}" durumundaki gönderide bu işlem yapılamaz.` };
  return { to: T.to };
}
