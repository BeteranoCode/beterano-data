const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = path.resolve(__dirname, '../data/biblioteca_piezas_vehiculos.xlsx');
const outputDir = path.resolve(__dirname, '../data');

function leerHoja(nombreHoja) {
  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[nombreHoja];
  return xlsx.utils.sheet_to_json(sheet, { defval: "" });
}

function guardarJSON(nombreArchivo, datos) {
  const outputPath = path.join(outputDir, nombreArchivo);
  fs.writeFileSync(outputPath, JSON.stringify(datos, null, 2));
  console.log(`✅ ${nombreArchivo} actualizado`);
}

function sincronizar() {
  console.log('🔄 Sincronizando biblioteca técnica desde Excel...');

  // Leer y guardar hojas clave
  const biblioteca = leerHoja('00_DATA');
  const vehiculos = leerHoja('01_DATA VEHICULOS');

  guardarJSON('biblioteca_piezas.json', biblioteca);
  guardarJSON('vehiculos.json', vehiculos);
}

sincronizar();
