// sync_data_beterano_map.js

const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// === CONFIGURACIÓN ===
const SPREADSHEET_ID = '18STFQeKvzXMsPQZUTPE_xVhHWLr04TmWB4FP8iepb7o';
const GOOGLE_API_KEY = ''; // (⚠️ En blanco porque el sheet es público)

// Permite usar ruta personalizada desde línea de comandos
const outputArg = process.argv[2]; // Ejemplo: node sync_data_beterano_map.js ../beterano-map/src/data
const OUTPUT_FOLDER = outputArg
  ? path.resolve(__dirname, outputArg)
  : path.join(__dirname, '../../beterano-map/src/data');

// Lista de hojas del Google Sheet que se convertirán en JSON
const sheetsToExtract = [
  'restauradores',
  'gruas',
  'desguaces',
  'abandonos',
  'propietarios',
  'rent_tools',
  'rent_space',
  'rent_service',
  'rent_knowledge',
  'shops'
];

async function sync() {
  try {
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    if (GOOGLE_API_KEY) doc.useApiKey(GOOGLE_API_KEY);
    await doc.loadInfo();

    console.log(`📥 Conectado a: ${doc.title}`);
    console.log(`💾 Carpeta de salida: ${OUTPUT_FOLDER}\n`);

    for (const sheetName of sheetsToExtract) {
      const sheet = doc.sheetsByTitle[sheetName];
      if (!sheet) {
        console.warn(`❌ Hoja no encontrada: ${sheetName}`);
        continue;
      }

      const rows = await sheet.getRows();
      const data = rows.map(row => row.toObject());
      const outputPath = path.join(OUTPUT_FOLDER, `${sheetName}.json`);

      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`✅ Exportado: ${sheetName}.json`);
    }

    // Git commit automático (solo si carpeta es beterano-map)
    if (OUTPUT_FOLDER.includes('beterano-map')) {
      try {
        execSync('git add . && git commit -m "sync: update beterano-map JSONs from Google Sheet" && git push', {
          cwd: path.resolve(OUTPUT_FOLDER, '../../'), // ruta al root del repo
          stdio: 'inherit'
        });
      } catch {
        console.log('⚠️ No hay cambios o git ya está actualizado.');
      }
    }

    console.log('\n✅ Sincronización completa.');
  } catch (err) {
    console.error('❌ Error durante la sincronización:\n', err);
  }
}

sync();
