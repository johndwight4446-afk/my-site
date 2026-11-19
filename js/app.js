'use strict';
/* =====================  FBITI SYS – Frontend  ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number(v) || 0;
const money = v => `${CONFIG.CURRENCY} ${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
const split = v => String(v || '').split(/\s*\|\s*|[\r\n,;]+/).map(value => value.trim()).filter(Boolean);
const fmtDate = v => v ? new Date(v).toLocaleString() : '';
let html2canvasLoading;
let installPromptEvent = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!html2canvasLoading) html2canvasLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error('Image library failed to load'));
    script.onerror = () => { html2canvasLoading = null; reject(new Error('Image library failed to load')); };
    document.head.appendChild(script);
  });
  return html2canvasLoading;
}
const ALL_PROGS = [...CONFIG.PROGRAMMES.Certificate, ...CONFIG.PROGRAMMES.Diploma];
const MONO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0b2a5b"/><text x="50" y="62" font-size="38" font-weight="700" text-anchor="middle" fill="#f2b705" font-family="Arial">FB</text></svg>');
const logo = (c = 'logo-md') => `<img class="${c}" src="${CONFIG.LOGO}" alt="Logo" onerror="this.onerror=null;this.src='${MONO}'">`;

const S = { user: null, token: null, page: 'home', students: [], fees: [], exp: [], formPayments: [], bankAccounts: [], users: [], bin: [], programFees: [], documentAssets: null, documentAssetsPromise: null, f: { stProg: 'All', stQ: '', feProg: 'All', feQ: '', feVoid: false } };
const isMasterAdmin = () => S.user && S.user.role === 'Master Admin';
const SEMESTER_GROUPS = ['Semester 1 and 2', 'Semester 3 and 4', 'Semester 5 and 6', 'Semester 7 and 8'];

/* ---------- UI helpers ---------- */
function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200);
}
function modal(html, cls = '') {
  closeModal();
  const m = document.createElement('div'); m.className = 'modal-back';
  m.innerHTML = `<div class="modal ${cls}"><button class="x" data-act="closeModal">✕</button>${html}</div>`;
  document.body.appendChild(m); return m;
}
const closeModal = () => {
  $$('.modal-back').forEach(m => m.remove());
};
function ask(title, label) {
  return new Promise(res => {
    const m = modal(`<h3 style="color:var(--navy);margin-bottom:12px">${title}</h3><label class="lbl">${label}</label><textarea id="askv" rows="3"></textarea>
      <div class="row end"><button class="btn ghost" id="askc">Cancel</button><button class="btn" id="asko">Confirm</button></div>`, 'sm');
    $('.x', m).onclick = e => { e.preventDefault(); e.stopPropagation(); closeModal(); res(null); };
    $('#askc', m).onclick = () => { closeModal(); res(null); };
    $('#asko', m).onclick = () => { const v = $('#askv', m).value.trim(); if (!v) return $('#askv', m).focus(); closeModal(); res(v); };
  });
}
function confirmBox(msg, okLabel = 'Confirm') {
  return new Promise(res => {
    const m = modal(`<h3 style="color:var(--navy);margin-bottom:10px">Please confirm</h3><p style="line-height:1.6">${msg}</p>
      <div class="row end"><button class="btn ghost" id="cc">Cancel</button><button class="btn danger" id="co">${okLabel}</button></div>`, 'sm');
    $('.x', m).onclick = e => { e.preventDefault(); e.stopPropagation(); closeModal(); res(false); };
    $('#cc', m).onclick = () => { closeModal(); res(false); };
    $('#co', m).onclick = () => { closeModal(); res(true); };
  });
}
async function busy(btn, fn) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = t; }
}

/* ---------- API ---------- */
async function api(action, data = {}, token = S.token) {
  const r = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action, token, data }) });
  let j;
  try { j = await r.json(); }
  catch (error) {
    const e = new Error(`The server returned an unreadable response (HTTP ${r.status}). Check the Apps Script deployment URL and try again.`);
    e.server = true;
    throw e;
  }
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.ok !== 'boolean') {
    const e = new Error(`The server returned an unexpected response (HTTP ${r.status}). Check the Apps Script deployment version and try again.`);
    e.server = true;
    throw e;
  }
  if (!r.ok && j.ok) {
    const e = new Error(`The server could not complete the request (HTTP ${r.status}).`);
    e.server = true;
    throw e;
  }
  if (!j.ok) {
    if (j.error === 'SESSION_EXPIRED') { logout(true); }
    const message = j.error === 'SESSION_EXPIRED'
      ? 'Session expired. Please sign in again.'
      : j.error === 'Unknown action'
        ? `The connected Apps Script deployment does not include "${action}". Deploy a new web app version from the updated Code.gs, then reload this page.`
        : /form amount greater than zero/i.test(String(j.error || ''))
          ? 'The connected Apps Script is an older version that still requires a form amount. Deploy a new web app version from the updated Code.gs, then reload this page. The current form only requires Full Name, Program, and Email.'
        : j.error;
    const reference = j.requestId && j.error !== 'SESSION_EXPIRED' ? ` (Reference: ${j.requestId})` : '';
    const e = new Error(message + reference); e.server = true; e.requestId = j.requestId; throw e;
  }
  return j.data;
}
async function ensureDocumentAssets() {
  if (S.documentAssets) return S.documentAssets;
  if (!S.documentAssetsPromise) {
    S.documentAssetsPromise = api('getDocumentAssets')
      .then(assets => { S.documentAssets = assets; return assets; })
      .finally(() => { S.documentAssetsPromise = null; });
  }
  return S.documentAssetsPromise;
}
const LOADERS = { students: 'listStudents', fees: 'listFees', exp: 'listExpenditure' };
async function load(k) {
  try {
    S[k] = await api(LOADERS[k]); localStorage.setItem('fbiti_c_' + k, JSON.stringify(S[k]));
  } catch (e) {
    if (e.server) throw e;
    S[k] = JSON.parse(localStorage.getItem('fbiti_c_' + k) || '[]');
    toast('You are offline – showing the last saved data', 'warn');
  }
}
/* FIX: programme fees also fall back to the last saved copy when offline */
async function loadProgrammeFees() {
  try {
    S.programFees = await api('listProgrammeFees');
    localStorage.setItem('fbiti_c_programFees', JSON.stringify(S.programFees));
  } catch (e) {
    if (e.server) throw e;
    S.programFees = JSON.parse(localStorage.getItem('fbiti_c_programFees') || '[]');
  }
}

/* ---------- Offline drafts ---------- */
const DK = 'fbiti_drafts';
const SAVERS = { student: 'saveStudent', fee: 'saveFee', exp: 'saveExpenditure' };
const drafts = () => JSON.parse(localStorage.getItem(DK) || '[]');
const putDrafts = d => { localStorage.setItem(DK, JSON.stringify(d)); updateSync(); };
const pend = kind => drafts().filter(d => d.kind === kind);
function queueDraft(kind, data) {
  const d = drafts(); d.push({ id: data.ClientRef, kind, data, at: Date.now() }); putDrafts(d);
}
let syncing = false;
async function syncDrafts(manual) {
  if (syncing || !S.token) return;
  let list = drafts(); if (!list.length) return;
  if (manual) list.forEach(d => delete d.error);
  syncing = true; let ok = 0;
  try {
    for (const d of list) {
      if (d.error) continue;
      try { await api(SAVERS[d.kind], d.data); d.done = true; ok++; }
      catch (e) { if (e.server) d.error = e.message; else break; }
    }
  } finally {
    putDrafts(list.filter(d => !d.done)); syncing = false;
  }
  if (ok) { toast(`${ok} pending record${ok > 1 ? 's' : ''} synchronized`, 'ok'); if (!$('.modal-back')) go(S.page); }
  else if (manual) toast(navigator.onLine ? 'Nothing could be synchronized yet' : 'Still offline', 'warn');
}
function updateSync() {
  const el = $('#sync'); if (!el) return;
  const n = drafts().length, off = !navigator.onLine;
  el.className = 'pill' + (off ? ' off' : n ? ' pend' : '');
  el.textContent = off ? `Offline${n ? ' · ' + n + ' pending' : ''}` : n ? `⏳ ${n} pending sync` : '● Online';
}
function appIsInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function updateInstallButton() {
  const button = $('#installApp');
  if (button) button.hidden = appIsInstalled();
}
function showInstallInstructions() {
  modal(`<div class="install-guide"><div class="install-guide-icon">${logo('logo-sm')}</div>
    <h3>Install ${CONFIG.SHORT}</h3>
    <p>Add the institution app to your device for quick, full-screen access.</p>
    <div class="install-steps"><b>Android</b><span>Open this site in Chrome and tap <b>Install app</b> or choose <b>Install app</b> from the browser menu.</span>
    <b>iPhone or iPad</b><span>Open this site in Safari, tap <b>Share</b>, then choose <b>Add to Home Screen</b>.</span>
    <b>Windows or desktop</b><span>Open this site in Chrome or Edge and use the install icon in the address bar or the browser menu.</span></div>
    <p class="install-note">Installation requires this app to be hosted over HTTPS.</p>
    <div class="row end"><button class="btn ghost" data-act="closeModal">Got it</button></div></div>`, 'sm');
}
async function installApp() {
  if (appIsInstalled()) return;
  if (!installPromptEvent) return showInstallInstructions();
  const prompt = installPromptEvent;
  installPromptEvent = null;
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch (error) {
    console.error('The app installation prompt failed:', error);
    toast('Could not open the installation prompt. Use the browser menu for installation.', 'err');
  }
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPromptEvent = event;
});
window.addEventListener('appinstalled', () => {
  installPromptEvent = null;
  updateInstallButton();
  toast(`${CONFIG.SHORT} was installed successfully`, 'ok');
});
window.addEventListener('online', () => { updateSync(); syncDrafts(); });
window.addEventListener('offline', updateSync);
setInterval(() => syncDrafts(), CONFIG.SYNC_INTERVAL_MS);

/* Try to save; if the network is down keep a draft marked "pending synchronization". */
async function saveOrDraft(kind, data) {
  data.ClientRef = data.ClientRef || uid();
  try {
    const result = await api(SAVERS[kind], data);
    return result;
  }
  catch (e) {
    if (e.server) { toast(e.message, 'err'); return false; }
    queueDraft(kind, data); toast('No connection – saved as a draft (pending synchronization)', 'warn'); return { pending: true };
  }
}
const pendingBadge = d => d.error ? `<span class="badge b-bad" title="${esc(d.error)}">Sync failed</span>` : '<span class="badge b-wait">⏳ Pending sync</span>';
const discardBtn = d => `<button class="ic d" title="Discard draft" data-act="discard" data-id="${esc(d.id)}">🗑</button>`;

/* ---------- Form helpers ---------- */
function collect(f) {
  const o = {}, arr = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { (arr[el.name] = arr[el.name] || []); if (el.checked) arr[el.name].push(el.value); }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = ''; }
    else o[el.name] = el.value.trim();
  }
  for (const k in arr) o[k] = arr[k].join(' | ');
  return o;
}
function fill(f, o) {
  for (const el of f.elements) {
    if (!el.name || o[el.name] === undefined) continue;
    const v = String(o[el.name]);
    if (el.type === 'checkbox') el.checked = v.split(' | ').includes(el.value);
    else if (el.type === 'radio') el.checked = el.value === v;
    else el.value = v;
  }
}
const inp = (l, n, t = 'text', x = '') => `<label class="f"><span>${l}</span><input type="${t}" name="${n}" ${x}></label>`;
const radios = (n, o) => `<div class="opts">${o.map(v => `<label class="chk"><input type="radio" name="${n}" value="${esc(v)}">${v}</label>`).join('')}</div>`;
const checks = (n, o) => `<div class="opts">${o.map(v => `<label class="chk"><input type="checkbox" name="${n}" value="${esc(v)}">${v}</label>`).join('')}</div>`;
function calcAge(d) {
  if (!d) return ''; const b = new Date(d), n = new Date(); let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--; return a >= 0 ? a : '';
}

