'use strict';
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const path    = require('path');

const app = express();

// ─── Database Pool ────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit page routes (agar aman di Vercel serverless)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/qrcode', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qrcode.html'));
});

app.get('/qrcode.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qrcode.html'));
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ─── GET /api/employees ────────────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nama, unit, kota, checked_in FROM employees ORDER BY unit, nama'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/units ────────────────────────────────────────────────────────────
app.get('/api/units', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT unit FROM employees ORDER BY unit'
    );
    res.json(rows.map(r => r.unit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/employees/by-unit ───────────────────────────────────────────────
app.get('/api/employees/by-unit', async (req, res) => {
  const { unit } = req.query;
  if (!unit) return res.json([]);
  try {
    const { rows } = await pool.query(
      'SELECT id, nama FROM employees WHERE unit = $1 ORDER BY nama',
      [unit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/register ───────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { employee_id } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id diperlukan' });

  try {
    // Ambil data karyawan + kelompok
    const empResult = await pool.query(
      `SELECT e.*, k.nama AS nama_kelompok
       FROM employees e
       JOIN kelompok k ON k.id = e.kelompok_id
       WHERE e.id = $1`,
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Karyawan tidak ditemukan' });
    }

    const emp = empResult.rows[0];

    // Cek sudah registrasi (hanya boleh daftar 1 kali)
    const existing = await pool.query(
      'SELECT id FROM registrations WHERE employee_id = $1',
      [employee_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'Karyawan ini sudah terdaftar sebelumnya! Pendaftaran hanya dapat dilakukan satu kali.'
      });
    }

    await pool.query(
      'INSERT INTO registrations (employee_id) VALUES ($1)',
      [employee_id]
    );
    await pool.query(
      'UPDATE employees SET checked_in = TRUE, checked_in_at = NOW() WHERE id = $1',
      [employee_id]
    );

    // Ambil semua anggota sekelompoknya
    const teammatesRes = await pool.query(
      `SELECT id, nama, unit, kota, checked_in
       FROM employees
       WHERE kelompok_id = $1
       ORDER BY nama`,
      [emp.kelompok_id]
    );

    res.json({
      success: true,
      already_registered: false,
      employee: {
        id:   emp.id,
        nama: emp.nama,
        unit: emp.unit,
        kota: emp.kota,
      },
      kelompok: {
        id:   emp.kelompok_id,
        nama: emp.nama_kelompok,
      },
      teammates: teammatesRes.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: GET /api/admin/kelompok ───────────────────────────────────────────
app.get('/api/admin/kelompok', async (req, res) => {
  try {
    const kelompokRes = await pool.query('SELECT * FROM kelompok ORDER BY id');
    const employeesRes = await pool.query(
      `SELECT id, nama, unit, kota, kelompok_id, checked_in,
              TO_CHAR(checked_in_at AT TIME ZONE 'Asia/Jakarta', 'DD/MM/YYYY HH24:MI') AS checked_in_at
       FROM employees ORDER BY nama`
    );

    const result = kelompokRes.rows.map(k => ({
      ...k,
      anggota: employeesRes.rows.filter(e => e.kelompok_id === k.id)
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: PATCH /api/admin/employee/:id/kelompok ────────────────────────────
app.patch('/api/admin/employee/:id/kelompok', async (req, res) => {
  const { id } = req.params;
  const { kelompok_id } = req.body;
  if (!kelompok_id || kelompok_id < 1 || kelompok_id > 10) {
    return res.status(400).json({ error: 'kelompok_id harus 1-10' });
  }
  try {
    await pool.query('UPDATE employees SET kelompok_id = $1 WHERE id = $2', [kelompok_id, id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: PATCH /api/admin/kelompok/:id/nama ────────────────────────────────
app.patch('/api/admin/kelompok/:id/nama', async (req, res) => {
  const { id } = req.params;
  const { nama } = req.body;
  if (!nama) return res.status(400).json({ error: 'nama diperlukan' });
  try {
    await pool.query('UPDATE kelompok SET nama = $1 WHERE id = $2', [nama, id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: GET /api/admin/stats ──────────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [totalRes, hadirRes, byUnitRes, byKelompokRes] = await Promise.all([
      pool.query('SELECT COUNT(*) AS c FROM employees'),
      pool.query('SELECT COUNT(*) AS c FROM employees WHERE checked_in = TRUE'),
      pool.query(
        `SELECT unit,
                COUNT(*) AS total,
                SUM(CASE WHEN checked_in THEN 1 ELSE 0 END) AS hadir
         FROM employees GROUP BY unit ORDER BY unit`
      ),
      pool.query(
        `SELECT k.nama,
                COUNT(e.id) AS total,
                SUM(CASE WHEN e.checked_in THEN 1 ELSE 0 END) AS hadir
         FROM kelompok k
         LEFT JOIN employees e ON e.kelompok_id = k.id
         GROUP BY k.id, k.nama ORDER BY k.id`
      ),
    ]);

    res.json({
      total:       parseInt(totalRes.rows[0].c),
      hadir:       parseInt(hadirRes.rows[0].c),
      byUnit:      byUnitRes.rows,
      byKelompok:  byKelompokRes.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎉 Gathering System berjalan di http://localhost:${PORT}`);
  console.log(`   Admin Panel : http://localhost:${PORT}/admin.html`);
  console.log(`   Generate QR : http://localhost:${PORT}/qrcode.html\n`);
});

module.exports = app; // diperlukan Vercel
