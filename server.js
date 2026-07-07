import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, settingsAll, setting, setSettingValue } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Upload konfiguracija ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^\w.\-]+/g, '_');
    cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// ---- Admin auth (jednostavan token u memoriji) ----
const sessions = new Set();
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token && sessions.has(token)) return next();
  res.status(401).json({ error: 'Neautorizovano' });
}

// ---- Mejl ----
async function sendAdminEmail(reqData) {
  const host = setting('smtp_host');
  const user = setting('smtp_user');
  const pass = setting('smtp_pass');
  if (!host || !user || !pass) {
    console.log('[mejl] SMTP nije podešen — preskačem slanje. Zahtev je sačuvan u bazi.');
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(setting('smtp_port') || 587),
      secure: Number(setting('smtp_port')) === 465,
      auth: { user, pass }
    });
    const to = setting('admin_email');
    const attachments = [];
    if (reqData.attachment_path) {
      attachments.push({ filename: reqData.attachment_name, path: reqData.attachment_path });
    }
    if (reqData.payment_proof_path) {
      attachments.push({ filename: 'DOKAZ_' + reqData.payment_proof_name, path: reqData.payment_proof_path });
    }
    const priceLine = reqData.price ? `Cena: ${reqData.price} RSD\n` : '';
    await transporter.sendMail({
      from: user,
      to,
      subject: `Lakofon — novi zahtev: ${reqData.subject_name}`,
      text:
`Novi zahtev preko Lakofon platforme.

Ime i prezime: ${reqData.ime} ${reqData.prezime}
Broj indeksa: ${reqData.index_broj}
Studentski mejl: ${reqData.email}
Predmet: ${reqData.subject_name}${reqData.item_name ? ' — ' + reqData.item_name : ''}
${priceLine}Poruka:
${reqData.message || '(nema poruke)'}

Prilog: ${reqData.attachment_name || '(nema priloga)'}
Dokaz o uplati: ${reqData.payment_proof_name || '(nije priložen)'}
`,
      attachments
    });
    return { sent: true };
  } catch (e) {
    console.error('[mejl] greška pri slanju:', e.message);
    return { sent: false, reason: e.message };
  }
}

// =================== PUBLIC API ===================

// Aktivni predmeti (za dropdown) — sa podstavkama
app.get('/api/subjects', (req, res) => {
  const rows = db.prepare('SELECT id, name, price FROM subjects WHERE active = 1 ORDER BY name').all();
  const itemStmt = db.prepare('SELECT id, name, price FROM subject_items WHERE subject_id = ? AND active = 1 ORDER BY id');
  for (const s of rows) s.items = itemStmt.all(s.id);
  res.json(rows);
});

// Podaci za uplatu (javni prikaz u prozoru)
app.get('/api/payment-info', (req, res) => {
  const s = settingsAll();
  res.json({
    recipient: s.pay_recipient,
    account: s.pay_account,
    model: s.pay_model,
    reference: s.pay_reference,
    purpose: s.pay_purpose
  });
});

