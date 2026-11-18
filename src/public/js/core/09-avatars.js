'use strict';
/* core/09-avatars.js — صورة البروفايل: أول بصمة بتبقى الصورة، وتتبدّل يدوي. أي عنصر عليه data-uav بيتملي بالصورة */
const avCache = new Map();
const avAttr = (u) => (u && u.has_avatar ? ` data-uav="${Number(u.id)}"` : '');
function loadAvatar(id) {
  if (!avCache.has(id)) {
    avCache.set(id, fetch(`/api/users/${Number(id)}/avatar`, { headers: { Authorization: 'Bearer ' + S.token }, cache: 'no-cache' })
      .then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null)
      .then((u) => { if (!u) avCache.delete(id); return u; }));
  }
  return avCache.get(id);
}
function paintAvatars(root) {
  (root || document).querySelectorAll('[data-uav]:not(.has-img)').forEach((el) => {
    loadAvatar(el.dataset.uav).then((u) => { if (u) { el.style.backgroundImage = `url("${u}")`; el.classList.add('has-img'); } });
  });
}
function resetAvatar(id) { avCache.delete(Number(id)); avCache.delete(String(id)); document.querySelectorAll(`[data-uav="${id}"]`).forEach((e) => { e.classList.remove('has-img'); e.style.backgroundImage = ''; }); }
// اختيار صورة وتصغيرها (400px) قبل الرفع
function pickAvatar(userId, done) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = async () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 400;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 400, 400);
      URL.revokeObjectURL(url);
      try { await api(`/users/${userId}/avatar`, 'POST', { photo: c.toDataURL('image/jpeg', 0.85) }); resetAvatar(userId); toast('تم تغيير صورة البروفايل'); if (done) done(); } catch (e) { toast(e.message, true); }
    };
    img.onerror = () => toast('الصورة غير صالحة', true);
    img.src = url;
  };
  inp.click();
}
(() => {
  let t; const go = () => { clearTimeout(t); t = setTimeout(() => paintAvatars(), 60); };
  const start = () => { if (typeof MutationObserver !== 'undefined') new MutationObserver(go).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
