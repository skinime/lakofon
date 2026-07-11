import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(path.join(DATA_DIR, 'lakofon.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS subject_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    ime TEXT NOT NULL,
    prezime TEXT NOT NULL,
    index_broj TEXT NOT NULL,
    email TEXT NOT NULL,
    telefon TEXT,
    subject_id INTEGER,
    subject_name TEXT NOT NULL,
    item_name TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    attachment_path TEXT,
    attachment_name TEXT,
    payment_proof_path TEXT,
    payment_proof_name TEXT,
    status TEXT NOT NULL DEFAULT 'novo'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migracija: dodaj kolone za dokaz o uplati ako baza već postoji bez njih
const cols = db.prepare('PRAGMA table_info(requests)').all().map(c => c.name);
if (!cols.includes('payment_proof_path')) db.exec('ALTER TABLE requests ADD COLUMN payment_proof_path TEXT');
if (!cols.includes('payment_proof_name')) db.exec('ALTER TABLE requests ADD COLUMN payment_proof_name TEXT');
if (!cols.includes('item_name')) db.exec('ALTER TABLE requests ADD COLUMN item_name TEXT');
if (!cols.includes('telefon')) db.exec('ALTER TABLE requests ADD COLUMN telefon TEXT');

// Podrazumevana podešavanja
const env = process.env;
const defaults = {
  admin_login_email: env.ADMIN_EMAIL || 'boskooviic@icloud.com',
  admin_password: env.ADMIN_PASSWORD || 'Boskovic2908!',
  admin_email: env.NOTIFY_EMAIL || env.ADMIN_EMAIL || 'boskooviic@icloud.com',
  pay_recipient: 'Lakofon',
  pay_account: '160-0000000000000-00',
  pay_model: '97',
  pay_reference: '',
  pay_purpose: 'Uplata za uslugu',
  // SMTP (opciono - ako nije popunjeno, mejl se ne šalje ali zahtev se čuva)
  smtp_host: env.SMTP_HOST || '',
  smtp_port: env.SMTP_PORT || '587',
  smtp_user: env.SMTP_USER || '',
  smtp_pass: env.SMTP_PASS || '',
  smtp_from: env.SMTP_FROM || ''
};

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) setSetting.run(k, v);

// Nekoliko početnih predmeta
const cnt = db.prepare('SELECT COUNT(*) AS c FROM subjects').get();
if (cnt.c === 0) {
  const ins = db.prepare('INSERT INTO subjects (name, price, active) VALUES (?, ?, 1)');
  const m1 = ins.run('Matematika 1', 1500);
  ins.run('Osnovi programiranja', 2000);
  ins.run('Statistika', 1800);
  ins.run('Ekonomija', 1200);

  // Demo podstavke za Matematiku 1
  const insItem = db.prepare('INSERT INTO subject_items (subject_id, name, price, active) VALUES (?, ?, ?, 1)');
  insItem.run(Number(m1.lastInsertRowid), 'Kolokvijum 1', 1500);
  insItem.run(Number(m1.lastInsertRowid), 'Kolokvijum 2', 1500);
  insItem.run(Number(m1.lastInsertRowid), 'Ispit (ceo)', 2500);
}

export function settingsAll() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const o = {};
  for (const r of rows) o[r.key] = r.value;
  return o;
}

export function setting(key) {
  const r = getSetting.get(key);
  return r ? r.value : null;
}

export function setSettingValue(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value ?? ''));
}
