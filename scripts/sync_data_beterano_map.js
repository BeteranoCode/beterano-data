// sync_data_beterano_map.js

const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ID del documento y ruta de guardado
const SPREADSHEET_ID = '18STFQeKvzXMsPQZUTPE_xVhHWLr04TmWB4FP8iepb7o';
const OUTPUT_FOLDER = path.join(__dirname, '../../beterano-map/src/data');

// Clave de API pública (añadirla si el documento se hace privado)
const GOOGLE_API_KEY = ''; // ❗️Agregar en el futuro cuando se privatice

// Nombre de las hojas = nombre de los archivos .json
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

// Función principal
async function sync() {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  if (GOOGLE_API_KEY) doc.useApiKey(GOOGLE_API_KEY);
  await doc.loadInfo();

  for (const sheetName of sheetsToExtract) {
    const sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) {
      console.warn(`❌ No se encontró la hoja: ${sheetName}`);
      continue;
    }

    const rows = await sheet.getRows();
    const data = rows.map(row => row.toObject());
    const outputPath = path.join(OUTPUT_FOLDER, `${sheetName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`✅ Exportado: ${sheetName}.json`);
  }

  // Git commit automático
  try {
    execSync('git add . && git commit -m "sync: update beterano-map JSONs from Google Sheet" && git push', {
      cwd: path.join(__dirname, '../../beterano-map'),
      stdio: 'inherit'
    });
  } catch (err) {
    console.log('⚠️ No hay cambios para commitear o error en git.');
  }
}

sync();