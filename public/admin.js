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

const STATUSES = { novo: 'Novo', uradu: 'U radu', zavrseno: 'Završeno' };
function esc(s) { return (s ?? '').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function loadRequests() {
  const rows = await api('/api/admin/requests');
  const body = $('reqBody');
  if (!rows.length) { body.innerHTML = '<tr><td colspan="11" class="center mini">Još nema zahteva.</td></tr>'; return; }
  body.innerHTML = rows.map(r => {
    const d = new Date(r.created_at).toLocaleString('sr-RS');
    const att = r.attachment_name
      ? `<a href="/api/admin/requests/${r.id}/attachment?token=${token}" class="mini">⬇ ${esc(r.attachment_name)}</a>`
      : '<span class="mini">—</span>';
    const proof = r.payment_proof_name
      ? `<a href="/api/admin/requests/${r.id}/proof?token=${token}" class="mini">🧾 ${esc(r.payment_proof_name)}</a>`
      : '<span class="mini">—</span>';
    const opts = Object.entries(STATUSES).map(([k, v]) =>
      `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('');
    const msg = r.message ? `<div class="mini" style="margin-top:4px;max-width:220px">${esc(r.message)}</div>` : '';
    return `<tr>
      <td>${r.id}</td>
      <td class="mini">${d}</td>
      <td>${esc(r.ime)} ${esc(r.prezime)}${msg}</td>
      <td class="mini">${esc(r.index_broj)}<br>${esc(r.email)}</td>
      <td>${esc(r.subject_name)}${r.item_name ? `<div class="mini">↳ ${esc(r.item_name)}</div>` : ''}</td>
      <td>${r.price ? r.price + ' RSD' : '—'}</td>
      <td>${att}</td>
      <td>${proof}</td>
      <td><span class="tag ${r.status}">${STATUSES[r.status] || r.status}</span></td>
      <td>
        <select class="statusSel sm" data-id="${r.id}" style="padding:6px;font-size:12px">${opts}</select>
        <button class="btn danger sm delReq" data-id="${r.id}" style="margin-top:6px">Obriši</button>
      </td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.statusSel').forEach(sel => sel.addEventListener('change', async e => {
    await api(`/api/admin/requests/${e.target.dataset.id}`, { method: 'PATCH', body: { status: e.target.value } });
    toast('Status ažuriran.', 'ok'); loadStats(); loadRequests();
  }));
  body.querySelectorAll('.delReq').forEach(btn => btn.addEventListener('click', async e => {
    if (!confirm('Obrisati zahtev?')) return;
    await api(`/api/admin/requests/${e.target.dataset.id}`, { method: 'DELETE' });
    toast('Obrisano.', 'ok'); loadStats(); loadRequests();
  }));
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

const SETTING_FIELDS = ['admin_login_email', 'admin_email', 'pay_recipient', 'pay_account', 'pay_model', 'pay_reference', 'pay_purpose', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'];
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

// Auto-login ako imamo token
if (token) showDash();
