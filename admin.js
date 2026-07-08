const $ = (id) => document.getElementById(id);
let token = localStorage.getItem('lakofon_token') || '';

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3500);
}

async function api(url, opts = {}) {
  opts.headers = { ...(opts.headers || {}), 'x-admin-token': token };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) { logout(); throw new Error('Sesija istekla — prijavi se ponovo.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Greška');
  return data;
}

// ---- Auth ----
function showDash() {
  $('loginView').style.display = 'none';
  $('dashView').style.display = 'block';
  $('logoutBtn').style.display = 'inline-flex';
  loadAll();
}
function logout() {
  token = ''; localStorage.removeItem('lakofon_token');
  $('loginView').style.display = 'block';
  $('dashView').style.display = 'none';
  $('logoutBtn').style.display = 'none';
}
$('logoutBtn').addEventListener('click', logout);

$('loginBtn').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('loginEmail').value, password: $('password').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    token = data.token;
    localStorage.setItem('lakofon_token', token);
    showDash();
  } catch (e) { toast(e.message, 'err'); }
});
$('password').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
$('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') $('password').focus(); });

// ---- Tabs ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ---- Load everything ----
async function loadAll() {
  await Promise.all([loadStats(), loadRequests(), loadSubjects(), loadSettings()]);
}

async function loadStats() {
  const s = await api('/api/admin/stats');
  $('stTotal').textContent = s.total;
  $('stNovo').textContent = s.novo;
  $('stDone').textContent = s.zavrseno;
  $('stRevenue').textContent = s.prihod;
}

const ALL_STATUSES = ['novo', 'primljeno', 'uradu', 'zavrseno'];
const STATUS_LABELS = { novo: 'Novi', primljeno: 'Primljeni', uradu: 'U radu', zavrseno: 'Završeni' };
let activeStatus = 'novo';
let allRequests = [];

function esc(s) { return (s ?? '').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function moveOptions(current) {
  return ALL_STATUSES.filter(s => s !== current).map(s =>
    `<button class="btn ghost sm moveBtn" data-status="${s}" style="margin:2px 0;white-space:nowrap">→ ${STATUS_LABELS[s]}</button>`
  ).join('');
}

function renderRow(r) {
  const d = new Date(r.created_at).toLocaleString('sr-RS');
  const att = r.attachment_name
    ? `<a href="/api/admin/requests/${r.id}/attachment?token=${token}" class="mini">⬇ ${esc(r.attachment_name)}</a>`
    : '<span class="mini">—</span>';
  const proof = r.payment_proof_name
    ? `<a href="/api/admin/requests/${r.id}/proof?token=${token}" target="_blank" class="mini">🧾 Pogledaj</a>`
    : '<span class="mini">—</span>';
  const msgText = r.message && r.message.length > 50 ? r.message.slice(0, 50) + '…' : r.message;
  const msg = r.message ? `<div class="mini" style="margin-top:4px;max-width:220px" title="${esc(r.message)}">${esc(msgText)}</div>` : '';
  return `<tr class="${r.status === 'zavrseno' ? 'row-done' : ''}" data-rid="${r.id}">
    <td>${r.id}</td>
    <td class="mini">${d}</td>
    <td>${esc(r.ime)} ${esc(r.prezime)}${msg}</td>
    <td class="mini">${esc(r.index_broj)}<br>${esc(r.email)}</td>
    <td>${esc(r.subject_name)}${r.item_name ? `<div class="mini">↳ ${esc(r.item_name)}</div>` : ''}</td>
    <td>${r.price ? r.price + ' RSD' : '—'}</td>
    <td>${att}</td>
    <td>${proof}</td>
    <td class="move-cell">${moveOptions(r.status)}</td>
    <td>
      <button class="btn sm replyReq" data-id="${r.id}" data-email="${esc(r.email)}" data-name="${esc(r.ime)} ${esc(r.prezime)}" data-subject="${esc(r.subject_name)}${r.item_name ? ' — ' + esc(r.item_name) : ''}">✉ Odgovori</button>
      <button class="btn danger sm delReq" data-id="${r.id}" style="margin-top:4px">Obriši</button>
    </td>
  </tr>`;
}

function renderActiveTab() {
  const filtered = allRequests.filter(r => r.status === activeStatus);
  const body = $('reqBody');
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="10" class="center mini">Nema zahteva u ovoj kategoriji.</td></tr>`;
  } else {
    body.innerHTML = filtered.map(renderRow).join('');
  }
  bindRowEvents();
}

function updateCounts() {
  for (const s of ALL_STATUSES) {
    const el = $('cnt' + s.charAt(0).toUpperCase() + s.slice(1));
    if (el) el.textContent = allRequests.filter(r => r.status === s).length;
  }
}

function setActiveTab(status) {
  activeStatus = status;
  document.querySelectorAll('.req-tab').forEach(t => t.classList.toggle('active', t.dataset.status === status));
  renderActiveTab();
}

document.getElementById('reqTabs').addEventListener('click', e => {
  const tab = e.target.closest('.req-tab');
  if (tab) setActiveTab(tab.dataset.status);
});

function bindRowEvents() {
  document.querySelectorAll('.moveBtn').forEach(btn => btn.addEventListener('click', async e => {
    const row = e.target.closest('tr');
    const id = row.dataset.rid;
    const newStatus = e.target.dataset.status;
    await api(`/api/admin/requests/${id}`, { method: 'PATCH', body: { status: newStatus } });
    toast(`Zahtev #${id} → ${STATUS_LABELS[newStatus]}`, 'ok');
    loadStats(); loadRequests();
  }));
  document.querySelectorAll('.delReq').forEach(btn => btn.addEventListener('click', async e => {
    if (!confirm('Obrisati zahtev?')) return;
    await api(`/api/admin/requests/${e.target.dataset.id}`, { method: 'DELETE' });
    toast('Obrisano.', 'ok'); loadStats(); loadRequests();
  }));
  document.querySelectorAll('.replyReq').forEach(btn => btn.addEventListener('click', e => {
    const b = e.target;
    openReplyModal(b.dataset.id, b.dataset.email, b.dataset.name, b.dataset.subject);
  }));
}

