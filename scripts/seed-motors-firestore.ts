import { promises as fs } from 'fs';
import path from 'path';
import admin from 'firebase-admin';

const ROOT = path.resolve(__dirname, '..');

function dataPath(...segments: string[]) {
  return path.join(ROOT, 'data', ...segments);
}

async function readJson<T = any>(relPath: string): Promise<T> {
  const full = dataPath(relPath);
  const raw = await fs.readFile(full, 'utf8');
  return JSON.parse(raw) as T;
}

async function initFirebase() {
  if (admin.apps.length === 0) {
    // Opción 1: usar GOOGLE_APPLICATION_CREDENTIALS
    // admin.initializeApp();

    // Opción 2: cargar credenciales directamente desde un archivo
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(ROOT, 'serviceAccountKey.json');
    const serviceAccount = await import(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as any)
    });
  }
  return admin.firestore();
}

async function seedCollection(
  db: admin.firestore.Firestore,
  collectionName: string,
  docs: { id: string; [key: string]: any }[]
) {
  console.log(`Seedeando colección ${collectionName} (${docs.length} documentos)...`);
  const batch = db.batch();
  const colRef = db.collection(collectionName);

  for (const d of docs) {
    const { id, ...rest } = d;
    const docRef = colRef.doc(id);
    batch.set(docRef, rest);
  }

  await batch.commit();
  console.log(`✓ Colección ${collectionName} completada.`);
}

async function main() {
  const db = await initFirebase();
  console.log('Conectado a Firestore (Admin).');

  // 1) Service categories
  const serviceCategories = await readJson<{ id: string; name: string }[]>(
    'services/categories.json'
  );
  await seedCollection(
    db,
    'service_categories',
    serviceCategories.map((c) => ({ id: c.id, name: c.name }))
  );

  // 2) Service types base para Motors
  const baseServicesMotors = await readJson<
    {
      id: string;
      category_id?: string;
      name: string;
      description?: string;
    }[]
  >('services/base-services.motors.json');

  await seedCollection(
    db,
    'service_types',
    baseServicesMotors.map((s) => ({
      id: s.id,
      category_id: s.category_id || null,
      name: s.name,
      description: s.description || null
    }))
  );

  // 3) Vehicle brands
  const brands = await readJson<{ id: string; name: string; country?: string }[]>(
    'vehicles/brands.json'
  );
  await seedCollection(
    db,
    'vehicle_brands',
    brands.map((b) => ({
      id: b.id,
      name: b.name,
      country: b.country || null
    }))
  );

  // 4) Vehicle segments
  const segments = await readJson<string[]>('vehicles/segments.json');
  await seedCollection(
    db,
    'vehicle_segments',
    segments.map((name) => ({
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name
    }))
  );

  // 5) Countries
  const countries = await readJson<{ code: string; name: string }[]>(
    'geo/countries.json'
  );
  await seedCollection(
    db,
    'countries',
    countries.map((c) => ({
      id: c.code,
      name: c.name
    }))
  );

  // 6) Fuel types
  const fuelTypes = await readJson<string[]>('taxonomies/fuel-types.json');
  await seedCollection(
    db,
    'fuel_types',
    fuelTypes.map((name) => ({
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name
    }))
  );

  console.log('Seed Firestore completado ✔');
}

main().catch((err) => {
  console.error('Error en seed Firestore:', err);
  process.exitCode = 1;
});
