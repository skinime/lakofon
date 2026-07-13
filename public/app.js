const $ = (id) => document.getElementById(id);
let subjects = [];
let userEditedEmail = false;

// Transliteracija prvog slova (š->s, č->c, ć->c, ž->z, đ->d) za latinicu i ćirilicu
function firstLatinLetter(str) {
  if (!str) return '';
  const ch = str.trim()[0]?.toLowerCase() || '';
  const map = {
    'š':'s','č':'c','ć':'c','ž':'z','đ':'d',
    'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'d','е':'e','ж':'z','з':'z',
    'и':'i','ј':'j','к':'k','л':'l','љ':'l','м':'m','н':'n','њ':'n','о':'o',
    'п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c',
    'ч':'c','џ':'d','ш':'s'
  };
  return map[ch] || ch;
}

// Iz "2024/0138" -> {year:"2024", num:"0138"}
function parseIndex(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d{4})\s*[\/\-]?\s*(\d{1,4})/);
  if (!m) return null;
  const year = m[1];
  const num = m[2].padStart(4, '0').slice(-4);
  return { year, num };
}

function buildEmail() {
  const ime = $('ime').value;
  const prezime = $('prezime').value;
  const idx = parseIndex($('index').value);
  const a = firstLatinLetter(ime);
  const b = firstLatinLetter(prezime);
  if (a && b && idx) {
    return `${a}${b}${idx.year}${idx.num}@student.fon.bg.ac.rs`;
  }
  return '';
}

function refreshEmail() {
  const email = buildEmail();
  if (!userEditedEmail && email) {
    $('email').value = email;
  }
}

['ime', 'prezime', 'index'].forEach(id => $(id).addEventListener('input', refreshEmail));
$('email').addEventListener('input', () => { userEditedEmail = true; });

// Ako obriše sopstveni mejl, ponovo predlaži
$('email').addEventListener('blur', () => {
  if (!$('email').value.trim()) { userEditedEmail = false; refreshEmail(); }
});

// Učitaj predmete
async function loadSubjects() {
  const res = await fetch('/api/subjects');
  subjects = await res.json();
  const sel = $('subject');
  for (const s of subjects) {
    const opt = document.createElement('option');
    opt.value = s.id;
    // Ako predmet ima podstavke, cena zavisi od podstavke pa je ne prikazujemo na predmetu
    const hasItems = (s.items || []).length > 0;
    opt.textContent = (!hasItems && s.price > 0) ? `${s.name} — ${s.price} RSD` : s.name;
    sel.appendChild(opt);
  }
  const other = document.createElement('option');
  other.value = 'other';
  other.textContent = 'Ostalo (upiši sam)…';
  sel.appendChild(other);
}

// Trenutno izabrani predmet / podstavka i efektivna cena
function currentSelection() {
  const val = $('subject').value;
  if (val === 'other' || !val) return { sub: null, hasItems: false, item: null, price: 0 };
  const sub = subjects.find(s => String(s.id) === val);
  const items = sub?.items || [];
  const hasItems = items.length > 0;
  const item = hasItems ? items.find(it => String(it.id) === $('subjectItem').value) : null;
  const price = hasItems ? (item ? item.price : 0) : (sub ? sub.price : 0);
  return { sub, hasItems, item, price };
}

function refreshPriceBadge() {
  const { hasItems, item, price } = currentSelection();
  const badge = $('priceBadge');
  // Ako predmet ima podstavke a nijedna nije izabrana — sakrij dok ne izabere
  if ((hasItems && !item) || price <= 0) badge.classList.remove('show');
  else { $('priceVal').textContent = price; badge.classList.add('show'); }
}

$('subject').addEventListener('change', (e) => {
  const val = e.target.value;
  $('otherWrap').style.display = val === 'other' ? 'block' : 'none';
  const sub = subjects.find(s => String(s.id) === val);
  const items = sub?.items || [];
  const itemSel = $('subjectItem');

  if (items.length > 0) {
    itemSel.innerHTML = '<option value="" disabled selected>Izaberi podstavku…</option>';
    for (const it of items) {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.name;
      itemSel.appendChild(o);
    }
    $('itemWrap').style.display = 'block';
  } else {
    $('itemWrap').style.display = 'none';
    itemSel.innerHTML = '';
  }
  refreshPriceBadge();
});

$('subjectItem').addEventListener('change', refreshPriceBadge);

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3500);
}

// Payment modal (uplatnica)
function showPayModal(price) {
  const ime = $('ime').value.trim();
  const prezime = $('prezime').value.trim();
  const idx = $('index').value.trim();
  const { sub, item } = currentSelection();
  const subjectLabel = item ? `${sub.name} — ${item.name}` : (sub ? sub.name : '');

  $('mAmount').textContent = `${price} RSD`;
  $('mAmountField').textContent = `${price},00`;
  $('mPayer').textContent = `${ime} ${prezime}, ${idx}`;
  $('mPurpose').textContent = subjectLabel;
  $('mRecipient').textContent = 'LakoFon';
  $('mAccount').textContent = '160-6000002214253-44';
  $('payModal').classList.add('show');
}
$('payCancel').addEventListener('click', () => $('payModal').classList.remove('show'));
$('payConfirm').addEventListener('click', () => {
  $('payModal').classList.remove('show');
  submitRequest();
});

function validate() {
  if (!$('ime').value.trim() || !$('prezime').value.trim() || !$('index').value.trim()) {
    toast('Popuni ime, prezime i broj indeksa.', 'err'); return false;
  }
  if (!$('email').value.trim()) { toast('Nedostaje mejl.', 'err'); return false; }
  const val = $('subject').value;
  if (!val) { toast('Izaberi predmet.', 'err'); return false; }
  if (val === 'other' && !$('subjectOther').value.trim()) {
    toast('Upiši naziv predmeta.', 'err'); return false;
  }
  const { hasItems, item } = currentSelection();
  if (hasItems && !item) { toast('Izaberi podstavku predmeta.', 'err'); return false; }
  return true;
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate()) return;
  // Uplatnica privremeno isključena — zahtev se šalje direktno
  submitRequest();
});

async function submitRequest() {
  const btn = $('submitBtn');
  btn.disabled = true; btn.textContent = 'Šaljem…';
  try {
    const fd = new FormData();
    fd.append('ime', $('ime').value.trim());
    fd.append('prezime', $('prezime').value.trim());
    fd.append('index_broj', $('index').value.trim());
    fd.append('email', $('email').value.trim());
    fd.append('telefon', $('telefon').value.trim());
    fd.append('subject_id', $('subject').value);
    fd.append('subject_other', $('subjectOther').value.trim());
    fd.append('item_id', $('subjectItem').value || '');
    fd.append('message', $('message').value.trim());
    fd.append('rok', $('rok').value || '');
    if ($('attachment').files[0]) fd.append('attachment', $('attachment').files[0]);
    if ($('paymentProof').files[0]) fd.append('payment_proof', $('paymentProof').files[0]);

    const res = await fetch('/api/requests', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Greška');

    toast('Zahtev uspešno poslat! ✅', 'ok');
    $('form').reset();
    $('paymentProof').value = '';
    $('priceBadge').classList.remove('show');
    $('otherWrap').style.display = 'none';
    $('itemWrap').style.display = 'none';
    userEditedEmail = false;
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Pošalji zahtev';
  }
}

loadSubjects();
