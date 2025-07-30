// sync_data_beterano_map.js (sin API KEY, sin autenticación)

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// === CONFIGURACIÓN ===
const SPREADSHEET_ID = '18STFQeKvzXMsPQZUTPE_xVhHWLr04TmWB4FP8iepb7o';
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

// Ruta de salida (permite usar parámetro CLI opcional)
const outputArg = process.argv[2];
const OUTPUT_FOLDER = outputArg
  ? path.resolve(__dirname, outputArg)
  : path.join(__dirname, '../../beterano-map/src/data');

// === FUNCIÓN PRINCIPAL ===
async function sync() {
  console.log(`📥 Conectando a Google Sheets...`);
  console.log(`💾 Carpeta de salida: ${OUTPUT_FOLDER}\n`);

  for (const sheet of sheetsToExtract) {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${sheet}`;

    try {
      const response = await axios.get(url);
      const raw = response.data;

      // Elimina el texto de envoltura: google.visualization.Query.setResponse(...)
      const jsonStr = raw.match(/setResponse\(([\s\S\w]+)\)/)[1];
      const json = JSON.parse(jsonStr);

      const rows = json.table.rows.map(row =>
        Object.fromEntries(
          row.c.map((cell, i) => [json.table.cols[i].label, cell?.v ?? ''])
        )
      );

      const outPath = path.join(OUTPUT_FOLDER, `${sheet}.json`);
      fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
      console.log(`✅ Exportado: ${sheet}.json`);

    } catch (err) {
      console.warn(`❌ Error al procesar ${sheet}: ${err.message}`);
    }
  }

  console.log('\n✅ Sincronización completa.');
}

sync();
