'use strict';
const express = require('express');
const path    = require('path');
const Database = require('better-sqlite3');

const app = express();
const DB_PATH = path.join(__dirname, 'data', 'gathering.db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function getDb() {
  return new Database(DB_PATH);
}

// ─── GET /api/employees ────────────────────────────────────────────────────────
// Kembalikan semua nama+unit untuk dropdown
app.get('/api/employees', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, nama, unit, kota FROM employees ORDER BY unit, nama'
  ).all();
  db.close();
  res.json(rows);
});

// ─── GET /api/units ────────────────────────────────────────────────────────────
// Unit unik beserta kota untuk dropdown "UNIT KOTA"
app.get('/api/units', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT DISTINCT unit, kota FROM employees ORDER BY unit, kota'
  ).all();
  db.close();
  res.json(rows);
});

// ─── GET /api/employees/by-unit ───────────────────────────────────────────────
// Filter nama berdasarkan unit+kota yang dipilih
app.get('/api/employees/by-unit', (req, res) => {
  const { unit, kota } = req.query;
  if (!unit || !kota) return res.json([]);
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, nama FROM employees WHERE unit = ? AND kota = ? ORDER BY nama'
  ).all(unit, kota);
  db.close();
  res.json(rows);
});

// ─── POST /api/register ───────────────────────────────────────────────────────
// Daftarkan karyawan & kembalikan info kelompok
app.post('/api/register', (req, res) => {
  const { employee_id } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id diperlukan' });

  const db = getDb();
  const emp = db.prepare(
    `SELECT e.*, k.nama as nama_kelompok
     FROM employees e
     JOIN kelompok k ON k.id = e.kelompok
     WHERE e.id = ?`
  ).get(employee_id);

  if (!emp) {
    db.close();
    return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
  }

  // Cek sudah pernah registrasi
  const existing = db.prepare(
    'SELECT * FROM registrations WHERE employee_id = ?'
  ).get(employee_id);

  if (!existing) {
    db.prepare(
      "INSERT INTO registrations (employee_id, registered_at) VALUES (?, datetime('now','localtime'))"
    ).run(employee_id);
    // Set checked in
    db.prepare(
      "UPDATE employees SET checked_in = 1, checked_in_at = datetime('now','localtime') WHERE id = ?"
    ).run(employee_id);
  }

  db.close();

  res.json({
    success: true,
    already_registered: !!existing,
    employee: {
      id:    emp.id,
      nama:  emp.nama,
      unit:  emp.unit,
      kota:  emp.kota,
    },
    kelompok: {
      id:   emp.kelompok,
      nama: emp.nama_kelompok,
    }
  });
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// GET /api/admin/kelompok — semua anggota per kelompok
app.get('/api/admin/kelompok', (req, res) => {
  const db = getDb();
  const kelompoklist = db.prepare('SELECT * FROM kelompok ORDER BY id').all();
  const result = kelompoklist.map(k => ({
    ...k,
    anggota: db.prepare(
      'SELECT id, nama, unit, kota, checked_in, checked_in_at FROM employees WHERE kelompok = ? ORDER BY nama'
    ).all(k.id)
  }));
  db.close();
  res.json(result);
});

// PATCH /api/admin/employee/:id/kelompok — pindahkan karyawan ke kelompok lain
app.patch('/api/admin/employee/:id/kelompok', (req, res) => {
  const { id } = req.params;
  const { kelompok_id } = req.body;
  if (!kelompok_id || kelompok_id < 1 || kelompok_id > 10) {
    return res.status(400).json({ error: 'kelompok_id 1-10' });
  }
  const db = getDb();
  db.prepare('UPDATE employees SET kelompok = ? WHERE id = ?').run(kelompok_id, id);
  db.close();
  res.json({ success: true });
});

// PATCH /api/admin/kelompok/:id/nama — ganti nama kelompok
app.patch('/api/admin/kelompok/:id/nama', (req, res) => {
  const { id } = req.params;
  const { nama } = req.body;
  if (!nama) return res.status(400).json({ error: 'nama diperlukan' });
  const db = getDb();
  db.prepare('UPDATE kelompok SET nama = ? WHERE id = ?').run(nama, id);
  db.close();
  res.json({ success: true });
});

// GET /api/admin/stats — statistik registrasi
app.get('/api/admin/stats', (req, res) => {
  const db = getDb();
  const total   = db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
  const hadir   = db.prepare('SELECT COUNT(*) as c FROM employees WHERE checked_in = 1').get().c;
  const byUnit  = db.prepare(
    'SELECT unit, COUNT(*) as total, SUM(checked_in) as hadir FROM employees GROUP BY unit ORDER BY unit'
  ).all();
  const byKelompok = db.prepare(
    `SELECT k.nama, COUNT(e.id) as total, SUM(e.checked_in) as hadir
     FROM kelompok k LEFT JOIN employees e ON e.kelompok = k.id
     GROUP BY k.id ORDER BY k.id`
  ).all();
  db.close();
  res.json({ total, hadir, byUnit, byKelompok });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎉 Gathering System berjalan di http://localhost:${PORT}`);
  console.log(`   Admin Panel: http://localhost:${PORT}/admin.html\n`);
});
