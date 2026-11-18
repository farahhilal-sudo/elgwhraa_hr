'use strict';
/* core/03-face-location.js — مطابقة الوجه (face-api) والتقاط الصورة والموقع GPS */

/* ====== الوجه والموقع ====== */
const FACE_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13';
let faceReady = null;
function loadFace() {
  if (faceReady) return faceReady;
  faceReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = FACE_CDN + '/dist/face-api.js';
    s.onload = async () => {
      try {
        const M = FACE_CDN + '/model/';
        await faceapi.nets.tinyFaceDetector.loadFromUri(M);
        await faceapi.nets.faceLandmark68Net.loadFromUri(M);
        await faceapi.nets.faceRecognitionNet.loadFromUri(M);
        resolve();
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('تعذّر تحميل نظام التعرّف على الوجه، تأكدي من الإنترنت'));
    document.head.appendChild(s);
  }).catch((e) => { faceReady = null; throw e; });
  return faceReady;
}
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
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح لا يدعم الكاميرا (تأكدي من استخدام رابط https)');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        const v = $('video', o); v.srcObject = stream; await v.play();
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
          } catch (e) { st(`<span class="neg">${esc(e.message)}</span>`); btn.disabled = false; }
        };
      } catch (e) {
        st(`<span class="neg">${esc(e.name === 'NotAllowedError' ? 'لازم تسمحي بالكاميرا من إعدادات المتصفح' : e.message)}</span>`);
      }
    })();
  });
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