async function loadRequests() {
  allRequests = await api('/api/admin/requests');
  updateCounts();
  renderActiveTab();
}

async function loadSubjects() {
  const rows = await api('/api/admin/subjects');
  const list = $('subjectsList');

  list.innerHTML = rows.map(s => {
    const items = s.items || [];
    const hasItems = items.length > 0;
    const itemsHtml = items.map(it => `
      <div class="item-row" data-id="${it.id}">
        <input value="${esc(it.name)}" class="iName" data-id="${it.id}" placeholder="Naziv podstavke" />
        <input type="number" value="${it.price}" class="iPrice" data-id="${it.id}" placeholder="Cena" />
        <label class="chk"><input type="checkbox" class="iActive" data-id="${it.id}" ${it.active ? 'checked' : ''}/> aktivna</label>
        <button class="btn ok sm iSave" data-id="${it.id}">Sačuvaj</button>
        <button class="btn danger sm iDel" data-id="${it.id}">✕</button>
      </div>`).join('');

    return `<div class="subj-block" data-id="${s.id}">
      <div class="subj-head">
        <input value="${esc(s.name)}" class="sName" data-id="${s.id}" placeholder="Naziv predmeta" />
        <input type="number" value="${s.price}" class="sPrice" data-id="${s.id}" placeholder="Osnovna cena" title="Koristi se samo ako predmet nema podstavke" />
        <label class="chk"><input type="checkbox" class="sActive" data-id="${s.id}" ${s.active ? 'checked' : ''}/> aktivan</label>
        <button class="btn ok sm sSave" data-id="${s.id}">Sačuvaj</button>
        <button class="btn danger sm sDel" data-id="${s.id}">Obriši</button>
      </div>
      <div class="subj-items">
        <div class="mini" style="margin:6px 0">Podstavke ${hasItems ? '' : '(nema — koristi se osnovna cena predmeta)'}</div>
        ${itemsHtml}
        <div class="item-row add">
          <input class="niName" data-id="${s.id}" placeholder="Nova podstavka (npr. Kolokvijum 1)" />
          <input type="number" class="niPrice" data-id="${s.id}" placeholder="Cena" value="0" />
          <button class="btn sm iAdd" data-id="${s.id}">+ Dodaj podstavku</button>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="mini">Još nema predmeta.</div>';

  // Predmet: sačuvaj / obriši
  list.querySelectorAll('.sSave').forEach(btn => btn.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    await api(`/api/admin/subjects/${id}`, { method: 'PATCH', body: {
      name: list.querySelector(`.sName[data-id="${id}"]`).value,
      price: list.querySelector(`.sPrice[data-id="${id}"]`).value,
      active: list.querySelector(`.sActive[data-id="${id}"]`).checked
    }});
    toast('Predmet sačuvan.', 'ok');
  }));
  list.querySelectorAll('.sDel').forEach(btn => btn.addEventListener('click', async e => {
    if (!confirm('Obrisati predmet i sve njegove podstavke?')) return;
    await api(`/api/admin/subjects/${e.target.dataset.id}`, { method: 'DELETE' });
    toast('Obrisano.', 'ok'); loadSubjects();
  }));

  // Podstavke: dodaj / sačuvaj / obriši
  list.querySelectorAll('.iAdd').forEach(btn => btn.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    const name = list.querySelector(`.niName[data-id="${id}"]`).value.trim();
    const price = list.querySelector(`.niPrice[data-id="${id}"]`).value;
    if (!name) return toast('Unesi naziv podstavke.', 'err');
    await api(`/api/admin/subjects/${id}/items`, { method: 'POST', body: { name, price } });
    toast('Podstavka dodata.', 'ok'); loadSubjects();
  }));
  list.querySelectorAll('.iSave').forEach(btn => btn.addEventListener('click', async e => {
    const id = e.target.dataset.id;
    await api(`/api/admin/items/${id}`, { method: 'PATCH', body: {
      name: list.querySelector(`.iName[data-id="${id}"]`).value,
      price: list.querySelector(`.iPrice[data-id="${id}"]`).value,
      active: list.querySelector(`.iActive[data-id="${id}"]`).checked
    }});
    toast('Podstavka sačuvana.', 'ok');
  }));
  list.querySelectorAll('.iDel').forEach(btn => btn.addEventListener('click', async e => {
    if (!confirm('Obrisati podstavku?')) return;
    await api(`/api/admin/items/${e.target.dataset.id}`, { method: 'DELETE' });
    toast('Obrisano.', 'ok'); loadSubjects();
  }));
}

$('addSubBtn').addEventListener('click', async () => {
  const name = $('newSubName').value.trim();
  const price = $('newSubPrice').value;
  if (!name) return toast('Unesi naziv.', 'err');
  await api('/api/admin/subjects', { method: 'POST', body: { name, price } });
  $('newSubName').value = ''; $('newSubPrice').value = '0';
  toast('Predmet dodat.', 'ok'); loadSubjects();
});

const SETTING_FIELDS = ['admin_login_email', 'admin_email', 'pay_recipient', 'pay_account', 'pay_model', 'pay_reference', 'pay_purpose', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'];
async function loadSettings() {
  const s = await api('/api/admin/settings');
  SETTING_FIELDS.forEach(f => { if ($(f)) $(f).value = s[f] || ''; });
}
$('saveSettingsBtn').addEventListener('click', async () => {
  const body = {};
  SETTING_FIELDS.forEach(f => { body[f] = $(f).value; });
  if ($('admin_password').value) body.admin_password = $('admin_password').value;
  await api('/api/admin/settings', { method: 'PUT', body });
  $('admin_password').value = '';
  toast('Podešavanja sačuvana.', 'ok');
});

$('refreshBtn').addEventListener('click', () => { loadStats(); loadRequests(); });

// ---- Reply modal ----
let replyRequestId = null;

function openReplyModal(id, email, name, subject) {
  replyRequestId = id;
  $('replyTo').textContent = `Za: ${name} (${email}) — ${subject}`;
  $('replySubject').value = `LakoFon — ${subject}`;
  $('replyMessage').value = '';
  $('replyFile').value = '';
  $('replyModal').classList.add('show');
}

$('replyCancelBtn').addEventListener('click', () => $('replyModal').classList.remove('show'));

$('replySendBtn').addEventListener('click', async () => {
  const msg = $('replyMessage').value.trim();
  if (!msg) return toast('Upiši poruku.', 'err');
  const btn = $('replySendBtn');
  btn.disabled = true; btn.textContent = 'Šaljem…';
  try {
    const fd = new FormData();
    fd.append('subject', $('replySubject').value.trim());
    fd.append('message', msg);
    if ($('replyFile').files[0]) fd.append('attachment', $('replyFile').files[0]);
    const res = await fetch(`/api/admin/requests/${replyRequestId}/reply`, {
      method: 'POST', headers: { 'x-admin-token': token }, body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Greška');
    $('replyModal').classList.remove('show');
    toast('Odgovor poslat!', 'ok');
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Pošalji odgovor'; }
});

// Auto-login ako imamo token
if (token) showDash();