/* ---------- Print / PDF ---------- */
function printDoc(title, body, orientation = 'landscape') {
  const frame = document.createElement('iframe');
  frame.className = 'print-frame';
  frame.title = 'Print preview';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  if (!w) {
    frame.remove();
    return toast('Could not open the print preview. Please try again.', 'err');
  }
  const cleanup = () => {
    frame.remove();
    w.removeEventListener('afterprint', cleanup);
  };
  w.addEventListener('afterprint', cleanup, { once: true });
  writePrintDocument(w, title, body, orientation);
}
function writePrintDocument(w, title, body, orientation) {
  const lu = new URL(CONFIG.LOGO, location.href).href;
  const watermarkUrl = new URL(CONFIG.LOGO_WATERMARK, location.href).href;
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
  @page{size:A4 ${orientation};margin:12mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{background:#fff!important}body{font-family:Arial,sans-serif;color:#10213f;font-size:12px;position:relative}
  body:before{content:"";position:fixed;inset:0;background:var(--doc-watermark) center/190px auto no-repeat;z-index:-1}
  .hd{display:flex;align-items:center;gap:16px;border-bottom:4px solid #f2b705;padding-bottom:10px;margin-bottom:14px}
  .hd img{width:64px;height:64px;object-fit:contain}.hd h1{font-size:19px;color:#0b2a5b}.hd h2{font-size:14px;margin-top:3px}.hd small{color:#5b6b86}
  .meta{display:flex;gap:22px;margin-bottom:12px;font-weight:bold}.meta span{background:#eef2f9;padding:6px 12px;border-radius:6px}
  table{width:100%;border-collapse:collapse;margin-bottom:18px}th{background:#0b2a5b;color:#fff;text-align:left;padding:7px;font-size:11px;text-transform:uppercase}
  td{padding:6px 7px;border-bottom:1px solid #d9e0ec}tr:nth-child(even) td{background:#f6f8fc}.num{text-align:right}tfoot td{font-weight:bold;background:#eef2f9!important}
  h3{color:#0b2a5b;margin:10px 0 6px}.badge{font-weight:bold}.ft{margin-top:20px;color:#5b6b86;font-size:10px;text-align:center}
  .receipt-paper{color:#10213f;background:#fff}.receipt-banner{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:3px solid #f2b705;padding:0 0 10px;color:#0b2a5b}
  .receipt-banner b{font-size:18px}.receipt-banner span{font-size:11px;font-weight:bold;letter-spacing:1px}
  .receipt-number{margin:12px 0;padding:10px;background:#eef2f9}.receipt-number small{display:block;color:#53627b;font-weight:bold}
  .receipt-details{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 16px}.receipt-details small{color:#53627b}
  .receipt-paper h4{margin:12px 0 5px;color:#0b2a5b}.receipt-table{font-size:11px}
  .receipt-totals{display:flex;justify-content:space-between;gap:14px;margin-top:10px;padding:10px;background:#eef2f9}
  .receipt-totals small{display:block;color:#53627b}.receipt-totals b{color:#0b2a5b}
  .document-authority{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:12px;break-inside:avoid}
  .receipt-institution-stamp{width:96px;height:82px;object-fit:contain}
  .institution-stamp{display:block}
  .receipt-paper{position:relative;isolation:isolate;background:transparent!important}.receipt-paper:before{content:"";position:absolute;inset:0;background:var(--doc-watermark) center/190px auto no-repeat;z-index:-1}
  .student-application-form{position:relative;isolation:isolate;background:transparent}
  .student-application-form:before{content:"";position:absolute;inset:0;background:var(--doc-watermark) center/200px auto no-repeat;z-index:-1;pointer-events:none}
  .acceptance-letter{position:relative;isolation:isolate}.acceptance-letter:before{content:"";position:absolute;inset:0;background:var(--doc-watermark) center/230px auto no-repeat;z-index:-1}
  .document-footer{border-top:1px solid #d9e0ec;padding-top:5px;text-align:center;font-size:8px;line-height:1.35;color:#53627b}
  </style></head><body style="--doc-watermark:url('${esc(watermarkUrl)}')"><div class="hd"><img src="${lu}" onerror="this.onerror=null;this.src='${MONO}'"><div><h1>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h1>
  <h2>${esc(title)}</h2><small>Printed ${new Date().toLocaleString()} by ${esc(S.user.fullName)}</small></div></div>${body}
  <div class="ft">${CONFIG.INSTITUTION} · Generated by FBITI SYS</div>
  <script>window.onload=function(){var stamps=Array.prototype.slice.call(document.querySelectorAll('.institution-stamp'));if(stamps.some(function(img){return !img.complete||!img.naturalWidth})){window.parent.toast('Official institution stamp could not be loaded. Please reload the app and try again.','err');return}setTimeout(function(){window.focus();window.print()},250)}<\/script></body></html>`);
  w.document.close();
}

/* =====================  BOOT & AUTH  ===================== */
function startBackgroundSlideshow() {
  const slides = $$('#photo-background .photo-slide');
  if (slides.length !== 2 || !CONFIG.BACKGROUND_IMAGES.length) return;

  let imageIndex = 0;
  let activeSlide = 0;
  slides[activeSlide].style.backgroundImage = `url("${CONFIG.BACKGROUND_IMAGES[imageIndex]}")`;
  slides[activeSlide].classList.add('active');

  const showNextImage = () => {
    imageIndex = (imageIndex + 1) % CONFIG.BACKGROUND_IMAGES.length;
    const nextSlide = 1 - activeSlide;
    slides[nextSlide].style.backgroundImage = `url("${CONFIG.BACKGROUND_IMAGES[imageIndex]}")`;
    slides[nextSlide].classList.add('active');
    slides[activeSlide].classList.remove('active');
    activeSlide = nextSlide;
    window.setTimeout(showNextImage, $('#splash')
      ? CONFIG.BACKGROUND_SPLASH_INTERVAL_MS
      : CONFIG.BACKGROUND_INTERVAL_MS);
  };
  window.setTimeout(showNextImage, CONFIG.BACKGROUND_SPLASH_INTERVAL_MS);
}

window.addEventListener('DOMContentLoaded', () => {
  startBackgroundSlideshow();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(error => console.error('The app service worker could not be registered:', error));
  }
  $('#splash').innerHTML = `${logo('logo-xl')}<h1>${CONFIG.INSTITUTION}</h1><p>${CONFIG.SHORT}</p><div class="bar"><i></i></div>`;
  $('#app').hidden = true;
  $('#splash .bar i').style.animationDuration = CONFIG.SPLASH_MS + 'ms';
  const applicationToken = new URLSearchParams(location.search).get('apply');
  if (applicationToken) {
    showApplicationPage(applicationToken);
  } else {
    const saved = JSON.parse(localStorage.getItem('fbiti_session') || 'null');
    if (!saved) {
      showAuth('login');
    } else {
      S.token = saved.token; S.user = saved.user;
      showApp();
      syncDrafts();
      api('me').then(user => {
        const roleChanged = S.user.role !== user.role;
        S.user = user;
        localStorage.setItem('fbiti_session', JSON.stringify({ token: S.token, user: user }));
        if (roleChanged) showApp();
        else {
          const chip = $('.chip');
          if (chip) chip.innerHTML = `<i>${esc(user.fullName[0].toUpperCase())}</i><span><b>${esc(user.fullName)}</b><br><small>${esc(user.role)}</small></span>`;
        }
      }).catch(error => {
        if (error.server) logout(true);
      });
    }
  }
  setTimeout(() => {
    $('#splash').classList.add('out');
    $('#app').hidden = false;
    setTimeout(() => $('#splash').remove(), 550);
  }, Math.max(0, CONFIG.SPLASH_MS));
});

async function showApplicationPage(token) {
  $('#app').innerHTML = `<main class="public-application-shell"><section class="public-application-card">
    ${logo('logo-sm')}<h1>${esc(CONFIG.INSTITUTION)}</h1><div id="publicApplicationContent">Loading your application form…</div>
    </section></main>`;
  $('#app').hidden = false;
  try {
    const application = await api('getApplicationForm', { token }, null);
    if (application.completed) {
      showApplicationCompletion({ alreadyCompleted: true, student: { RegistrationNumber: application.registrationNumber } });
      return;
    }
    studentForm(null, { ...application, token });
  } catch (error) {
    $('#publicApplicationContent').innerHTML = `<div class="msg err">${esc(error.server ? error.message : 'Could not load the application. Check your internet connection and try again.')}</div>`;
  }
}

function showApplicationCompletion(result) {
  closeModal();
  const completedUrl = new URL(location.href);
  completedUrl.searchParams.delete('apply');
  history.replaceState(null, '', completedUrl.pathname + completedUrl.search + completedUrl.hash);
  const student = result.student || {};
  const emailLine = (sent, label, error) => `<div class="email-status ${sent ? 'sent' : 'failed'}">
    <b>${esc(label)} ${sent ? 'sent' : 'could not be sent'}</b>
    ${sent ? '' : `<span>${esc(error || 'Please contact the institute to confirm delivery.')}</span>`}</div>`;
  $('#publicApplicationContent').innerHTML = `<div class="confirmation">
    <div class="confirmation-mark">✓</div><p class="eyebrow">APPLICATION SUBMITTED</p>
    <h2>Thank you, ${esc(student.FullName || 'applicant')}</h2>
    <p class="sub">Your registration number is <b>${esc(student.RegistrationNumber || '')}</b>.</p>
    ${result.alreadyCompleted ? '<p class="sub">This application has already been submitted.</p>' :
      emailLine(result.acceptanceEmailSent, 'Acceptance letter', result.acceptanceEmailError)}
  </div>`;
}

function showAuth(mode) {
  $('#app').innerHTML = `<div class="auth">
  <aside class="brand">${logo('logo-xl')}<h1>${CONFIG.INSTITUTION}</h1><div class="tag">${CONFIG.SHORT}</div>
    <p>Student registration, fees and expenditure management – secure, simple and always available.</p></aside>
  <main class="authform"><button class="btn ghost install-app auth-install" id="installApp" data-act="installApp" type="button" aria-label="Install FBITI SYS">⬇ <span>Install app</span></button>
  <div class="card"><div class="mini-brand">${logo('logo-sm')}<span>${CONFIG.SHORT}</span></div>
  ${mode === 'login' ? `<h2>Welcome back</h2><p class="sub">Sign in to continue</p><div id="am"></div>
    <form id="lf" autocomplete="on">
      ${inp('Username', 'username', 'text', 'required autocomplete="username"')}
      ${inp('Password', 'password', 'password', 'required autocomplete="current-password"')}
      <label class="f"><span>Role</span><select name="role" required><option value="" selected>— Select role —</option><option>Master Admin</option><option>Admin</option><option>Bursar</option></select></label>
      <button class="btn block" type="submit">Sign In</button></form>
    <div class="switch">Don't have an account? <a data-act="auth" data-id="register">Create account</a></div>`
  : `<h2>Create account</h2><p class="sub">Your account will be reviewed by an administrator</p><div id="am"></div>
    <form id="rf">
      ${inp('Full Name', 'fullName', 'text', 'required')}${inp('Email', 'email', 'email', 'required')}
      ${inp('Username', 'username', 'text', 'required minlength="3"')}${inp('Password', 'password', 'password', 'required minlength="6"')}
      <label class="f"><span>Role</span><select name="role"><option>Bursar</option><option>Admin</option></select></label>
      <button class="btn block" type="submit">Create Account</button></form>
    <div class="switch">Already have an account? <a data-act="auth" data-id="login">Sign in</a></div>`}
  </div></main></div>`;
  updateInstallButton();
  const msg = (t, c = 'err') => $('#am').innerHTML = `<div class="msg ${c}">${esc(t)}</div>`;
  if (mode === 'login') $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = $('button', e.target);
    try {
      const r = await busy(b, () => api('login', collect(e.target)));
      S.token = r.token; S.user = r.user; localStorage.setItem('fbiti_session', JSON.stringify(r)); showApp(); syncDrafts();
    } catch (x) { msg(x.server ? x.message : 'Cannot reach the server. Check your internet connection.'); }
  };
  else $('#rf').onsubmit = async e => {
    e.preventDefault(); const b = $('button', e.target);
    try {
      const r = await busy(b, () => api('register', collect(e.target)));
      showAuth('login');
      $('#am').innerHTML = `<div class="msg ok">${r.autoApproved ? 'Account created. You are the first user, so you were approved as Master Admin – sign in now.' : 'Account created. Please wait for administrator approval – you will receive an email.'}</div>`;
    } catch (x) { msg(x.server ? x.message : 'Cannot reach the server. Check your internet connection.'); }
  };
}

async function logout(silent) {
  if (!silent && S.token) { try { await api('logout'); } catch (e) { } }
  S.token = null; S.user = null; localStorage.removeItem('fbiti_session'); showAuth('login');
}

/* =====================  SHELL  ===================== */
const NAV = [['home', 'Home', '🏠'], ['students', 'Student Registration', '🎓'], ['fees', 'Fees Payment', '💳'], ['exp', 'Expenditure', '🧾'], ['report', 'Report', '📊'],
['formPayments', 'Form Payment', '📝'],
['admin', 'Admin Control Panel', '🛡', 1], ['bin', 'Recycle Bin', '♻️', 1], ['profile', 'Profile', '👤']];

function showApp() {
  const nav = NAV.filter(n => !n[3] || isMasterAdmin());
  $('#app').innerHTML = `<div class="shell"><aside class="side" id="side"><div class="hd">${logo('logo-sm')}<b>${CONFIG.INSTITUTION}<small>${CONFIG.SHORT}</small></b></div>
  <nav>${nav.map(n => `<a data-act="go" data-id="${n[0]}" id="n-${n[0]}"><span>${n[2]}</span>${n[1]}</a>`).join('')}<div class="sep"></div>
  <a data-act="logout"><span>⎋</span>Logout</a></nav></aside>
  <div class="main"><header class="top"><button class="burger" data-act="menu">☰</button><h3 id="ptitle"></h3>
  <button class="btn ghost install-app" id="installApp" data-act="installApp" type="button" aria-label="Install FBITI SYS">⬇ <span>Install app</span></button>
  <span id="sync" class="pill" data-act="syncNow" title="Click to synchronize now"></span>
  <div class="chip"><i>${esc(S.user.fullName[0].toUpperCase())}</i><span><b>${esc(S.user.fullName)}</b><br><small>${esc(S.user.role)}</small></span></div></header>
  <div id="view"></div></div></div>`;
  updateInstallButton();
  updateSync(); go('home');
}
function go(p) {
  if ((p === 'admin' || p === 'bin') && !isMasterAdmin()) {
    toast('Only a Master Admin can access this page', 'err');
    return;
  }
  S.page = p; $('#side')?.classList.remove('open');
  $$('.side a').forEach(a => a.classList.toggle('on', a.id === 'n-' + p));
  const n = NAV.find(x => x[0] === p); $('#ptitle').textContent = n ? n[1] : '';
  const fn = PAGES[p]; $('#view').innerHTML = '<div class="panel">Loading…</div>';
  Promise.resolve(fn()).catch(e => { $('#view').innerHTML = `<div class="panel msg err">${esc(e.message)}</div>`; });
}

/* =====================  HOME  ===================== */
function pageHome() {
  const c = [['🎓 Student Registration', 'Register students with a REG number. An FBITI Student ID is assigned automatically after the first fee payment.'],
  ['📝 Form Payment', 'Save the applicant name, programme, and email, then send a private student registration form link.'],
  ['💳 Fees Payment', 'Record up to five instalments for each programme and semester group. Total paid and balance are calculated automatically.'],
  ['🧾 Expenditure', 'Record institutional spending and print expenditure statements.'],
  ['📊 Report', 'Summaries of students, fees and expenditure that can be printed as landscape PDFs.'],
  ['⏳ Offline Drafts', 'If your internet drops, forms are kept on this device marked “pending synchronization” and sent automatically when you reconnect.'],
  ['🧾 Financial record controls', 'Staff can void expenditure with a reason. Master Admins can move expenditure to the Recycle Bin and restore or permanently delete it there.']];
  if (isMasterAdmin()) c.push(['🛡 Admin Tools', 'Approve or deny users, assign Admin or Master Admin roles, transfer ownership, and restore deleted records.']);
  $('#view').innerHTML = `<div class="welcome"><h2>Welcome, ${esc(S.user.fullName)} 👋</h2><p>${CONFIG.INSTITUTION} – signed in as ${esc(S.user.role)}</p></div>
  <div class="cards">${c.map(x => `<div class="panel"><h4>${x[0]}</h4><p>${x[1]}</p></div>`).join('')}</div>`;
}

/* =====================  STUDENTS  ===================== */
const progOpts = sel => `<option value="All">All Programmes</option>` + ALL_PROGS.map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('');
const stList = () => S.students.filter(s => S.f.stProg === 'All' || split(s.Programmes).includes(S.f.stProg));

async function pageStudents() {
  await load('students');
  $('#view').innerHTML = `<div class="tool"><input class="grow" id="stQ" placeholder="🔍 Search by registration number, Student ID, or name…" value="${esc(S.f.stQ)}">
    <select id="stP">${progOpts(S.f.stProg)}</select>
    <button class="btn gold" data-act="addStudent">＋ Add Student</button><button class="btn ghost" data-act="printStudents">🖨 Print PDF</button></div>
    <div class="stats" id="stStats"></div><div class="wrap"><table class="tbl"><thead><tr><th>Registration / Student ID</th><th>Full Name</th><th>Gender</th><th>Age</th><th>Mobile</th><th>Programmes</th><th>Period</th><th>Actions</th></tr></thead><tbody id="stBody"></tbody></table></div>`;
  $('#stQ').oninput = e => { S.f.stQ = e.target.value; drawStudents(); };
  $('#stP').onchange = e => { S.f.stProg = e.target.value; drawStudents(); };
  drawStudents();
}
function drawStudents() {
  const list = stList(), q = S.f.stQ.trim().toLowerCase();
  const matches = s => !q || [s.RegistrationNumber, s.StudentID, s.FullName]
    .some(value => String(value || '').toLowerCase().includes(q));
  const hit = s => Boolean(q) && matches(s);
  const rows = list.filter(matches);
  const m = list.filter(s => s.Gender === 'Male').length, f = list.filter(s => s.Gender === 'Female').length;
  $('#stStats').innerHTML = `<div class="stat"><small>Total Students</small><b>${list.length}</b></div><div class="stat"><small>Male</small><b>${m}</b></div><div class="stat y"><small>Female</small><b>${f}</b></div>`;
  const pr = pend('student').filter(d => matches(d.data)).map(d => `<tr class="pending"><td>—</td><td>${esc(d.data.FullName)} ${pendingBadge(d)}</td><td>${esc(d.data.Gender)}</td><td>${esc(d.data.Age)}</td><td>${esc(d.data.Mobile)}</td><td>${esc(split(d.data.Programmes).join(', '))}</td><td>${esc(split(d.data.StudyPeriod).join(', '))}</td><td>${discardBtn(d)}</td></tr>`).join('');
  $('#stBody').innerHTML = pr + (rows.length ? rows.map(s => `<tr class="${hit(s) ? 'flash' : ''}"><td><b>${esc(s.RegistrationNumber)}</b>${s.StudentID ? `<br><small>${esc(s.StudentID)}</small>` : ''}</td><td>${esc(s.FullName)}</td><td>${esc(s.Gender)}</td><td>${esc(s.Age)}</td><td>${esc(s.Mobile)}</td>
    <td>${esc(split(s.Programmes).join(', '))}</td><td>${esc(split(s.StudyPeriod).join(', '))}</td>
    <td><button class="ic v" title="View" data-act="viewStudent" data-id="${esc(s.RegistrationNumber)}">👁</button><button class="ic e" title="Edit" data-act="editStudent" data-id="${esc(s.RegistrationNumber)}">✏️</button><button class="ic d" title="Delete" data-act="delStudent" data-id="${esc(s.RegistrationNumber)}">🗑</button></td></tr>`).join('')
    : (pr ? '' : '<tr><td colspan="8" class="empty">No students found</td></tr>'));
}
const progBoxes = lvl => lvl ? checks('Programmes', CONFIG.PROGRAMMES[lvl]) : '<p class="hint" style="color:var(--mute)">Select a programme level first.</p>';

function studentForm(s, application) {
  const isApplication = Boolean(application);
  const fixedProgramLevel = application && CONFIG.PROGRAMMES.Certificate.includes(application.program) ? 'Certificate' : 'Diploma';
  const m = modal(`<div class="mh">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>STUDENT ADMISSION FORM</p></div></div>
  ${isApplication ? '<div class="userline">Your applicant name and programme are fixed. Enter the email address where you want your acceptance letter; it can differ from the address that received this link.</div>' : ''}
  <form id="sf" class="student-application-form" style="--doc-watermark:url('${esc(new URL(CONFIG.LOGO_WATERMARK, location.href).href)}')" novalidate>
  <div class="g3"><label class="f"><span>Registration Number</span><input name="RegistrationNumber" readonly value="${s ? esc(s.RegistrationNumber) : ''}" placeholder="Assigned when saved"></label>
  ${s && s.StudentID ? `<label class="f"><span>Student ID</span><input readonly value="${esc(s.StudentID)}"></label>` : ''}
  <label class="f"><span>Academic Year *</span><input name="AcademicYear" placeholder="2026/2027" maxlength="9" inputmode="numeric" oninput="this.value=this.value.replace(/[^0-9\\/]/g,'')"></label></div>
  <div class="sec">SECTION A: PERSONAL INFORMATION</div>
  <div class="g2">${inp('1. Full Name *', 'FullName', 'text', isApplication ? `readonly required value="${esc(application.applicantName)}"` : '')}
  <div><span class="lbl">2. Gender *</span>${radios('Gender', ['Male', 'Female'])}</div>
  <label class="f"><span>3. Date of Birth *</span><input type="date" name="DOB" id="dob" max="${today()}"></label>${inp('Age', 'Age', 'text', 'readonly id="age"')}
  ${inp('4. Nationality *', 'Nationality')}<div><span class="lbl">5. Marital Status</span>${radios('MaritalStatus', ['Single', 'Married', 'Other'])}</div>
  ${inp('6. Home Address', 'HomeAddress')}${inp('7. District', 'District')}${inp('8. Chiefdom / Community', 'Chiefdom')}${inp('9. Mobile Number *', 'Mobile', 'tel')}
  ${inp('10. Alternative Number', 'AltMobile', 'tel')}${inp('11. Email Address (for your acceptance letter)', 'Email', 'email', isApplication ? 'required' : '')}
  <div class="full">${inp('12. National ID / School ID / Driver\'s Licence (if available)', 'NationalID')}</div></div>
  <div class="sec">SECTION B: EDUCATIONAL BACKGROUND</div>
  <span class="lbl">Highest Qualification Obtained</span>${radios('Qualification', ['Primary School', 'JSS', 'BECE', 'SSS', 'WASSCE', 'Certificate', 'Diploma', 'Degree', 'Other'])}
  <div class="g3">${inp('If Other, specify', 'QualOther')}${inp('Last School / Institution Attended', 'LastSchool')}${inp('Year Completed', 'YearCompleted', 'text', 'maxlength="4" inputmode="numeric"')}</div>
  <div class="sec">SECTION C: PROGRAMME OF INTEREST</div>
  ${isApplication ? `<div class="g2"><label class="f"><span>Programme Level</span><input readonly value="${fixedProgramLevel}"><input type="hidden" name="ProgrammeLevel" value="${fixedProgramLevel}"></label>
  <label class="f"><span>Programme</span><input readonly value="${esc(application.program)}"><input type="hidden" name="Programmes" value="${esc(application.program)}"></label></div>`
    : `<label class="f" style="max-width:340px"><span>Programme Level *</span><select name="ProgrammeLevel" id="plvl"><option value="">— Select —</option><option>Certificate</option><option>Diploma</option></select></label>
  <span class="lbl">Programmes (select one or more) *</span><div id="pbox">${progBoxes('')}</div>`}
  <span class="lbl">Preferred Study Period</span>${checks('StudyPeriod', ['Morning', 'Afternoon', 'Evening', 'Weekend'])}
  <div class="sec">SECTION D: PARENT / GUARDIAN INFORMATION <small>(required for applicants under 18)</small></div>
  <div class="g2">${inp('Parent/Guardian Name', 'GuardianName')}${inp('Relationship to Applicant', 'GuardianRelation')}${inp('Address', 'GuardianAddress')}${inp('Contact Number', 'GuardianContact', 'tel')}${inp('Email', 'GuardianEmail', 'email')}</div>
  <div class="sec">SECTION E: EMERGENCY CONTACT INFORMATION</div>
  <div class="g2">${inp('Name', 'EmergencyName')}${inp('Relationship', 'EmergencyRelation')}${inp('Address', 'EmergencyAddress')}${inp('Telephone Number', 'EmergencyPhone', 'tel')}</div>
  <div class="sec">SECTION F: MEDICAL INFORMATION (OPTIONAL)</div>
  <span class="lbl">Do you have any medical condition that may require special attention?</span>
  <div class="opts"><label class="chk"><input type="radio" name="MedicalCondition" value="Yes">Yes</label><label class="chk"><input type="radio" name="MedicalCondition" value="No">No</label></div>
  <div id="medBox" hidden>${inp('If yes, please specify', 'MedicalDetails')}</div>
  <div class="sec">SECTION G: HOW DID YOU HEAR ABOUT FBITI?</div>
  ${checks('HeardAbout', ['Social Media', 'Friend/Relative', 'Radio', 'Flyer/Banner', 'School Visit', 'Website', 'Other'])}
  <div style="max-width:340px">${inp('If Other, specify', 'HeardOther')}</div>
  <div id="sfMsg"></div><div class="row end">${isApplication ? '' : '<button type="button" class="btn ghost" data-act="closeModal">Cancel</button>'}<button class="btn" type="submit">${isApplication ? 'Submit Application' : s ? 'Update Student' : 'Save Student'}</button></div></form>`, isApplication ? 'application-modal' : '');
  const f = $('#sf', m);
  if (isApplication) $('.x', m).hidden = true;
  const toggleMed = () => $('#medBox', m).hidden = f.elements.MedicalCondition.value !== 'Yes';
  $$('[name=MedicalCondition]', f).forEach(r => r.onchange = toggleMed);
  $('#dob', m).onchange = e => $('#age', m).value = calcAge(e.target.value);
  if (!isApplication) $('#plvl', m).onchange = e => $('#pbox', m).innerHTML = progBoxes(e.target.value);
  if (s) {
    const o = { ...s };
    if (String(o.Qualification).startsWith('Other')) { o.QualOther = String(o.Qualification).replace(/^Other:?\s*/, ''); o.Qualification = 'Other'; }
    f.elements.ProgrammeLevel.value = o.ProgrammeLevel; $('#pbox', m).innerHTML = progBoxes(o.ProgrammeLevel); fill(f, o); toggleMed();
  }
  f.onsubmit = async e => {
    e.preventDefault();
    const d = collect(f); d.Age = calcAge(d.DOB);
    if (d.Qualification === 'Other') d.Qualification = 'Other: ' + d.QualOther;
    const err = !/^\d{4}\/\d{4}$/.test(d.AcademicYear) ? 'Academic year must look like 2026/2027'
      : !d.FullName ? 'Full name is required' : !d.Gender ? 'Select a gender' : !d.DOB ? 'Date of birth is required'
      : !d.Nationality ? 'Nationality is required' : !d.Mobile ? 'Mobile number is required'
      : !d.ProgrammeLevel || !d.Programmes ? 'Select at least one programme'
      : isApplication && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.Email) ? 'Enter a valid email address for your acceptance letter'
      : (d.Age !== '' && d.Age < 18 && (!d.GuardianName || !d.GuardianContact)) ? 'Parent/Guardian name and contact are required for applicants under 18' : '';
    if (err) return $('#sfMsg', m).innerHTML = `<div class="msg err">${esc(err)}</div>`;
    const b = $('button[type=submit]', f);
    if (isApplication) {
      try {
        const result = await busy(b, () => api('submitApplicationForm', { token: application.token, student: d }, null));
        showApplicationCompletion(result);
      } catch (error) {
        $('#sfMsg', m).innerHTML = `<div class="msg err">${esc(error.server ? error.message : 'Could not submit the application. Check your internet connection and try again.')}</div>`;
      }
      return;
    }
    const result = await busy(b, () => saveOrDraft('student', d));
    if (result) {
      closeModal();
      go('students');
      if (result.pending) return;
      if (result.updated) {
        const messages = ['Student information updated'];
        if (result.acceptanceEmailSent) messages.push('acceptance letter emailed');
        else messages.push('acceptance email failed: ' + (result.acceptanceEmailError || 'check the email address'));
        if (result.receiptEmailSent === true) messages.push('latest receipt emailed');
        else if (result.receiptEmailSent === false) messages.push('receipt email failed: ' + (result.receiptEmailError || 'check the email address'));
        toast(messages.join('. '), result.acceptanceEmailSent && result.receiptEmailSent !== false ? 'ok' : 'warn');
      }
      else if (result.student) registrationConfirmation(result);
      else toast('Student information updated', 'ok');
    }
  };
}
function registrationConfirmation(result) {
  const student = result.student;
  const recipients = [student.Email].map(value => String(value || '').trim())
    .filter((value, index, list) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && list.indexOf(value) === index);
  const m = modal(`<div class="confirmation">
    <div class="confirmation-mark">✓</div><p class="eyebrow">REGISTRATION COMPLETE</p>
    <h2>Welcome to ${esc(CONFIG.SHORT)}</h2><p class="sub">Keep this number safe. It is required for the student's first fee payment.</p>
    <div class="confirm-code"><small>REGISTRATION NUMBER</small><strong>${esc(student.RegistrationNumber)}</strong></div>
    <div class="email-status ${result.emailSent ? 'sent' : 'failed'}">
      <b>${result.emailSent ? 'Acceptance letter sent' : 'Acceptance letter could not be emailed'}</b>
      <span>${result.emailSent ? 'The acceptance letter PDF and programme fee information were emailed to ' + esc(recipients.join(' and ')) + '.' : esc(result.emailError || 'No valid email address was available. You can still save the letter below.')}</span>
    </div>
    <div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Close</button>
    <button type="button" class="btn gold" data-act="downloadAcceptance" data-id="${esc(student.RegistrationNumber)}">⬇ Print / Save acceptance letter (PDF)</button></div>
  </div>`, 'sm');
  return m;
}

async function downloadAcceptanceLetter(registrationNumber) {
  try {
    const data = await api('downloadAcceptanceLetter', { registrationNumber });
    const title = `Acceptance Letter - ${data.student.RegistrationNumber}`;
    const logoUrl = new URL(CONFIG.LOGO, location.href).href;
    const printRoot = document.createElement('section');
    printRoot.className = 'acceptance-print-root';
    const watermarkUrl = new URL(CONFIG.LOGO_WATERMARK, location.href).href;
    S.documentAssets = { stampDataUri: data.stampDataUri };
    printRoot.innerHTML = `<header class="acceptance-print-brand"><img src="${esc(logoUrl)}" alt="${esc(CONFIG.SHORT)} institution logo">
      <div class="acceptance-print-identity"><p class="acceptance-print-eyebrow">${esc(CONFIG.SHORT)} · OFFICIAL ADMISSIONS</p>
        <h2>${esc(CONFIG.INSTITUTION)}</h2><p class="acceptance-print-motto">Knowledge for a Brighter Future</p></div>
      <div class="acceptance-print-contact"><b>${esc(CONFIG.ADDRESS)}</b><span>${esc(CONFIG.CONTACTS)}</span><span>${esc(CONFIG.EMAILS)}</span></div></header>
      <main class="acceptance-print-content">${acceptanceLetterMarkup(data.student, data.feeSchedule, data.date, data.bankAccounts || [],
        watermarkUrl, data.stampDataUri)}</main>`;
    const previousTitle = document.title;
    const cleanup = () => {
      printRoot.remove();
      document.body.classList.remove('acceptance-print-open');
      document.title = previousTitle;
    };
    document.body.appendChild(printRoot);
    document.body.classList.add('acceptance-print-open');
    document.title = title;
    await Promise.all(Array.from(printRoot.querySelectorAll('img')).map(image => {
      const description = image.classList.contains('acceptance-letter-watermark')
        ? 'institution watermark'
        : image.classList.contains('institution-stamp')
          ? 'official institution stamp'
        : image.alt || 'institution logo';
      const imageError = () => new Error(`The acceptance letter ${description} could not be loaded. Please reload the app and try again.`);
      if (image.complete) {
        return image.naturalWidth
          ? Promise.resolve()
          : Promise.reject(imageError());
      }
      return new Promise((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(imageError()), { once: true });
      });
    }));
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  } catch (error) {
    document.body.classList.remove('acceptance-print-open');
    $('.acceptance-print-root')?.remove();
    toast(error.server || error.message.startsWith('The acceptance letter') ? error.message : 'Could not download the acceptance letter. Check your connection.', 'err');
  }
}

function acceptanceLetterMarkup(student, feeSchedule, date, bankAccounts = [], watermarkUrl = '', stampUrl = '') {
  const accountRows = bankAccounts.map(account => `<tr><td>${esc(account.bankName)}</td><td>${esc(account.accountNumber)}</td></tr>`).join('');
  const programmes = split(student.Programmes).join(', ') || 'To be confirmed';
  const studyPeriod = split(student.StudyPeriod).join(', ') || 'To be confirmed';
  const initialDue = feeSchedule.initialDue === null ? 'Pending fee setup' : money(feeSchedule.initialDue);
  const totalFees = feeSchedule.total === null ? 'Pending fee setup' : money(feeSchedule.total);
  return `<article class="acceptance-letter">
    <img class="acceptance-letter-watermark" src="${esc(watermarkUrl)}" alt="" aria-hidden="true">
    <div class="acceptance-letter-rule" aria-hidden="true"></div>
    <div class="letter-meta"><span><b>DATE</b>${esc(date || today())}</span><span><b>ACADEMIC YEAR</b>${esc(student.AcademicYear || 'To be confirmed')}</span>
      <span><b>REFERENCE</b>${esc(student.RegistrationNumber)}</span></div>
    <header class="acceptance-letter-heading"><p class="document-kicker">ADMISSIONS OFFICE</p>
      <h1>LETTER OF ACCEPTANCE</h1><p>OFFICIAL OFFER OF ADMISSION</p></header>
    <p class="letter-salutation">Dear <b>${esc(student.FullName)}</b>,</p>
    <p>On behalf of ${esc(CONFIG.INSTITUTION)}, we are delighted to formally confirm your acceptance for admission to the programme(s) listed below for the ${esc(student.AcademicYear || 'upcoming')} academic year. This offer has been prepared using the information provided in your application and recorded under the registration number shown in this letter. Please review the details carefully and contact the Admissions Office promptly if you notice an error or if any information needs to be updated.</p>
    <p>Congratulations on reaching this important milestone. Choosing to continue your education is a meaningful investment in your knowledge, skills, and future opportunities. We are pleased that you have chosen to begin or continue that journey with ${esc(CONFIG.SHORT)}, and we look forward to welcoming you into our learning community.</p>
    <div class="admission-details"><div><small>REGISTRATION NUMBER</small><b>${esc(student.RegistrationNumber)}</b></div>
      <div><small>PROGRAMME LEVEL</small><b>${esc(student.ProgrammeLevel || 'As registered')}</b></div>
      <div><small>PROGRAMME(S)</small><b>${esc(programmes)}</b></div>
      <div><small>STUDY PERIOD</small><b>${esc(studyPeriod)}</b></div></div>
    <h2>Your programme and preparation</h2>
    <p>Your programme and study period are recorded above for your reference. Please keep this letter safe and use your registration number whenever you communicate with the Institute. Before classes begin, stay in contact with Admissions to confirm the commencement date, timetable, orientation arrangements, and any documents you may be asked to provide. If your circumstances change or you are unsure about a requirement, please ask the appropriate office for guidance rather than relying on an assumption.</p>
    <p>As you prepare for study, we encourage you to approach your programme with curiosity, commitment, and a willingness to learn. Regular participation, careful preparation, respectful collaboration, and consistent effort will help you make the most of your studies. Take time to understand the academic expectations and student guidelines communicated by the Institute, and seek clarification early whenever something is unclear.</p>
    <h2>Tuition and payment information</h2>
    <p>Review the tuition amounts below together with the programme fee schedule provided with your acceptance information. The initial amount and overall tuition are shown for planning purposes. If a figure is marked as pending, not configured, or otherwise requires confirmation, contact the Finance Office before making a payment. Do not rely on an unverified amount or payment instruction.</p>
    <div class="fee-summary"><p><b>Initial tuition due:</b> ${initialDue}</p><p><b>Total tuition:</b> ${totalFees}</p></div>
    <h2>Official bank payment details</h2>
    <p>When the amount and payment method have been confirmed, use only a payment channel officially approved by the Institute. Include your registration number as the payment reference wherever possible, and keep the bank confirmation and official receipt. These records may be needed when you complete enrolment or ask the Finance Office to verify a payment.</p>
    <table class="acceptance-bank-table"><thead><tr><th>Bank name</th><th>Account number</th></tr></thead>
      <tbody>${accountRows || '<tr><td colspan="2">No bank account is currently listed. Contact the Finance Office to confirm an approved payment method.</td></tr>'}</tbody></table>
    <h2>Completing enrolment</h2>
    <ol class="acceptance-steps"><li>Keep this letter and quote your registration number in all correspondence.</li>
      <li>Contact Admissions to confirm the next registration steps, any documents required for verification, and the arrangements for your study period.</li>
      <li>Confirm the tuition amount and payment instructions with Finance, then pay through an approved channel and obtain an official receipt.</li>
      <li>Share any requested registration or payment information with the appropriate office and retain copies for your records.</li>
      <li>Check for updates about your timetable, orientation, and the start of classes, and follow the instructions provided by the Institute.</li></ol>
    <h2>Your part in our learning community</h2>
    <p>We encourage every student to contribute to a positive, focused, and respectful learning environment. Please attend and participate as required, complete learning activities honestly, treat fellow students and staff with consideration, and observe the academic, conduct, and safety requirements explained by the Institute. If you need assistance or face a difficulty that may affect your studies, contact the relevant office as early as you can so that your question can be directed appropriately.</p>
    <p>This offer is subject to verification of your application information and completion of the Institute's registration requirements. It confirms your acceptance to the programme(s) and academic year identified above; any further dates, schedules, or requirements will be communicated by the relevant office. Please notify Admissions promptly if a name, programme, study period, or academic-year detail is incorrect.</p>
    <p>Once again, congratulations on your acceptance. We wish you every success as you prepare for your studies and look forward to seeing you build your knowledge and skills at ${esc(CONFIG.INSTITUTION)}.</p>
    <div class="acceptance-signoff"><div><p>Yours sincerely,</p>
      <span class="acceptance-signature-line"></span></div>
      ${stampUrl ? `<div class="acceptance-official-stamp"><img class="institution-stamp" src="${esc(stampUrl)}" alt="Official institution stamp"></div>` : ''}</div>
    <footer class="document-footer">
      <div class="document-footer-brand"><b>${esc(CONFIG.INSTITUTION)}</b><span>OFFICIAL ADMISSIONS · LETTER OF ACCEPTANCE</span></div>
      <div class="document-footer-contact">${esc(CONFIG.ADDRESS)}<br>${esc(CONFIG.CONTACTS)} · ${esc(CONFIG.EMAILS)}</div>
    </footer>
  </article>`;
}

function studentView(s) {
  const k = (l, v) => `<div class="kv"><span>${l}</span><b>${esc(v) || '—'}</b></div>`;
  const m = modal(`<div id="snap" class="snap" data-sid="${esc(s.RegistrationNumber)}"><div class="snap-hd">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>STUDENT ADMISSION FORM</p></div><div class="idtag">${esc(s.RegistrationNumber)}</div></div>
  <div class="g3">${k('Registration Number', s.RegistrationNumber)}${k('Student ID', s.StudentID)}</div>
  <div class="g3">${k('Academic Year', s.AcademicYear)}${k('Recorded by', s.RecordedBy)}${k('Date registered', fmtDate(s.CreatedAt))}</div>
  <h4>SECTION A: PERSONAL INFORMATION</h4><div class="g3">${k('Full Name', s.FullName)}${k('Gender', s.Gender)}${k('Date of Birth', s.DOB)}${k('Age', s.Age)}${k('Nationality', s.Nationality)}${k('Marital Status', s.MaritalStatus)}
  ${k('Home Address', s.HomeAddress)}${k('District', s.District)}${k('Chiefdom/Community', s.Chiefdom)}${k('Mobile', s.Mobile)}${k('Alternative Number', s.AltMobile)}${k('Email', s.Email)}${k('National / School ID / Licence', s.NationalID)}</div>
  <h4>SECTION B: EDUCATIONAL BACKGROUND</h4><div class="g3">${k('Highest Qualification', s.Qualification)}${k('Last School', s.LastSchool)}${k('Year Completed', s.YearCompleted)}</div>
  <h4>SECTION C: PROGRAMME OF INTEREST</h4><div class="g3">${k('Level', s.ProgrammeLevel)}${k('Programmes', split(s.Programmes).join(', '))}${k('Study Period', split(s.StudyPeriod).join(', '))}</div>
  <h4>SECTION D: PARENT / GUARDIAN</h4><div class="g3">${k('Name', s.GuardianName)}${k('Relationship', s.GuardianRelation)}${k('Address', s.GuardianAddress)}${k('Contact', s.GuardianContact)}${k('Email', s.GuardianEmail)}</div>
  <h4>SECTION E: EMERGENCY CONTACT</h4><div class="g3">${k('Name', s.EmergencyName)}${k('Relationship', s.EmergencyRelation)}${k('Address', s.EmergencyAddress)}${k('Telephone', s.EmergencyPhone)}</div>
  <h4>SECTION F: MEDICAL INFORMATION</h4><div class="g3">${k('Medical condition', s.MedicalCondition)}${k('Details', s.MedicalDetails)}</div>
  <h4>SECTION G: HOW DID YOU HEAR ABOUT FBITI?</h4><div class="g3">${k('Source', split(s.HeardAbout).join(', '))}${k('Other', s.HeardOther)}</div></div>
  <div class="row end"><button class="btn gold" data-act="downloadAcceptance" data-id="${esc(s.RegistrationNumber)}">⬇ Print / Save acceptance letter (PDF)</button>
  <button class="btn ghost" data-act="snap">📷 Save as Picture</button><button class="btn ghost" data-act="closeModal">Close</button></div>`);
}
function printStudents() {
  const l = stList(), m = l.filter(s => s.Gender === 'Male').length;
  printDoc(`Student Register – ${S.f.stProg === 'All' ? 'All Programmes' : S.f.stProg}`,
    `<div class="meta"><span>Total: ${l.length}</span><span>Male: ${m}</span><span>Female: ${l.filter(s => s.Gender === 'Female').length}</span></div>
    <table><thead><tr><th>#</th><th>Registration Number</th><th>Student ID</th><th>Full Name</th><th>Gender</th><th>Age</th><th>Mobile</th><th>Programmes</th><th>Period</th><th>Year</th></tr></thead><tbody>
    ${l.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.RegistrationNumber)}</td><td>${esc(s.StudentID)}</td><td>${esc(s.FullName)}</td><td>${esc(s.Gender)}</td><td>${esc(s.Age)}</td><td>${esc(s.Mobile)}</td><td>${esc(split(s.Programmes).join(', '))}</td><td>${esc(split(s.StudyPeriod).join(', '))}</td><td>${esc(s.AcademicYear)}</td></tr>`).join('')}</tbody></table>`);
}

/* =====================  FEES  ===================== */
const feActive = r => r.Status !== 'Voided';
const feList = () => S.fees.filter(r => (S.f.feProg === 'All' || split(r.Program).includes(S.f.feProg)) && (feActive(r) || S.f.feVoid));
function studentProgrammes(student) {
  if (!student) return [];
  const saved = [student.Programmes, student.Programme, student.Program, student.Course]
    .filter(Boolean).join(' | ');
  const names = split(saved);
  const canonical = value => value.toLowerCase().replace(/\s+/g, ' ');
  return names.reduce((programmes, name) => {
    const match = ALL_PROGS.find(programme => canonical(programme) === canonical(name));
    if (match && !programmes.includes(match)) programmes.push(match);
    return programmes;
  }, []);
}
function studentSemesterGroups(student) {
  const level = String(student && student.ProgrammeLevel || '').trim().toLowerCase();
  const programmes = studentProgrammes(student);
  const isDiploma = level === 'diploma' || (!level && programmes.some(program => CONFIG.PROGRAMMES.Diploma.includes(program)));
  return isDiploma ? SEMESTER_GROUPS.slice(0, 3) : SEMESTER_GROUPS.slice(0, 1);
}
async function pageFees() {
  await Promise.all([load('fees'), load('students'), loadProgrammeFees()]);
  $('#view').innerHTML = `<div class="tool"><input class="grow" id="feQ" placeholder="🔍 Search by registration number, Student ID, or name…" value="${esc(S.f.feQ)}"><select id="feP">${progOpts(S.f.feProg)}</select>
  <label class="chk"><input type="checkbox" id="feV" ${S.f.feVoid ? 'checked' : ''}>Show deleted</label><button class="btn gold" data-act="addFee">＋ Add Payment</button></div><div class="stats" id="feStats"></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>Registration No.</th><th>Student ID</th><th>Name</th><th>Programme</th><th>Semester Group</th><th class="num">Amount Paid</th><th class="num">Balance</th><th>Recorded By</th><th>Actions</th></tr></thead><tbody id="feBody"></tbody></table></div>`;
  $('#feQ').oninput = e => { S.f.feQ = e.target.value; drawFees(); };
  $('#feP').onchange = e => { S.f.feProg = e.target.value; drawFees(); };
  $('#feV').onchange = e => { S.f.feVoid = e.target.checked; drawFees(); };
  drawFees();
}
async function pageFormPayments() {
  S.formPayments = await api('listFormPayments');
  $('#view').innerHTML = `<div class="tool"><span class="grow hint">Save the applicant name, programme, and email, then send the private registration form link to that email.</span>
    <button class="btn gold" data-act="addFormPayment">＋ Pay Form</button></div>
    <div class="wrap"><table class="tbl"><thead><tr><th>Full Name</th><th>Program</th><th>Email</th><th>Recorded By</th><th>Actions</th></tr></thead><tbody>
    ${S.formPayments.length ? S.formPayments.map(applicant => `<tr><td>${esc(applicant.FullName)}</td>
    <td>${esc(applicant.Program)}</td><td>${esc(applicant.Email)}</td><td>${esc(applicant.RecordedBy)}</td><td>${isMasterAdmin() ? `<button class="ic d" title="Delete form payment" data-act="deleteFormPayment" data-id="${applicant.row}">🗑</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">No applicants yet</td></tr>`}</tbody></table></div>`;
}
function formPaymentForm() {
  const options = ALL_PROGS.map(program => `<option value="${esc(program)}">${esc(program)}</option>`).join('');
  const m = modal(`<div class="mh">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>STUDENT REGISTRATION FORM LINK</p></div></div>
    <form id="formPaymentForm">${inp('Full Name *', 'FullName', 'text', 'required')}
    <label class="f"><span>Program *</span><select name="Program" required><option value="">— Select program —</option>${options}</select></label>
    ${inp('Email *', 'Email', 'email', 'required')}
    <div id="formPaymentMessage"></div><div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button>
    <button class="btn" type="submit">Save &amp; Send Form Link</button></div></form>`, 'sm');
  $('#formPaymentForm', m).onsubmit = async event => {
    event.preventDefault();
    const form = event.target;
    try {
      const result = await busy($('button[type=submit]', form), () =>
        api('saveFormPayment', collect(form)));
      closeModal();
      await go('formPayments');
      toast(result.emailSent ? 'Applicant saved; student registration link emailed' :
        'Applicant saved, but the form link email failed: ' + (result.emailError || 'check the email settings'), result.emailSent ? 'ok' : 'warn');
    } catch (error) {
      $('#formPaymentMessage', m).innerHTML = `<div class="msg err">${esc(error.server ? error.message : 'Could not save the form payment. Check your connection.')}</div>`;
    }
  };
}
function drawFees() {
  const list = feList(), act = list.filter(feActive), q = S.f.feQ.trim().toLowerCase();
  const matches = r => !q || [r.RegistrationNumber, r.StudentID, r.Name]
    .some(value => String(value || '').toLowerCase().includes(q));
  const hit = r => Boolean(q) && matches(r);
  const rows = list.filter(matches);
  const sum = k => act.reduce((a, r) => a + num(r[k]), 0);
  $('#feStats').innerHTML = `<div class="stat"><small>Total Fees</small><b>${money(sum('TotalFees'))}</b></div><div class="stat g"><small>Total Fees Paid</small><b>${money(sum('TotalPaid'))}</b></div><div class="stat r"><small>Balance</small><b>${money(sum('Balance'))}</b></div>`;
  const pr = pend('fee').filter(d => matches(d.data)).map(d => { const p = [1, 2, 3, 4, 5].reduce((a, i) => a + num(d.data['P' + i + '_Amount']), 0);
    return `<tr class="pending"><td>${esc(d.data.RegistrationNumber)}</td><td>${esc(d.data.StudentID)}</td><td>${esc(d.data.Name || '')} ${pendingBadge(d)}</td><td>${esc(d.data.Program)}</td><td>${esc(d.data.SemesterGroup)}</td><td class="num">${money(p)}</td><td class="num">${money(num(d.data.TotalFees) - p)}</td><td>${esc(S.user.fullName)}</td><td>${discardBtn(d)}</td></tr>`; }).join('');
  const viewB = r => `<button class="ic v" title="View" data-act="viewFee" data-id="${esc(r.FeeID)}">👁</button>`;
  const receiptB = r => `<button class="ic a" title="Save payment receipt" data-act="printSavedReceipt" data-id="${esc(r.FeeID)}">🧾</button>`;
  $('#feBody').innerHTML = pr + (rows.length ? rows.map(r => `<tr class="${feActive(r) ? '' : 'void'} ${hit(r) ? 'flash' : ''}"><td><b>${esc(r.RegistrationNumber)}</b></td><td>${esc(r.StudentID)}</td>
    <td>${esc(r.Name)}${feActive(r) ? '' : ` <span class="badge b-bad" title="${esc(r.VoidReason)}">Deleted</span>`}</td><td>${esc(r.Program)}</td><td>${esc(r.SemesterGroup)}</td>
    <td class="num">${money(r.TotalPaid)}</td><td class="num">${money(r.Balance)}</td><td>${esc(r.RecordedBy || '')}</td>
    <td>${receiptB(r)}${feActive(r) ? `${viewB(r)}<button class="ic e" title="Edit / add payment" data-act="editFee" data-id="${esc(r.FeeID)}">✏️</button><button class="ic d" title="Delete" data-act="voidFee" data-id="${esc(r.FeeID)}">🗑</button>`
      : viewB(r) + (isMasterAdmin() ? `<button class="ic a" title="Restore" data-act="reinstateFee" data-id="${esc(r.FeeID)}">↩</button>` : '')}</td></tr>`).join('') : (pr ? '' : '<tr><td colspan="9" class="empty">No payment records</td></tr>'));
}
function feeForm(rec) {
  const pays = [1, 2, 3, 4, 5].map(i => `<div class="pay"><b>Payment ${i}</b><div class="g4">
    ${inp('Amount', 'P' + i + '_Amount', 'number', 'min="0" step="0.01" data-i="' + i + '"')}${inp('Date (auto)', 'P' + i + '_Date', 'text', 'readonly')}
    ${inp('Bank Name (optional)', 'P' + i + '_Bank')}${inp('Bank Slip No. (optional)', 'P' + i + '_Slip')}</div></div>`).join('');
  const groups = SEMESTER_GROUPS.map(group => `<option>${esc(group)}</option>`).join('');
  const m = modal(`<div class="mh">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>FEES PAYMENT</p></div></div>
  <div class="userline">Recorded by: <b>${esc(S.user.fullName)}</b></div>
  <form id="ff" novalidate><div class="g3"><label class="f"><span>Registration Number (first payment)</span><div class="input-prefix"><span>REG-</span><input name="RegistrationNumber" type="text" inputmode="numeric" placeholder="001" autocomplete="off"></div></label>
  <label class="f"><span>Student ID (later payments)</span><div class="input-prefix"><span>FBITI-</span><input name="StudentNumber" type="text" inputmode="numeric" placeholder="001" autocomplete="off"></div></label>
  <label class="f"><span>Name</span><input id="fName" readonly></label></div><div id="fMsg" class="hint"></div><div id="fHistoryMsg" class="hint"></div>
  <div id="paymentDetails" hidden>
  <div class="g2"><label class="f"><span>Programme (automatic)</span><input id="fProgramDisplay" type="text" readonly placeholder="Enter a student number first"><input name="Program" type="hidden"><small id="fProgrammeMsg" class="hint"></small></label>
  <label class="f"><span>Semester group</span><select name="SemesterGroup" id="fSemester" required><option value="">— Select semester group —</option>${groups}</select></label></div>
  ${inp('TOTAL FEES (set by Master Admin)', 'TotalFees', 'text', 'id="fTotalFees" readonly placeholder="Fee not configured"')}${pays}
  <div class="totals"><div><small>Total Fees</small><b id="tF">0.00</b></div><div><small>Total Fees Paid</small><b id="tP">0.00</b></div><div><small>Balance</small><b id="tB">0.00</b></div></div>
  </div>
  <div id="ffMsg" style="margin-top:12px"></div><div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" type="submit">Save Payment</button></div></form>`, 'md');
  const f = $('#ff', m);
  let selectedStudent = null;
  const studentId = value => {
    const raw = String(value || '').trim().toUpperCase();
    return /^\d+$/.test(raw) ? 'FBITI-' + raw.padStart(3, '0') : raw.startsWith('FBITI-') ? raw : '';
  };
  const registrationNumber = value => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? 'REG-' + digits.padStart(3, '0') : '';
  };
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const selectedFee = () => S.programFees.find(row =>
    normalize(row.Program) === normalize(f.elements.Program.value) &&
    normalize(row.SemesterGroup) === normalize(f.elements.SemesterGroup.value));
  const existingPayment = () => selectedStudent && S.fees.find(row => feActive(row) &&
    row.RegistrationNumber === selectedStudent.RegistrationNumber && row.Program === f.elements.Program.value &&
    row.SemesterGroup === f.elements.SemesterGroup.value);
  const updateProgrammeOptions = preferred => {
    const programs = studentProgrammes(selectedStudent);
    const program = preferred && programs.includes(preferred) ? preferred : programs[0] || '';
    f.elements.Program.value = program;
    $('#fProgramDisplay', m).value = program;
    $('#fProgrammeMsg', m).textContent = programs.length ? '' :
      'No registered programme was found in this student record. Update the student record before taking payment.';
  };
  const updateSemesterOptions = preferred => {
    const groups = studentSemesterGroups(selectedStudent);
    const current = preferred || f.elements.SemesterGroup.value;
    f.elements.SemesterGroup.innerHTML = groups.map(group =>
      `<option value="${esc(group)}">${esc(group)}</option>`).join('');
    f.elements.SemesterGroup.value = groups.includes(current) ? current : groups[0] || '';
  };
  const calc = () => {
    let paid = 0;
    for (let i = 1; i <= 5; i++) {
      const a = num(f.elements['P' + i + '_Amount'].value), d = f.elements['P' + i + '_Date'];
      if (a > 0) { if (!d.value) d.value = today(); paid += a; } else d.value = '';
    }
    const fee = selectedFee();
    const t = num(fee && fee.TotalFees);
    f.elements.TotalFees.value = fee && t > 0 ? money(t) : '';
    $('#tF', m).textContent = money(t); $('#tP', m).textContent = money(paid); $('#tB', m).textContent = money(t - paid);
    $('#fProgrammeMsg', m).textContent = f.elements.Program.value && !t
      ? 'No fee is configured for this programme and semester group.'
      : studentProgrammes(selectedStudent).length ? '' : 'No registered programme was found in this student record. Update the student record before taking payment.';
    $('#tB', m).style.color = t - paid > 0 ? 'var(--bad)' : 'var(--ok)'; return { t, paid };
  };
  let feeLookupRequest = 0;
  const refreshConfiguredFee = async () => {
    const program = f.elements.Program.value, semesterGroup = f.elements.SemesterGroup.value;
    const request = ++feeLookupRequest;
    if (!selectedStudent || !program || !semesterGroup) { calc(); return; }
    try {
      const fee = await api('getProgrammeFee', { Program: program, SemesterGroup: semesterGroup });
      if (request !== feeLookupRequest) return;
      const index = S.programFees.findIndex(row =>
        normalize(row.Program) === normalize(program) &&
        normalize(row.SemesterGroup) === normalize(semesterGroup));
      if (index < 0) S.programFees.push(fee);
      else S.programFees[index] = fee;
      calc();
      if (num(fee.TotalFees) <= 0)
        $('#fProgrammeMsg', m).textContent = 'No saved fee was found for this programme and semester in PROGRAMME FEES.';
    } catch (error) {
      if (request !== feeLookupRequest) return;
      calc();
      if (error.server) $('#fProgrammeMsg', m).textContent = 'Could not read the fee from PROGRAMME FEES: ' + error.message;
      else if (!num(selectedFee() && selectedFee().TotalFees)) $('#fProgrammeMsg', m).textContent = 'You are offline and no saved fee was found for this programme and semester.';
    }
  };
  /* FIX: only clear the payment inputs (P1_… to P5_…). The old selector [name^=P] also wiped the hidden Program field. */
  const clearPayments = () => $$('input', f).filter(input => /^P\d_/.test(input.name)).forEach(input => { input.value = ''; });
  const loadPayment = () => {
    clearPayments();
    const ex = existingPayment();
    for (let i = 1; i <= 5; i++) {
      ['Amount', 'Bank', 'Slip'].forEach(field => { f.elements['P' + i + '_' + field].readOnly = false; });
      if (ex && num(ex['P' + i + '_Amount']) > 0) {
        ['Amount', 'Date', 'Bank', 'Slip'].forEach(field => { f.elements['P' + i + '_' + field].readOnly = true; });
      }
    }
    $('#fHistoryMsg', m).textContent = ex ? 'Previous installments are locked. Enter new payments in an empty installment.' : '';
    if (ex) {
      /* FIX: fill only the payment fields so REG-/FBITI- values are not pushed into the prefixed inputs */
      const payData = {};
      Object.keys(ex).forEach(key => { if (/^P\d_/.test(key)) payData[key] = ex[key]; });
      fill(f, payData);
    }
    calc();
    refreshConfiguredFee();
  };
  const lookup = () => {
    const reg = registrationNumber(f.elements.RegistrationNumber.value);
    const id = studentId(f.elements.StudentNumber.value);
    selectedStudent = null;
    f.elements.StudentNumber.value = f.elements.StudentNumber.value.replace(/\D/g, '');
    const st = id ? S.students.find(s => String(s.StudentID).toUpperCase() === id)
      : reg ? S.students.find(s => String(s.RegistrationNumber).toUpperCase() === reg) : null;
    const msg = reg && st && st.StudentID && !id
      ? `This student already has an ID. Enter ${st.StudentID.replace(/^FBITI-/, '')} in Student ID for later payments.`
      : reg && !st ? 'No registered student with this registration number'
      : id && !st ? 'No registered student with this Student ID' : '';
    $('#fMsg', m).textContent = msg;
    if (st && !(reg && st.StudentID && !id)) selectedStudent = st;
    $('#fName', m).value = selectedStudent ? selectedStudent.FullName : '';
    $('#paymentDetails', m).hidden = !selectedStudent;
    if (f.dataset.student !== (selectedStudent && selectedStudent.RegistrationNumber || '')) {
      f.dataset.student = selectedStudent && selectedStudent.RegistrationNumber || '';
      updateProgrammeOptions(rec && rec.Program);
      updateSemesterOptions(rec && rec.SemesterGroup);
      loadPayment();
    } else calc();
  };
  f.elements.RegistrationNumber.oninput = () => { if (f.elements.RegistrationNumber.value) f.elements.StudentNumber.value = ''; lookup(); };
  f.elements.StudentNumber.oninput = () => { if (f.elements.StudentNumber.value) f.elements.RegistrationNumber.value = ''; lookup(); };
  f.elements.SemesterGroup.onchange = loadPayment;
  f.oninput = e => { if (e.target.type === 'number') calc(); };
  if (rec) {
    f.elements.StudentNumber.value = String(rec.StudentID || '').replace(/^FBITI-/, '');
    f.elements.RegistrationNumber.value = String(rec.RegistrationNumber || '').replace(/^REG-/i, '');
    /* FIX: lookup() already sets the programme, semester group and loads the payment once.
       The extra calls that used to follow here caused duplicate getProgrammeFee requests. */
    lookup();
  }
  f.onsubmit = async e => {
    e.preventDefault(); const d = collect(f), { t, paid } = calc();
    const ex = existingPayment();
    const err = !selectedStudent ? 'Enter the registration number for a first payment or Student ID for a later payment'
      : !d.Program ? 'No registered programme was found for this student'
      : !d.SemesterGroup ? 'Select a semester group'
      : t <= 0 ? 'The programme fee has not been configured by the Master Admin'
      : paid <= (ex ? num(ex.TotalPaid) : 0) ? 'Enter a new installment amount'
      : paid > t ? 'Total paid cannot exceed the configured semester fee' : '';
    if (err) return $('#ffMsg', m).innerHTML = `<div class="msg err">${esc(err)}</div>`;
    d.StudentID = selectedStudent.StudentID || '';
    d.StudentNumber = '';
    d.RegistrationNumber = selectedStudent.RegistrationNumber;
    d.Name = selectedStudent.FullName;
    d.TotalFees = t; /* FIX: send the number, not the formatted "Le 1,000.00" text (the server recalculates it anyway) */
    d.ClientRef = uid();
    const b = $('button[type=submit]', f);
    const result = await busy(b, () => saveOrDraft('fee', d));
    if (result) {
      closeModal();
      go('fees');
      if (result.pending) return;
      if (result.receipt) await paymentReceipt(result, selectedStudent);
    }
  };
}

function receiptMarkup(receipt, assets = S.documentAssets || {}) {
  const rows = receipt.currentInstallments.map(item => `<tr><td>Installment ${item.number}</td><td>${esc(item.date || '')}</td><td class="num">${money(item.amount)}</td></tr>`).join('');
  const previous = receipt.previousInstallments.length
    ? receipt.previousInstallments.map(item => `<tr><td>Installment ${item.number}</td><td>${esc(item.date || '')}</td><td class="num">${money(item.amount)}</td></tr>`).join('')
    : '<tr><td colspan="3">No previous payments</td></tr>';
  const watermarkUrl = new URL(CONFIG.LOGO_WATERMARK, location.href).href;
  const stampUrl = assets.stampDataUri || new URL(CONFIG.OFFICIAL_STAMP, location.href).href;
  return `<div class="receipt-paper" style="--doc-watermark:url('${esc(watermarkUrl)}')"><div class="receipt-banner"><div><b>${esc(CONFIG.INSTITUTION)}</b><small>${esc(CONFIG.SHORT)}</small></div><span>OFFICIAL FEE PAYMENT RECEIPT</span></div>
    <div class="receipt-number"><small>RECEIPT NUMBER</small><strong>${esc(receipt.receiptNumber)}</strong></div>
    <div class="receipt-details"><div><small>Student</small><b>${esc(receipt.name)}</b></div><div><small>Student ID</small><b>${esc(receipt.studentId)}</b></div>
    <div><small>Registration Number</small><b>${esc(receipt.registrationNumber)}</b></div><div><small>Date</small><b>${esc(fmtDate(receipt.date))}</b></div>
    <div><small>Programme</small><b>${esc(receipt.program)}</b></div><div><small>Semester group</small><b>${esc(receipt.semesterGroup)}</b></div>
    <div><small>Recorded by</small><b>${esc(receipt.recordedBy || '')}</b></div></div>
    <h4>Payment received this time</h4><table class="receipt-table"><thead><tr><th>Payment</th><th>Date</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="2">Amount paid this time</td><td class="num">${money(receipt.amountPaid)}</td></tr></tfoot></table>
    <h4>Previous payments</h4><table class="receipt-table"><thead><tr><th>Payment</th><th>Date</th><th class="num">Amount</th></tr></thead><tbody>${previous}</tbody></table>
    <div class="receipt-totals"><div><small>Paid this time</small><b>${money(receipt.amountPaid)}</b></div><div><small>Total paid to date</small><b>${money(receipt.totalPaid)}</b></div>
    <div><small>Total semester fees</small><b>${money(receipt.totalFees)}</b></div><div><small>Outstanding balance</small><b>${money(receipt.balance)}</b></div></div>
    <div class="document-authority"><img class="institution-stamp receipt-institution-stamp" src="${esc(stampUrl)}" alt="Official institution stamp"></div>
    <p class="receipt-thanks">Thank you for your payment. Please keep this official receipt for your records.</p></div>`;
}
/* FIX: a damaged receipt cell no longer breaks the whole fees page */
function receiptHistory(record) {
  let history = [];
  try {
    history = record.ReceiptHistory ? JSON.parse(record.ReceiptHistory) : [];
    if (!Array.isArray(history)) history = [];
  } catch (e) { history = []; }
  if (!history.length && record.LastReceipt) {
    try { history.push(JSON.parse(record.LastReceipt)); } catch (e) { }
  }
  return history;
}
async function paymentReceipt(result, student) {
  const assets = await ensureDocumentAssets();
  const receipt = result.receipt;
  const recipients = [student.Email, student.GuardianEmail].map(value => String(value || '').trim())
    .filter((value, index, list) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && list.indexOf(value) === index);
  const m = modal(`<div class="payment-id-callout"><small>STUDENT ID</small><strong>${esc(receipt.studentId)}</strong>
    <span>Use this ID for the student's future fee payments.</span></div>${receiptMarkup(receipt, assets)}<div class="email-status ${result.emailSent ? 'sent' : 'failed'}">
    <b>${result.emailSent ? 'Receipt emailed' : 'Receipt email could not be sent'}</b>
    <span>${result.emailSent ? 'The Student ID and payment receipt PDF were emailed to ' + esc(recipients.join(' and ')) + '.' : esc(result.emailError || 'Check the email address and try again.')}</span>
  </div><div class="row end"><button class="btn ghost" data-act="closeModal">Close</button>
  <button class="btn gold" data-act="printReceipt">⬇ Save / Print receipt</button></div>`, 'md');
  m.dataset.receipt = JSON.stringify(receipt);
}
async function printSavedReceipt(record) {
  const assets = await ensureDocumentAssets();
  const history = receiptHistory(record);
  if (history.length) {
    const receipt = history[history.length - 1];
    printDoc(`Payment Receipt – ${receipt.receiptNumber}`, receiptMarkup(receipt, assets), 'landscape');
    return;
  }
  const installments = [1, 2, 3, 4, 5].filter(i => num(record['P' + i + '_Amount']) > 0)
    .map(i => ({ number: i, date: record['P' + i + '_Date'], amount: num(record['P' + i + '_Amount']) }));
  const receipt = {
    receiptNumber: record.FeeID,
    date: record.UpdatedAt || record.CreatedAt,
    registrationNumber: record.RegistrationNumber,
    studentId: record.StudentID,
    name: record.Name,
    program: record.Program,
    semesterGroup: record.SemesterGroup,
    currentInstallments: installments,
    previousInstallments: [],
    amountPaid: num(record.TotalPaid),
    totalPaid: num(record.TotalPaid),
    totalFees: num(record.TotalFees),
    balance: num(record.Balance)
  };
  printDoc(`Payment Receipt – ${receipt.receiptNumber}`, receiptMarkup(receipt, assets), 'landscape');
}

function feeView(r) {
  const k = (l, v) => `<div class="kv"><span>${l}</span><b>${esc(v) || '—'}</b></div>`;
  const history = receiptHistory(r);
  const receipts = history.length ? `<h4>Payment receipts</h4><div class="receipt-history">${history.map((receipt, index) =>
    `<div><span><b>${esc(receipt.receiptNumber)}</b><small>${esc(fmtDate(receipt.date))} · ${money(receipt.amountPaid)}</small></span>
    <button class="btn gold" data-act="printReceiptHistory" data-id="${esc(r.FeeID)}" data-index="${index}">Save receipt</button></div>`).join('')}</div>` : '';
  modal(`<div id="snap" class="snap" data-sid="${esc(r.StudentID)}-fees"><div class="snap-hd">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>FEES PAYMENT</p></div><div class="idtag">${esc(r.StudentID)}</div></div>
  ${feActive(r) ? '' : `<div class="msg err">DELETED – ${esc(r.VoidReason)} (by ${esc(r.VoidedBy)})</div>`}
  <div class="g2">${k('Registration Number', r.RegistrationNumber)}${k('Student ID', r.StudentID)}${k('Name', r.Name)}${k('Programme', r.Program)}${k('Semester group', r.SemesterGroup)}${k('Recorded by', r.RecordedBy)}${k('Date recorded', fmtDate(r.CreatedAt))}</div>
  <div class="totals" style="grid-template-columns:repeat(2,1fr)"><div><small>Amount Paid</small><b>${money(r.TotalPaid)}</b></div><div><small>Balance</small><b style="color:${num(r.Balance) > 0 ? 'var(--bad)' : 'var(--ok)'}">${money(r.Balance)}</b></div></div></div>
  ${receipts}
  <div class="row end"><button class="btn gold" data-act="printSavedReceipt" data-id="${esc(r.FeeID)}">⬇ Print / Save latest receipt</button>
  <button class="btn ghost" data-act="snap">📷 Save as Image</button><button class="btn ghost" data-act="closeModal">Close</button></div>`, 'sm');
}

/* =====================  EXPENDITURE  ===================== */
async function pageExp() {
  await load('exp');
  const act = S.exp.filter(feActive), total = act.reduce((a, r) => a + num(r.Amount), 0);
  $('#view').innerHTML = `<div class="tool"><div class="stat y" style="flex:1"><small>Total Expenditure</small><b>${money(total)}</b></div>
  <button class="btn gold" data-act="addExp">＋ Add Exp</button><button class="btn ghost" data-act="printExp">🖨 Print</button></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>ID</th><th>Date</th><th>Name</th><th>Description</th><th class="num">Amount</th><th>Recorded by</th><th>Status</th><th>Actions</th></tr></thead><tbody>
  ${pend('exp').map(d => `<tr class="pending"><td>—</td><td>${esc(d.data.Date)}</td><td>${esc(d.data.Name)}</td><td>${esc(d.data.Description)}</td><td class="num">${money(d.data.Amount)}</td><td>${esc(S.user.fullName)}</td><td>${pendingBadge(d)}</td><td>${discardBtn(d)}</td></tr>`).join('')}
  ${S.exp.length ? S.exp.map(r => `<tr class="${feActive(r) ? '' : 'void'}"><td><b>${esc(r.ExpID)}</b></td><td>${esc(r.Date)}</td><td>${esc(r.Name)}</td><td>${esc(r.Description)}</td><td class="num">${money(r.Amount)}</td><td>${esc(r.RecordedBy)}</td>
  <td>${feActive(r) ? '<span class="badge b-ok">Active</span>' : `<span class="badge b-bad" title="${esc(r.VoidReason)}">Voided</span>`}</td>
  <td>${feActive(r) ? `<button class="ic d" title="Void" data-act="voidExp" data-id="${esc(r.ExpID)}">⛔</button>` : (isMasterAdmin() ? `<button class="ic a" title="Reinstate" data-act="reinstateExp" data-id="${esc(r.ExpID)}">↩</button>` : '')}
    ${isMasterAdmin() ? `<button class="ic d" title="Move to Recycle Bin" data-act="deleteExp" data-id="${esc(r.ExpID)}">🗑</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">No expenditure recorded</td></tr>'}
  </tbody></table></div>`;
}
function expForm() {
  const total = S.exp.filter(feActive).reduce((a, r) => a + num(r.Amount), 0);
  const m = modal(`<div class="mh">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>EXPENDITURE</p></div></div>
  <div class="userline">Recorded by: <b>${esc(S.user.fullName)}</b> &nbsp;|&nbsp; Total expenditure so far: <b>${money(total)}</b></div>
  <form id="ef" novalidate><div id="expenseItems">${expenseItemMarkup()}</div>
  <button type="button" class="btn ghost" id="addExpenseItem">＋ Add another expenditure</button>
  <div id="efMsg"></div><div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" type="submit">Save all</button></div></form>`, 'md');
  const form = $('#ef', m), items = $('#expenseItems', m);
  $('#addExpenseItem', m).onclick = () => items.insertAdjacentHTML('beforeend', expenseItemMarkup());
  items.onclick = e => {
    const remove = e.target.closest('[data-remove-expense]');
    if (remove) remove.closest('.expense-item').remove();
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const data = $$('.expense-item', form).map(item => ({
      Date: $('[name=Date]', item).value,
      Name: $('[name=Name]', item).value.trim(),
      Description: $('[name=Description]', item).value.trim(),
      Amount: $('[name=Amount]', item).value.trim(),
      ClientRef: uid()
    }));
    const invalid = data.some(d => !d.Date || !d.Name || num(d.Amount) <= 0);
    if (!data.length || invalid)
      return $('#efMsg', m).innerHTML = '<div class="msg err">Each expenditure needs a date, name, and valid amount.</div>';
    if (await busy($('button[type=submit]', form), () => saveExpenditureBatch(data))) { closeModal(); go('exp'); }
  };
}
function expenseItemMarkup() {
  return `<section class="expense-item"><div class="expense-item-hd"><b>Expenditure</b><button type="button" class="ic d" data-remove-expense title="Remove expenditure">✕</button></div>
  <div class="g2">${inp('Date', 'Date', 'date', `required value="${today()}"`)}${inp('Name', 'Name', 'text', 'required')}
  <label class="f"><span>Description</span><textarea name="Description" rows="3"></textarea></label>${inp('Amount', 'Amount', 'number', 'required min="0.01" step="0.01"')}</div></section>`;
}
async function saveExpenditureBatch(items) {
  try {
    await api('saveExpenditures', { items });
    toast(`${items.length} expenditure record${items.length > 1 ? 's' : ''} saved`, 'ok');
  } catch (e) {
    if (e.server) { toast(e.message, 'err'); return false; }
    items.forEach(item => queueDraft('exp', item));
    toast(`${items.length} expenditure record${items.length > 1 ? 's' : ''} saved as drafts for synchronization`, 'warn');
  }
  return true;
}
function printExp() {
  const a = S.exp.filter(feActive);
  printDoc('Expenditure Statement', `<div class="meta"><span>Total Expenditure: ${money(a.reduce((x, r) => x + num(r.Amount), 0))}</span><span>Records: ${a.length}</span></div>
  <table><thead><tr><th>ID</th><th>Date</th><th>Name</th><th>Description</th><th class="num">Amount</th><th>Recorded by</th></tr></thead><tbody>
  ${a.map(r => `<tr><td>${esc(r.ExpID)}</td><td>${esc(r.Date)}</td><td>${esc(r.Name)}</td><td>${esc(r.Description)}</td><td class="num">${money(r.Amount)}</td><td>${esc(r.RecordedBy)}</td></tr>`).join('')}</tbody></table>`);
}

/* =====================  REPORT  ===================== */
function repStudents() {
  const map = {}; ALL_PROGS.forEach(p => map[p] = { m: 0, f: 0 });
  S.students.forEach(s => split(s.Programmes).forEach(p => { map[p] = map[p] || { m: 0, f: 0 }; s.Gender === 'Male' ? map[p].m++ : map[p].f++; }));
  const m = S.students.filter(s => s.Gender === 'Male').length, f = S.students.filter(s => s.Gender === 'Female').length;
  return `<h3>Student Report</h3><table class="tbl"><thead><tr><th>Programmes</th><th class="num">Male</th><th class="num">Female</th><th class="num">Total</th></tr></thead><tbody>
  ${Object.entries(map).filter(([, v]) => v.m + v.f).map(([p, v]) => `<tr><td>${esc(p)}</td><td class="num">${v.m}</td><td class="num">${v.f}</td><td class="num">${v.m + v.f}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No data</td></tr>'}</tbody>
  <tfoot><tr><td>Total (unique students)</td><td class="num">${m}</td><td class="num">${f}</td><td class="num">${m + f}</td></tr></tfoot></table>`;
}
function repFees() {
  const map = {}; S.fees.filter(feActive).forEach(r => { const p = split(r.Program)[0] || 'Unassigned'; const o = map[p] = map[p] || { t: 0, p: 0, b: 0 }; o.t += num(r.TotalFees); o.p += num(r.TotalPaid); o.b += num(r.Balance); });
  const T = Object.values(map).reduce((a, o) => ({ t: a.t + o.t, p: a.p + o.p, b: a.b + o.b }), { t: 0, p: 0, b: 0 });
  return `<h3>Fees Report</h3><table class="tbl"><thead><tr><th>Programme</th><th class="num">Total Fees</th><th class="num">Total Fees Paid</th><th class="num">Balance</th></tr></thead><tbody>
  ${Object.entries(map).map(([p, o]) => `<tr><td>${esc(p)}</td><td class="num">${money(o.t)}</td><td class="num">${money(o.p)}</td><td class="num">${money(o.b)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No data</td></tr>'}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${money(T.t)}</td><td class="num">${money(T.p)}</td><td class="num">${money(T.b)}</td></tr></tfoot></table>`;
}
function repExp() {
  const map = {}; S.exp.filter(feActive).forEach(r => map[r.RecordedBy] = (map[r.RecordedBy] || 0) + num(r.Amount));
  const T = Object.values(map).reduce((a, b) => a + b, 0);
  return `<h3>Expenditure Report</h3><table class="tbl"><thead><tr><th>User Name</th><th class="num">Total Expenditure Recorded</th></tr></thead><tbody>
  ${Object.entries(map).map(([u, v]) => `<tr><td>${esc(u)}</td><td class="num">${money(v)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">No data</td></tr>'}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${money(T)}</td></tr></tfoot></table>`;
}
const REPORTS = { students: ['Student', repStudents], fees: ['Fees', repFees], exp: ['Expenditure', repExp] };
async function pageReport() {
  await Promise.all([load('students'), load('fees'), load('exp')]);
  $('#view').innerHTML = `<div class="tool"><select id="rt">${Object.entries(REPORTS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
  <button class="btn ghost" data-act="printReport">🖨 Print PDF (Landscape)</button></div><div class="panel" id="rb"></div>`;
  const draw = () => $('#rb').innerHTML = REPORTS[$('#rt').value][1]();
  $('#rt').onchange = draw; draw();
}

/* =====================  ADMIN  ===================== */
async function pageAdmin() {
  const [users, programmeFees, bankAccounts] = await Promise.all([
    api('listUsers'), api('listProgrammeFees'), api('listBankAccounts')
  ]);
  S.users = users;
  S.programFees = programmeFees;
  S.bankAccounts = bankAccounts;
  localStorage.setItem('fbiti_c_programFees', JSON.stringify(programmeFees));
  const st = { Approved: 'b-ok', Pending: 'b-wait', Denied: 'b-bad' };
  $('#view').innerHTML = `<div class="stats"><div class="stat"><small>Users</small><b>${S.users.length}</b></div><div class="stat y"><small>Pending</small><b>${S.users.filter(u => u.Status === 'Pending').length}</b></div></div>
  <div class="panel userline">Master Admins can approve accounts as Bursar, Admin, or Master Admin. Admin accounts do not have access to this panel. Use Edit to change an account’s name, username, role, or password.</div>
  <div class="tool"><button class="btn gold" data-act="editProgrammeFees">Set programme and semester fees</button>
  <button class="btn ghost" data-act="emailRegistrationNumbers">Email registration numbers to existing students</button></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>Full Name</th><th>Email</th><th>Username</th><th>Role</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead><tbody>
  ${S.users.map(u => `<tr><td>${esc(u.FullName)}</td><td>${esc(u.Email)}</td><td>${esc(u.Username)}</td><td>${esc(u.Role)}</td><td><span class="badge ${st[u.Status] || ''}">${esc(u.Status)}</span></td><td>${esc(fmtDate(u.CreatedAt))}</td>
  <td><button class="ic e" title="Edit account" data-act="editUser" data-id="${esc(u.UserID)}">✏️</button>${u.UserID === S.user.id ? '<small>You</small>' : `
  ${u.Status !== 'Approved' ? `<select data-approval-role="${esc(u.UserID)}" aria-label="Approve role">${['Master Admin', 'Admin', 'Bursar'].map(role => `<option ${role === u.Role ? 'selected' : ''}>${role}</option>`).join('')}</select><button class="ic a" title="Approve with selected role" data-act="approve" data-id="${esc(u.UserID)}">✔</button>` : ''}
  ${u.Status !== 'Denied' ? `<button class="ic e" title="Deny" data-act="deny" data-id="${esc(u.UserID)}">✖</button>` : ''}
  <button class="ic d" title="Delete user" data-act="delUser" data-id="${esc(u.UserID)}">🗑</button>`}</td></tr>`).join('')}</tbody></table></div>
  <div class="tool" style="margin-top:18px"><h3 class="grow" style="color:var(--navy)">Bank accounts for acceptance letters</h3>
    <button class="btn gold" data-act="addBankAccount">＋ Add Bank Account</button></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>Bank Name</th><th>Account Number</th><th>Actions</th></tr></thead><tbody>
    ${S.bankAccounts.length ? S.bankAccounts.map(account => `<tr><td>${esc(account.BankName)}</td><td>${esc(account.AccountNumber)}</td>
      <td><button class="ic e" title="Edit bank account" data-act="editBankAccount" data-id="${account.row}">✏️</button>
      <button class="ic d" title="Delete bank account" data-act="deleteBankAccount" data-id="${account.row}">🗑</button></td></tr>`).join('')
      : '<tr><td colspan="3" class="empty">No bank accounts added. Acceptance letters will ask applicants to contact the Finance Office.</td></tr>'}
  </tbody></table></div>`;
}
function bankAccountForm(row) {
  const account = row ? S.bankAccounts.find(item => item.row === Number(row)) : null;
  if (row && !account) return toast('Bank account was not found', 'err');
  const m = modal(`<h3 style="color:var(--navy);margin-bottom:8px">${account ? 'Edit bank account' : 'Add bank account'}</h3>
    <form id="bankAccountForm"><div id="bankAccountMsg"></div>
      ${inp('Bank Name *', 'BankName', 'text', `required value="${esc(account ? account.BankName : '')}"`)}
      ${inp('Account Number *', 'AccountNumber', 'text', `required value="${esc(account ? account.AccountNumber : '')}"`)}
      <div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button>
      <button type="submit" class="btn">Save Bank Account</button></div></form>`, 'sm');
  $('#bankAccountForm', m).onsubmit = async event => {
    event.preventDefault();
    try {
      await busy($('button[type=submit]', event.target), () =>
        api('saveBankAccount', { ...collect(event.target), row: account ? account.row : '' }));
      S.bankAccounts = await api('listBankAccounts');
      closeModal();
      go('admin');
      toast('Bank account saved', 'ok');
    } catch (error) {
      $('#bankAccountMsg', m).innerHTML = `<div class="msg err">${esc(error.server ? error.message : 'Could not save the bank account. Check your connection.')}</div>`;
    }
  };
}
async function deleteBankAccount(row) {
  const account = S.bankAccounts.find(item => item.row === Number(row));
  if (!account || !await confirmBox(`Delete the <b>${esc(account.BankName)}</b> account from acceptance letters?`, 'Delete bank account')) return;
  await api('deleteBankAccount', { row: account.row });
  S.bankAccounts = await api('listBankAccounts');
  toast('Bank account deleted', 'ok');
  go('admin');
}
function editProgrammeFees() {
  const programmes = [
    { level: 'Certificate', programs: CONFIG.PROGRAMMES.Certificate, groups: SEMESTER_GROUPS.slice(0, 1) },
    { level: 'Diploma', programs: CONFIG.PROGRAMMES.Diploma, groups: SEMESTER_GROUPS.slice(0, 3) }
  ];
  const values = new Map(S.programFees.map(item => [`${item.Program}|${item.SemesterGroup}`, item.TotalFees]));
  const fields = [];
  const tables = programmes.map(({ level, programs, groups }) => {
    const rows = programs.map(program => {
      const inputs = groups.map(group => {
        const key = `fee_${fields.length}`;
        fields.push({ key, Program: program, SemesterGroup: group });
        const current = values.get(`${program}|${group}`);
        const value = current === '' || current === undefined ? '' : esc(current);
        return `<td><input type="number" min="0.01" step="0.01" name="${key}" value="${value}" aria-label="${esc(program)} ${esc(group)} fee"></td>`;
      }).join('');
      return `<tr><td>${esc(program)}</td>${inputs}</tr>`;
    }).join('');
    return `<h4 style="color:var(--navy);margin:18px 0 8px">${level}</h4><div class="wrap"><table class="tbl"><thead><tr><th>Programme</th>${groups.map(group => `<th>${esc(group)} (${esc(CONFIG.CURRENCY)})</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('');
  const modalBody = `<h3 style="color:var(--navy);margin-bottom:8px">Programme fees by semester group</h3>
    <p class="sub" style="color:var(--mute);margin-bottom:14px">Enter the semester fees you want to configure. Blank cells are left unchanged. Certificate programmes use Semester 1 and 2; Diploma programmes use Semester 1 and 2, Semester 3 and 4, and Semester 5 and 6. Payments read the matching amount from the PROGRAMME FEES sheet.</p>
    <form id="programmeFeesForm" novalidate>${tables}<div id="programmeFeesMsg"></div><div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="submit" class="btn">Save entered fees</button></div></form>`;
  const m = modal(modalBody);
  $('#programmeFeesForm', m).onsubmit = async e => {
    e.preventDefault();
    const items = fields.map(field => ({
      Program: field.Program,
      SemesterGroup: field.SemesterGroup,
      TotalFees: e.target.elements[field.key].value.trim()
    }));
    try {
      const result = await busy($('button[type=submit]', e.target), () => api('saveProgrammeFees', { items }));
      if (!result.saved) {
        $('#programmeFeesMsg', m).innerHTML = '<div class="msg">No amounts were entered. Existing fees were left unchanged.</div>';
        return;
      }
      S.programFees = await api('listProgrammeFees');
      localStorage.setItem('fbiti_c_programFees', JSON.stringify(S.programFees));
      closeModal();
      toast(`${result.saved} programme semester fee${result.saved === 1 ? '' : 's'} saved`, 'ok');
    } catch (error) {
      $('#programmeFeesMsg', m).innerHTML = `<div class="msg err">${esc(error.server ? error.message : 'Could not save fees. Check your connection.')}</div>`;
    }
  };
}
async function emailRegistrationNumbers() {
  if (!await confirmBox('Email each existing student their registration number. Valid student and guardian email addresses on file will receive the message. Successfully sent records will not be emailed again.', 'Send emails')) return;
  toast('Sending emails… this can take a while', '');
  const result = await api('emailRegistrationNumbers');
  const summary = `${result.sent} sent, ${result.failed} failed, ${result.deferred} deferred, ${result.withoutEmail} without a valid email`;
  toast(`Registration email run complete: ${summary}`, result.failed || result.deferred ? 'warn' : 'ok');
}
function editUserAccount(id) {
  const user = S.users.find(u => u.UserID === id);
  if (!user) return toast('User not found', 'err');
  const m = modal(`<h3 style="color:var(--navy);margin-bottom:6px">Edit user account</h3><p class="sub" style="color:var(--mute);margin-bottom:14px">${esc(user.Email)}</p>
  <form id="userEditForm"><div id="userEditMsg"></div>${inp('Full name', 'fullName', 'text', `required value="${esc(user.FullName)}"`)}
  ${inp('Username', 'username', 'text', `required minlength="3" value="${esc(user.Username)}"`)}
  ${user.UserID !== S.user.id ? `<label class="f"><span>Account role</span><select name="role">${['Master Admin', 'Admin', 'Bursar'].map(role => `<option ${role === user.Role ? 'selected' : ''}>${role}</option>`).join('')}</select></label>` : ''}
  ${inp('New password (leave blank to keep current)', 'newPassword', 'password', 'minlength="6" autocomplete="new-password"')}
  <div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" type="submit">Save changes</button></div></form>`, 'sm');
  $('#userEditForm', m).onsubmit = async e => {
    e.preventDefault();
    const data = collect(e.target);
    try {
      const updated = await busy($('button[type=submit]', e.target), () => api('updateUserAccount', { id, ...data }));
      if (updated.UserID === S.user.id) {
        S.user.fullName = updated.FullName;
        S.user.username = updated.Username;
        localStorage.setItem('fbiti_session', JSON.stringify({ token: S.token, user: S.user }));
        showApp();
      }
      closeModal();
      toast('User account updated', 'ok');
      go('admin');
    } catch (error) {
      $('#userEditMsg', m).innerHTML = `<div class="msg err">${esc(error.server ? error.message : 'Cannot reach the server. Check your internet connection.')}</div>`;
    }
  };
}
async function setStatus(id, status, approvedRole) {
  try {
    const r = await api('setUserStatus', { id, status, approvedRole });
    const message = `User ${status.toLowerCase()}${r.emailed ? ' – email sent' : ' (email could not be sent' + (r.emailError ? ': ' + r.emailError : '') + ')'}`;
    toast(message, r.emailed ? 'ok' : 'warn');
    go('admin');
  }
  catch (e) { toast(e.server ? e.message : 'Action failed – check your connection', 'err'); }
}

async function pageBin() {
  S.bin = await api('listBin');
  $('#view').innerHTML = `<div class="panel"><b>Recycle Bin</b><p style="color:var(--mute);margin-top:6px;line-height:1.6">Deleted students and users are kept for 30 days. Deleted expenditure remains here until a Master Admin restores or permanently deletes it. Fees are voided with a reason and can be reinstated from the Fees page.</p></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>Type</th><th>Record</th><th>Deleted by</th><th>Deleted</th><th>Auto-removal</th><th>Actions</th></tr></thead><tbody>
  ${S.bin.length ? S.bin.map(b => `<tr><td><span class="badge b-info">${esc(b.Type)}</span></td><td>${esc(b.Label)}</td><td>${esc(b.DeletedBy)}</td><td>${esc(fmtDate(b.DeletedAt))}</td><td>${b.ExpiresAt ? `${Math.max(0, Math.ceil((Date.parse(b.ExpiresAt) - Date.now()) / 86400000))} day(s)` : 'Until deleted by Master Admin'}</td>
  <td><button class="btn sm" data-act="restore" data-id="${esc(b.BinID)}">↩ Restore</button> <button class="btn sm danger" data-act="purge" data-id="${esc(b.BinID)}">Delete forever</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">The recycle bin is empty</td></tr>'}</tbody></table></div>`;
}

/* =====================  PROFILE  ===================== */
function ownAccountDeleteDialog(options) {
  return new Promise(resolve => {
    const required = options.requiresTransfer;
    const adminOptions = options.admins.map(a => `<option value="${esc(a.UserID)}">${esc(a.FullName)} (${esc(a.Username)})</option>`).join('');
    const transferField = options.admins.length
      ? `<label class="f"><span>${required ? 'Transfer ownership to an approved Admin *' : 'Optionally transfer ownership'}</span><select id="transferOwner"><option value="">${required ? '— Select an Admin —' : 'Do not transfer'}</option>${adminOptions}</select></label>`
      : '';
    const message = required
      ? 'You are the only Master Admin. Transfer ownership to an approved Admin before deleting your account.'
      : 'Your account will be removed and placed in the Recycle Bin. You will be signed out.';
    const m = modal(`<h3 style="color:var(--bad);margin-bottom:10px">Delete my account</h3><p style="line-height:1.6">${esc(message)}</p>
      ${transferField}<div id="deleteAccountMsg"></div><div class="row end"><button class="btn ghost" id="cancelDeleteAccount">Cancel</button>
      ${required && !options.admins.length ? '' : '<button class="btn danger" id="confirmDeleteAccount">Delete account</button>'}</div>`, 'sm');
    $('.x', m).onclick = e => { e.preventDefault(); e.stopPropagation(); closeModal(); resolve(null); };
    $('#cancelDeleteAccount', m).onclick = () => { closeModal(); resolve(null); };
    const confirm = $('#confirmDeleteAccount', m);
    if (!confirm) return;
    confirm.onclick = () => {
      const transferToId = $('#transferOwner', m)?.value || '';
      if (required && !transferToId)
        return $('#deleteAccountMsg', m).innerHTML = '<div class="msg err">Choose an approved Admin to receive ownership.</div>';
      closeModal();
      resolve({ transferToId });
    };
  });
}
async function deleteOwnAccount() {
  try {
    const options = await api('accountDeletionOptions');
    const choice = await ownAccountDeleteDialog(options);
    if (!choice) return;
    await api('deleteOwnAccount', choice);
    toast('Your account was deleted', 'ok');
    await logout(true);
  } catch (error) {
    toast(error.server ? error.message : 'Could not delete the account. Check your connection.', 'err');
  }
}
function pageProfile() {
  $('#view').innerHTML = `<div class="g2"><div class="panel"><h3 style="color:var(--navy);margin-bottom:4px">Change username</h3><p class="sub" style="color:var(--mute);margin-bottom:14px">Signed in as <b>${esc(S.user.username)}</b></p><div id="pm1"></div>
  <form id="pf1">${inp('New username', 'newUsername', 'text', 'required minlength="3"')}<button class="btn">Update username</button></form></div>
  <div class="panel"><h3 style="color:var(--navy);margin-bottom:14px">Change password</h3><div id="pm2"></div>
  <form id="pf2">${inp('Old password', 'oldPassword', 'password', 'required')}${inp('New password', 'newPassword', 'password', 'required minlength="6"')}${inp('Confirm new password', 'confirm', 'password', 'required')}<button class="btn">Update password</button></form></div></div>
  <div class="panel" style="margin-top:16px;border:1px solid #f2c4c0"><h3 style="color:var(--bad);margin-bottom:6px">Delete account</h3>
  <p class="sub" style="margin-bottom:14px">Delete your account and sign out. A sole Master Admin must transfer ownership to another approved Admin first.</p>
  <button class="btn danger" data-act="deleteOwnAccount">Delete my account</button></div>`;
  const send = async (e, box, payload, after) => {
    e.preventDefault(); const m = t => $(box).innerHTML = `<div class="msg ${t[0]}">${esc(t[1])}</div>`;
    try { const r = await busy($('button', e.target), () => api('updateProfile', payload)); after(r); m(['ok', 'Saved successfully']); }
    catch (x) { m(['err', x.server ? x.message : 'No connection']); }
  };
  $('#pf1').onsubmit = e => send(e, '#pm1', { newUsername: collect(e.target).newUsername }, r => { S.user.username = r.username; localStorage.setItem('fbiti_session', JSON.stringify({ token: S.token, user: S.user })); e.target.reset(); });
  $('#pf2').onsubmit = e => {
    const d = collect(e.target);
    if (d.newPassword !== d.confirm) { e.preventDefault(); return $('#pm2').innerHTML = '<div class="msg err">New passwords do not match</div>'; }
    send(e, '#pm2', { oldPassword: d.oldPassword, newPassword: d.newPassword }, () => e.target.reset());
  };
}

const PAGES = { home: pageHome, students: pageStudents, fees: pageFees, formPayments: pageFormPayments, exp: pageExp, report: pageReport, admin: pageAdmin, bin: pageBin, profile: pageProfile };

/* =====================  ACTIONS (click delegation)  ===================== */
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.server ? e.message : 'Action failed – check your connection', 'err'); } };
const ACT = {
  closeModal, auth: showAuth, go, logout: () => logout(), menu: () => $('#side').classList.toggle('open'), syncNow: () => syncDrafts(true),
  installApp,
  discard: id => { putDrafts(drafts().filter(d => d.id !== id)); go(S.page); },
  addStudent: () => studentForm(),
  editStudent: id => { const s = S.students.find(x => x.RegistrationNumber === id); if (s) studentForm(s); },
  viewStudent: id => { const s = S.students.find(x => x.RegistrationNumber === id); if (s) studentView(s); },
  delStudent: guard(async id => {
    const s = S.students.find(x => x.RegistrationNumber === id);
    if (!s) return;
    if (!await confirmBox(`Move <b>${esc(s.FullName)}</b> (${esc(id)}) to the Recycle Bin? An administrator can restore it within 30 days. Fee records are kept.`, 'Delete')) return;
    await api('deleteStudent', { id }); toast('Moved to Recycle Bin', 'ok'); go('students');
  }),
  printStudents,
  snap: async () => {
    try {
      const render = await loadHtml2Canvas();
      const el = $('#snap'), c = await render(el, { scale: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a'); a.download = `${el.dataset.sid}.png`; a.href = c.toDataURL('image/png'); a.click();
    } catch (error) {
      toast('Image library could not be loaded – check your internet connection', 'err');
    }
  },
  downloadAcceptance: id => downloadAcceptanceLetter(id),
  printReceipt: guard(async (id, button) => {
    const receipt = JSON.parse(button.closest('.modal-back').dataset.receipt || 'null');
    if (receipt) {
      const assets = await ensureDocumentAssets();
      printDoc(`Payment Receipt – ${receipt.receiptNumber}`, receiptMarkup(receipt, assets), 'landscape');
    }
  }),
  printSavedReceipt: guard(async id => {
    const record = S.fees.find(row => row.FeeID === id);
    if (record) await printSavedReceipt(record);
  }),
  printReceiptHistory: guard(async (id, button) => {
    const record = S.fees.find(row => row.FeeID === id);
    const receipt = record && receiptHistory(record)[Number(button.dataset.index)];
    if (receipt) {
      const assets = await ensureDocumentAssets();
      printDoc(`Payment Receipt – ${receipt.receiptNumber}`, receiptMarkup(receipt, assets), 'landscape');
    }
  }),
  addFee: () => feeForm(),
  addFormPayment: () => formPaymentForm(),
  deleteFormPayment: guard(async row => {
    if (!isMasterAdmin()) return toast('Only a Master Admin can delete form payment records', 'err');
    const record = S.formPayments.find(item => item.row === Number(row));
    if (!record || !await confirmBox(`Delete the form payment record for <b>${esc(record.FullName)}</b>?`, 'Delete form payment')) return;
    await api('deleteFormPayment', { row: record.row });
    toast('Form payment record deleted', 'ok');
    go('formPayments');
  }),
  viewFee: id => { const r = S.fees.find(x => x.FeeID === id); if (r) feeView(r); },
  editFee: id => { const r = S.fees.find(x => x.FeeID === id); if (r) feeForm(r); },
  voidFee: guard(async id => { const r = await ask('Delete payment record', 'Reason for deleting'); if (!r) return; await api('voidFee', { id, reason: r }); toast('Payment record deleted (kept in the audit trail)', 'ok'); go('fees'); }),
  reinstateFee: guard(async id => { await api('reinstateFee', { id }); toast('Record reinstated', 'ok'); go('fees'); }),
  addExp: () => expForm(), printExp,
  voidExp: guard(async id => { const r = await ask('Void expenditure record', 'Reason for voiding'); if (!r) return; await api('voidExpenditure', { id, reason: r }); toast('Record voided', 'ok'); go('exp'); }),
  reinstateExp: guard(async id => { await api('reinstateExpenditure', { id }); toast('Record reinstated', 'ok'); go('exp'); }),
  deleteExp: guard(async id => {
    if (!isMasterAdmin()) return toast('Only a Master Admin can delete expenditure records', 'err');
    const record = S.exp.find(row => row.ExpID === id);
    if (!record) return;
    if (!await confirmBox(`Move <b>${esc(record.ExpID)} – ${esc(record.Name)}</b> to the Recycle Bin? It will stay there until a Master Admin restores or permanently deletes it.`, 'Move to Recycle Bin')) return;
    await api('deleteExpenditure', { id });
    toast('Expenditure moved to Recycle Bin', 'ok');
    go('exp');
  }),
  printReport: () => { const k = $('#rt').value; printDoc(REPORTS[k][0] + ' Report', REPORTS[k][1]()); },
  approve: (id, button) => setStatus(id, 'Approved', button.closest('tr').querySelector('[data-approval-role]').value), deny: id => setStatus(id, 'Denied'),
  editUser: id => editUserAccount(id), editProgrammeFees, emailRegistrationNumbers: guard(emailRegistrationNumbers),
  addBankAccount: () => bankAccountForm(),
  editBankAccount: row => bankAccountForm(row),
  deleteBankAccount: guard(deleteBankAccount),
  delUser: guard(async id => { if (!await confirmBox('Move this user to the Recycle Bin?', 'Delete')) return; await api('deleteUser', { id }); toast('User moved to Recycle Bin', 'ok'); go('admin'); }),
  deleteOwnAccount,
  restore: guard(async id => { await api('restoreBin', { id }); toast('Record restored', 'ok'); go('bin'); }),
  purge: guard(async id => { if (!await confirmBox('Permanently delete this item? This cannot be undone.', 'Delete forever')) return; await api('purgeBin', { id }); go('bin'); })
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const f = ACT[b.dataset.act]; if (f) { e.preventDefault(); f(b.dataset.id, b); }
});