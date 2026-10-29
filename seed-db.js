// seed-db.js — Jalankan SEKALI untuk isi data ke Supabase
// Usage: node seed-db.js
require('dotenv').config();
const { Pool } = require('pg');
const employees = require('./data/employees');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🔌 Terhubung ke database...');

    // Cek apakah sudah ada data
    const existing = await client.query('SELECT COUNT(*) FROM employees');
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('⚠️  Data sudah ada! Hapus tabel dulu jika ingin reset.');
      console.log('   Jalankan di Supabase SQL Editor:');
      console.log('   TRUNCATE employees, kelompok, registrations RESTART IDENTITY CASCADE;');
      return;
    }

    await client.query('BEGIN');

    // ── Insert 10 kelompok ──────────────────────────────────────
    console.log('📦 Insert kelompok...');
    const kelompokNames = [
      'Kelompok 1', 'Kelompok 2', 'Kelompok 3', 'Kelompok 4', 'Kelompok 5',
      'Kelompok 6', 'Kelompok 7', 'Kelompok 8', 'Kelompok 9', 'Kelompok 10'
    ];
    for (const nama of kelompokNames) {
      await client.query('INSERT INTO kelompok (nama) VALUES ($1)', [nama]);
    }

    // ── Acak kelompok untuk tiap karyawan ──────────────────────
    const total  = employees.length;
    const nGroup = 10;
    const indices = shuffle([...Array(total).keys()]);
    const assignments = new Array(total);
    indices.forEach((empIdx, i) => {
      assignments[empIdx] = (i % nGroup) + 1;
    });

    // ── Insert karyawan ────────────────────────────────────────
    console.log(`👥 Insert ${total} karyawan...`);
    for (let i = 0; i < employees.length; i++) {
      const { nama, unit, kota } = employees[i];
      await client.query(
        'INSERT INTO employees (nama, unit, kota, kelompok_id) VALUES ($1, $2, $3, $4)',
        [nama, unit, kota, assignments[i]]
      );
    }

    await client.query('COMMIT');

    // ── Tampilkan distribusi ───────────────────────────────────
    const dist = await client.query(
      'SELECT k.nama, COUNT(e.id) as total FROM kelompok k LEFT JOIN employees e ON e.kelompok_id = k.id GROUP BY k.id, k.nama ORDER BY k.id'
    );
    console.log('\n✅ Seeding selesai!');
    console.log(`Total karyawan: ${total}`);
    console.log('Distribusi kelompok:');
    dist.rows.forEach(r => console.log(`  ${r.nama}: ${r.total} orang`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
