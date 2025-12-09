import 'dotenv/config';
import { Client } from 'pg';
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function dataPath(...segments: string[]) {
  return path.join(ROOT, 'data', ...segments);
}

async function readJson<T = any>(relPath: string): Promise<T> {
  const full = dataPath(relPath);
  const raw = await fs.readFile(full, 'utf8');
  return JSON.parse(raw) as T;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL no definido en .env');
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log('Conectado a Postgres');

  try {
    await client.query('BEGIN');

    // 1) Crear tablas si no existen (versión muy básica)
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS service_types (
        id TEXT PRIMARY KEY,
        category_id TEXT REFERENCES service_categories(id),
        name TEXT NOT NULL,
        description TEXT,
        default_estimated_minutes INTEGER
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicle_brands (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicle_segments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicle_models (
        id TEXT PRIMARY KEY,
        brand_id TEXT REFERENCES vehicle_brands(id),
        name TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS countries (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS fuel_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    console.log('Tablas creadas/verificadas.');

    // 2) SERVICE CATEGORIES
    const serviceCategories = await readJson<{ id: string; name: string }[]>(
      'services/categories.json'
    );

    await client.query('DELETE FROM service_categories;');
    for (const c of serviceCategories) {
      await client.query(
        'INSERT INTO service_categories (id, name) VALUES ($1, $2)',
        [c.id, c.name]
      );
    }
    console.log(`Insertadas ${serviceCategories.length} service_categories`);

    // 3) SERVICE TYPES (catálogo base para Lab)
    const baseServicesLab = await readJson<
      {
        id: string;
        category_id: string;
        name: string;
        description?: string;
        default_estimated_minutes?: number;
      }[]
    >('services/base-services.lab.json');

    await client.query('DELETE FROM service_types;');
    for (const s of baseServicesLab) {
      await client.query(
        `
        INSERT INTO service_types
          (id, category_id, name, description, default_estimated_minutes)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [
          s.id,
          s.category_id,
          s.name,
          s.description || null,
          s.default_estimated_minutes || null
        ]
      );
    }
    console.log(`Insertados ${baseServicesLab.length} service_types`);

    // 4) VEHICLE BRANDS
    const brands = await readJson<{ id: string; name: string; country?: string }[]>(
      'vehicles/brands.json'
    );

    await client.query('DELETE FROM vehicle_brands;');
    for (const b of brands) {
      await client.query(
        'INSERT INTO vehicle_brands (id, name, country) VALUES ($1, $2, $3)',
        [b.id, b.name, b.country || null]
      );
    }
    console.log(`Insertadas ${brands.length} vehicle_brands`);

    // 5) VEHICLE SEGMENTS
    const segments = await readJson<string[]>('vehicles/segments.json');

    await client.query('DELETE FROM vehicle_segments;');
    for (const seg of segments) {
      const id = seg.toLowerCase().replace(/\s+/g, '_');
      await client.query(
        'INSERT INTO vehicle_segments (id, name) VALUES ($1, $2)',
        [id, seg]
      );
    }
    console.log(`Insertados ${segments.length} vehicle_segments`);

    // 6) VEHICLE MODELS (ejemplo simple para un solo brand file, puedes ampliarlo)
    const modelsDir = dataPath('vehicles', 'models');
    const modelFiles = await fs.readdir(modelsDir);

    await client.query('DELETE FROM vehicle_models;');

    for (const file of modelFiles) {
      if (!file.endsWith('.json')) continue;
      const brandId = path.basename(file, '.json');
      const models = await readJson<{ id: string; name: string }[]>(
        path.join('vehicles/models', file)
      );
      for (const m of models) {
        await client.query(
          'INSERT INTO vehicle_models (id, brand_id, name) VALUES ($1, $2, $3)',
          [m.id, brandId, m.name]
        );
      }
      console.log(`Insertados ${models.length} modelos para brand ${brandId}`);
    }

    // 7) COUNTRIES
    const countries = await readJson<{ code: string; name: string }[]>(
      'geo/countries.json'
    );

    await client.query('DELETE FROM countries;');
    for (const c of countries) {
      await client.query(
        'INSERT INTO countries (code, name) VALUES ($1, $2)',
        [c.code, c.name]
      );
    }
    console.log(`Insertados ${countries.length} countries`);

    // 8) FUEL TYPES
    const fuelTypes = await readJson<string[]>('taxonomies/fuel-types.json');

    await client.query('DELETE FROM fuel_types;');
    for (const f of fuelTypes) {
      const id = f.toLowerCase().replace(/\s+/g, '_');
      await client.query(
        'INSERT INTO fuel_types (id, name) VALUES ($1, $2)',
        [id, f]
      );
    }
    console.log(`Insertados ${fuelTypes.length} fuel_types`);

    await client.query('COMMIT');
    console.log('Seed para Postgres completado ✔');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed Postgres:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