// Podnošenje zahteva
app.post('/api/requests', upload.fields([{ name: 'attachment', maxCount: 1 }, { name: 'payment_proof', maxCount: 1 }]), async (req, res) => {
  try {
    const { ime, prezime, index_broj, email, subject_id, subject_other, item_id, message } = req.body;
    if (!ime || !prezime || !index_broj || !email) {
      return res.status(400).json({ error: 'Nedostaju obavezna polja.' });
    }

    let subjectName = '';
    let itemName = null;
    let price = 0;
    if (subject_id === 'other') {
      subjectName = (subject_other || '').trim();
      if (!subjectName) return res.status(400).json({ error: 'Unesi naziv predmeta.' });
    } else {
      const sub = db.prepare('SELECT id, name, price FROM subjects WHERE id = ? AND active = 1').get(Number(subject_id));
      if (!sub) return res.status(400).json({ error: 'Izabrani predmet ne postoji.' });
      subjectName = sub.name;
      price = sub.price;

      // Ako predmet ima podstavke, jedna mora biti izabrana; cena i naziv se uzimaju iz nje
      const items = db.prepare('SELECT id, name, price FROM subject_items WHERE subject_id = ? AND active = 1').all(sub.id);
      if (items.length > 0) {
        const chosen = items.find(it => String(it.id) === String(item_id));
        if (!chosen) return res.status(400).json({ error: 'Izaberi podstavku predmeta.' });
        itemName = chosen.name;
        price = chosen.price;
      }
    }

    const attFile = req.files?.attachment?.[0] || null;
    const proofFile = req.files?.payment_proof?.[0] || null;

    const record = {
      created_at: new Date().toISOString(),
      ime, prezime, index_broj, email,
      subject_id: subject_id === 'other' ? null : Number(subject_id),
      subject_name: subjectName,
      item_name: itemName,
      price,
      message: message || '',
      attachment_path: attFile ? attFile.path : null,
      attachment_name: attFile ? attFile.originalname : null,
      payment_proof_path: proofFile ? proofFile.path : null,
      payment_proof_name: proofFile ? proofFile.originalname : null,
      status: 'novo'
    };

    const info = db.prepare(`INSERT INTO requests
      (created_at, ime, prezime, index_broj, email, subject_id, subject_name, item_name, price, message, attachment_path, attachment_name, payment_proof_path, payment_proof_name, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        record.created_at, record.ime, record.prezime, record.index_broj, record.email,
        record.subject_id, record.subject_name, record.item_name, record.price, record.message,
        record.attachment_path, record.attachment_name,
        record.payment_proof_path, record.payment_proof_name, record.status
      );

    const mail = await sendAdminEmail(record);
    res.json({ ok: true, id: Number(info.lastInsertRowid), price, emailSent: mail.sent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Serverska greška.' });
  }
});

// =================== ADMIN API ===================

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  const okEmail = (email || '').trim().toLowerCase() === (setting('admin_login_email') || '').toLowerCase();
  const okPass = password && password === setting('admin_password');
  if (okEmail && okPass) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Pogrešan mejl ili lozinka.' });
});

app.get('/api/admin/requests', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM requests ORDER BY id DESC').all();
  res.json(rows);
});

app.patch('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT attachment_path, payment_proof_path FROM requests WHERE id = ?').get(Number(req.params.id));
  for (const p of [row?.attachment_path, row?.payment_proof_path]) {
    if (p && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
  }
  db.prepare('DELETE FROM requests WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Preuzimanje priloga
app.get('/api/admin/requests/:id/attachment', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT attachment_path, attachment_name FROM requests WHERE id = ?').get(Number(req.params.id));
  if (!row?.attachment_path || !fs.existsSync(row.attachment_path)) return res.status(404).send('Nema priloga');
  res.download(row.attachment_path, row.attachment_name);
});

// Preuzimanje dokaza o uplati
app.get('/api/admin/requests/:id/proof', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT payment_proof_path, payment_proof_name FROM requests WHERE id = ?').get(Number(req.params.id));
  if (!row?.payment_proof_path || !fs.existsSync(row.payment_proof_path)) return res.status(404).send('Nema dokaza');
  res.download(row.payment_proof_path, row.payment_proof_name);
});

// Predmeti - CRUD
app.get('/api/admin/subjects', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM subjects ORDER BY name').all();
  const itemStmt = db.prepare('SELECT * FROM subject_items WHERE subject_id = ? ORDER BY id');
  for (const s of rows) s.items = itemStmt.all(s.id);
  res.json(rows);
});

app.post('/api/admin/subjects', requireAdmin, (req, res) => {
  const { name, price } = req.body;
  if (!name) return res.status(400).json({ error: 'Naziv je obavezan.' });
  const info = db.prepare('INSERT INTO subjects (name, price, active) VALUES (?, ?, 1)').run(name, Number(price) || 0);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

app.patch('/api/admin/subjects/:id', requireAdmin, (req, res) => {
  const { name, price, active } = req.body;
  const cur = db.prepare('SELECT * FROM subjects WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Ne postoji.' });
  db.prepare('UPDATE subjects SET name = ?, price = ?, active = ? WHERE id = ?').run(
    name ?? cur.name,
    price !== undefined ? Number(price) : cur.price,
    active !== undefined ? (active ? 1 : 0) : cur.active,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.delete('/api/admin/subjects/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM subject_items WHERE subject_id = ?').run(id);
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Podstavke predmeta - CRUD
app.post('/api/admin/subjects/:id/items', requireAdmin, (req, res) => {
  const { name, price } = req.body;
  if (!name) return res.status(400).json({ error: 'Naziv podstavke je obavezan.' });
  const sub = db.prepare('SELECT id FROM subjects WHERE id = ?').get(Number(req.params.id));
  if (!sub) return res.status(404).json({ error: 'Predmet ne postoji.' });
  const info = db.prepare('INSERT INTO subject_items (subject_id, name, price, active) VALUES (?, ?, ?, 1)')
    .run(Number(req.params.id), name, Number(price) || 0);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

app.patch('/api/admin/items/:id', requireAdmin, (req, res) => {
  const { name, price, active } = req.body;
  const cur = db.prepare('SELECT * FROM subject_items WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Podstavka ne postoji.' });
  db.prepare('UPDATE subject_items SET name = ?, price = ?, active = ? WHERE id = ?').run(
    name ?? cur.name,
    price !== undefined ? Number(price) : cur.price,
    active !== undefined ? (active ? 1 : 0) : cur.active,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.delete('/api/admin/items/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM subject_items WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Podešavanja (uplata, mejl, lozinka)
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const s = settingsAll();
  delete s.admin_password; // ne vraćamo lozinku
  res.json(s);
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const allowed = ['admin_login_email', 'admin_email', 'pay_recipient', 'pay_account', 'pay_model', 'pay_reference', 'pay_purpose',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'admin_password'];
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== '') setSettingValue(key, req.body[key]);
  }
  res.json({ ok: true });
});

// Statistika za dashboard
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM requests').get().c;
  const novo = db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'novo'").get().c;
  const zavrseno = db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'zavrseno'").get().c;
  const prihod = db.prepare("SELECT COALESCE(SUM(price),0) AS s FROM requests WHERE status = 'zavrseno'").get().s;
  res.json({ total, novo, zavrseno, prihod });
});

app.listen(PORT, () => {
  console.log(`\n  Lakofon radi na  http://localhost:${PORT}`);
  console.log(`  Admin panel:     http://localhost:${PORT}/admin.html  (lozinka: admin123)\n`);
});
