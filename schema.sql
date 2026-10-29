-- ============================================================
--  Schema Gathering System — jalankan di Supabase SQL Editor
-- ============================================================

-- Tabel kelompok
CREATE TABLE IF NOT EXISTS kelompok (
  id    SERIAL PRIMARY KEY,
  nama  TEXT NOT NULL
);

-- Tabel karyawan
CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  nama          TEXT NOT NULL,
  unit          TEXT NOT NULL,
  kota          TEXT NOT NULL,
  kelompok_id   INTEGER NOT NULL REFERENCES kelompok(id),
  checked_in    BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at TIMESTAMPTZ
);

-- Tabel log registrasi
CREATE TABLE IF NOT EXISTS registrations (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk performa
CREATE INDEX IF NOT EXISTS idx_employees_unit_kota  ON employees(unit, kota);
CREATE INDEX IF NOT EXISTS idx_employees_kelompok   ON employees(kelompok_id);
CREATE INDEX IF NOT EXISTS idx_registrations_emp    ON registrations(employee_id);
