'use strict';
/* core/03-face-location.js — مطابقة الوجه (face-api) والتقاط الصورة والموقع GPS */

/* ====== الوجه والموقع ====== */
const FACE_CDNS = ['https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13', 'https://fastly.jsdelivr.net/npm/@vladmandic/face-api@1.7.13', 'https://unpkg.com/@vladmandic/face-api@1.7.13'];
let faceReady = null;
const faceInfo = {};
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('script')); }; document.head.appendChild(s); });
function loadFace() {
  if (faceReady) return faceReady;
  faceReady = (async () => {
    for (const base of FACE_CDNS) { // لو موقع بطيء أو محجوب، بنجرّب اللي بعده
      try {
        const t0 = performance.now();
        if (!window.faceapi) await withTimeout(loadScript(base + '/dist/face-api.js'), 25000);
        faceInfo.scriptMs = Math.round(performance.now() - t0);
        const M = base + '/model/', t1 = performance.now();
        await withTimeout(Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(M), faceapi.nets.faceLandmark68Net.loadFromUri(M), faceapi.nets.faceRecognitionNet.loadFromUri(M)]), 70000);
        faceInfo.modelsMs = Math.round(performance.now() - t1); faceInfo.cdn = new URL(base).hostname;
        return;
      } catch (e) { faceInfo.lastError = e.message; }
    }
    throw new Error('تعذّر تحميل نظام التعرّف على الوجه من الإنترنت. جرّبي تبدّلي الشبكة (واي فاي ↔ بيانات الموبايل) وأعيدي المحاولة.');
  })().catch((e) => { faceReady = null; throw e; });
  return faceReady;
}
async function getCam() { // لو الكاميرا الأمامية بالمواصفات دي مش متاحة نجرّب أي كاميرا
  const md = navigator.mediaDevices;
  try { return await md.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); }
  catch (e) { if (e.name === 'OverconstrainedError' || e.name === 'NotFoundError') return await md.getUserMedia({ video: true, audio: false }); throw e; }
}
const camErr = (e) => ({
  NotAllowedError: 'الكاميرا مش مسموحة: اضغطي على أيقونة القفل جنب الرابط ← الكاميرا ← سماح، وأعيدي المحاولة',
  PermissionDeniedError: 'الكاميرا مش مسموحة: اضغطي على أيقونة القفل جنب الرابط ← الكاميرا ← سماح، وأعيدي المحاولة',
  NotFoundError: 'مفيش كاميرا متاحة على الجهاز',
  NotReadableError: 'الكاميرا مستخدمة من تطبيق تاني، اقفليه وحاولي تاني',
  TrackStartError: 'الكاميرا مستخدمة من تطبيق تاني، اقفليه وحاولي تاني',
  SecurityError: 'لازم تفتحي الموقع من رابط https عشان الكاميرا تشتغل',
}[e && e.name] || (e && e.message) || 'حصلت مشكلة في الكاميرا');
const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
/** يفتح الكاميرا ويرجّع بصمة الوجه (متوسط 3 لقطات). */
function snapPhoto(v) { // صورة صغيرة (360px JPEG) من الكاميرا: حوالي 15-20KB فقط
  const w = 360, h = Math.round((v.videoHeight / v.videoWidth) * w) || 270;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(v, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.62);
}
function captureFace(title, opts = {}) {
  return new Promise((resolve, reject) => {
    let stream, done = false;
    const o = modal(`<h3>${esc(title)}</h3>
      <div class="cam"><video playsinline muted autoplay></video><div class="ring"></div></div>
      <p class="status" id="fst"><span class="spin"></span> جارٍ تجهيز الكاميرا...</p>
      <div class="actions"><button class="btn alt" data-close>إلغاء</button><button class="btn" id="fgo" disabled>التقاط</button></div>`);
    o.dataset.lock = '1';
    const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
    o.onclose = () => { stop(); if (!done) reject(new Error('تم الإلغاء')); };
    const st = (t) => ($('#fst', o).innerHTML = t);
    const fail = (msg) => { st(`<span class="neg">${esc(msg)}</span> <button type="button" class="fdl" id="fdiag2">فحص المشكلة</button>`); const b = $('#fdiag2', o); if (b) b.onclick = faceDiag; };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح لا يدعم الكاميرا (تأكدي من استخدام رابط https)');
        stream = await getCam();
        const v = $('video', o); v.srcObject = stream; await v.play();
        st('<span class="spin"></span> جارٍ تحميل نظام التعرّف على الوجه (أول مرة بس)...');
        await loadFace();
        st('ضعي وجهك داخل الدائرة ثم اضغطي التقاط');
        $('#fgo', o).disabled = false;
        $('#fgo', o).onclick = async () => {
          const btn = $('#fgo', o); btn.disabled = true;
          try {
            const ds = [], N = opts.quick ? 1 : 3; let photo = null;
            for (let i = 0; i < N; i++) {
              st(`<span class="spin"></span> جارٍ التقاط الوجه (${i + 1}/${N})... ثبّتي وجهك`);
              let d = null;
              for (let tries = 0; tries < 6 && !d; tries++) {
                d = await faceapi.detectSingleFace(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
                if (!d) await new Promise((r) => setTimeout(r, 300));
              }
              if (!d) throw new Error('مش لاقي وجه واضح، قرّبي وزوّدي الإضاءة');
              ds.push(Array.from(d.descriptor)); if (opts.photo && !photo) photo = snapPhoto(v);
              if (N > 1) await new Promise((r) => setTimeout(r, 350));
            }
            if (N === 3 && (dist(ds[0], ds[1]) > 0.45 || dist(ds[0], ds[2]) > 0.45)) throw new Error('الوجه اتحرك كتير، حاولي تاني وانتِ ثابتة');
            const avg = N === 1 ? ds[0] : ds[0].map((_, i) => (ds[0][i] + ds[1][i] + ds[2][i]) / 3);
            done = true; stop(); o.remove(); resolve(opts.photo ? { descriptor: avg, photo } : avg);
          } catch (e) { fail(e.message); btn.disabled = false; }
        };
      } catch (e) {
        fail(camErr(e));
      }
    })();
  });
}
async function faceDiag() { // فحص خطوة خطوة: بيبيّن الخطوة اللي بتفشل بالظبط
  const o = modal(`<h3>فحص الكاميرا والتعرّف على الوجه</h3><div class="cam" id="dcam" hidden><video playsinline muted autoplay></video></div>
    <div id="dlist" class="diag"></div><div class="actions"><button class="btn alt" data-close>إغلاق</button><button class="btn" id="dcopy" disabled>نسخ التقرير</button></div>`);
  let stream; const report = [], L = $('#dlist', o);
  o.onclose = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  const step = (label) => {
    const el = document.createElement('div'); el.className = 'diag-row'; el.innerHTML = `<span class="spin"></span><b>${label}</b><span class="dd">جارٍ الفحص...</span>`; L.appendChild(el);
    return (ok, txt) => { el.innerHTML = `<i class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</i><b>${label}</b><span class="dd">${esc(txt)}</span>`; report.push(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${txt}`); return ok; };
  };
  const finish = () => { const b = $('#dcopy', o); if (!b) return; b.disabled = false; b.onclick = () => { navigator.clipboard?.writeText(report.join('\n') + '\n' + navigator.userAgent); toast('تم نسخ التقرير'); }; };
  let r = step('اتصال آمن (https)');
  if (!r(window.isSecureContext, window.isSecureContext ? location.protocol + '//' + location.host : 'الكاميرا والموقع بيشتغلوا على https فقط')) return finish();
  r = step('دعم الكاميرا في المتصفح');
  if (!r(!!navigator.mediaDevices?.getUserMedia, navigator.mediaDevices?.getUserMedia ? 'مدعومة' : 'المتصفح لا يدعم الكاميرا (جرّبي Chrome أو Safari حديث)')) return finish();
  r = step('فتح الكاميرا');
  try { stream = await getCam(); const v = $('video', o); v.srcObject = stream; $('#dcam', o).hidden = false; await v.play(); const t = stream.getVideoTracks()[0], s = t.getSettings(); r(true, `${t.label || 'كاميرا'} · ${s.width || v.videoWidth}×${s.height || v.videoHeight}`); }
  catch (e) { r(false, camErr(e) + ` (${e.name || 'error'})`); return finish(); }
  r = step('تحميل مكتبة الوجه ونماذجها (قد تأخذ وقت أول مرة)');
  const t0 = performance.now();
  try { await loadFace(); r(true, `${faceInfo.cdn || ''} · مكتبة ${faceInfo.scriptMs || 0}ms · نماذج ${faceInfo.modelsMs || 0}ms`); }
  catch (e) { r(false, e.message + (faceInfo.lastError ? ` (${faceInfo.lastError})` : '')); return finish(); }
  r = step('محرّك الحساب');
  let be = ''; try { be = window.faceapi.tf.getBackend(); } catch { /* تجاهل */ }
  r(true, (be || 'غير معروف') + (be === 'cpu' ? ' (بطيء: ممكن يأخذ ثواني)' : ''));
  r = step('اكتشاف وجه (انظري للكاميرا)');
  try {
    const v = $('video', o); let d = null; const t1 = performance.now();
    for (let i = 0; i < 6 && !d; i++) { d = await faceapi.detectSingleFace(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor(); if (!d) await new Promise((x) => setTimeout(x, 400)); }
    r(!!d, d ? `لقيت وجه (ثقة ${Math.round(d.detection.score * 100)}%) في ${Math.round(performance.now() - t1)}ms` : 'ما لقيتش وجه: قرّبي وزوّدي الإضاءة وانظري للكاميرا مباشرة');
    if (d) { r = step('حجم الصورة المرسلة'); const kb = Math.round(snapPhoto(v).length * 0.75 / 1024); r(kb < 120, `${kb}KB`); }
  } catch (e) { r(false, 'فشل التشغيل على هذا الجهاز: ' + e.message); }
  finish();
}
function getPos() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('المتصفح لا يدعم تحديد الموقع'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'لازم تسمحي بالوصول للموقع (GPS)' : 'تعذّر تحديد موقعك، فعّلي الـ GPS وحاولي تاني')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
