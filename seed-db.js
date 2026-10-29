// seed-db.js — Inisialisasi database SQLite + acak kelompok awal
const Database = require('better-sqlite3');
const employees = require('./data/employees');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'gathering.db');

// Hapus DB lama jika ada (fresh start)
if (fs.existsSync(DB_PATH)) {
  console.log('Database sudah ada, skip seeding. Hapus data/gathering.db untuk reset.');
  process.exit(0);
}

const db = new Database(DB_PATH);

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nama      TEXT NOT NULL,
    unit      TEXT NOT NULL,
    kota      TEXT NOT NULL,
    kelompok  INTEGER NOT NULL DEFAULT 0,
    checked_in INTEGER NOT NULL DEFAULT 0,
    checked_in_at TEXT
  );

  CREATE TABLE IF NOT EXISTS kelompok (
    id    INTEGER PRIMARY KEY,
    nama  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id   INTEGER NOT NULL,
    registered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(employee_id) REFERENCES employees(id)
  );
`);

// ─── Kelompok (10 tim) ────────────────────────────────────────────────────────
const kelompokNames = [
  'Kelompok 1', 'Kelompok 2', 'Kelompok 3', 'Kelompok 4', 'Kelompok 5',
  'Kelompok 6', 'Kelompok 7', 'Kelompok 8', 'Kelompok 9', 'Kelompok 10'
];

const insertKelompok = db.prepare('INSERT OR IGNORE INTO kelompok (id, nama) VALUES (?, ?)');
kelompokNames.forEach((nm, i) => insertKelompok.run(i + 1, nm));

// ─── Masukkan karyawan + acak kelompok ────────────────────────────────────────
// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const insertEmp = db.prepare(
  'INSERT INTO employees (nama, unit, kota, kelompok) VALUES (?, ?, ?, ?)'
);

// Bagi rata 160 orang ke 10 kelompok
const totalEmployees = employees.length;
const numGroups = 10;

// Buat array index dan shuffle
const indices = shuffle([...Array(totalEmployees).keys()]);

// Bagi ke kelompok secara merata
const assignments = new Array(totalEmployees);
indices.forEach((empIdx, i) => {
  assignments[empIdx] = (i % numGroups) + 1;
});

const insertMany = db.transaction(() => {
  employees.forEach((emp, i) => {
    insertEmp.run(emp.nama, emp.unit, emp.kota, assignments[i]);
  });
});

insertMany();

// Hitung distribusi
const counts = {};
for (let k = 1; k <= 10; k++) {
  counts[k] = db.prepare('SELECT COUNT(*) as c FROM employees WHERE kelompok = ?').get(k).c;
}
console.log('✅ Database seeded!');
console.log(`Total karyawan: ${totalEmployees}`);
console.log('Distribusi kelompok:', counts);
db.close();
