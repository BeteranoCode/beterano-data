
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, '../data/vin_prefixes.xlsx');
const outputPath = path.join(__dirname, '../data/vin_prefixes.json');

function expandYears(yearRange) {
  if (!yearRange || typeof yearRange !== 'string') return [];
  const match = yearRange.match(/(\d{4})(?:\D+(\d{4}))?/);
  if (!match) return [];
  const start = parseInt(match[1]);
  const end = match[2] ? parseInt(match[2]) : start;
  const years = [];
  for (let y = start; y <= end; y++) {
    years.push(y);
  }
  return years;
}

function main() {
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const result = {};

  data.forEach(row => {
    const marca = row['Marca'] || '_';
    const modelo = row['Modelo'] || '_';
    const serie = row['Serie/Generacion'] || '_';
    const designacion = row['Designacion'] || '_';
    const prefix = typeof row['Prefix'] === 'string' ? row['Prefix'].split(',').map(p => p.trim()) : [];
    const vin_length = row['VIN Length'] || '';
    const vin_year = expandYears(row['VIN Year']);
    const chassis_format = row['Chassis Format'] || '';

    if (!result[marca]) result[marca] = {};
    if (!result[marca][modelo]) result[marca][modelo] = {};
    if (!result[marca][modelo][serie]) result[marca][modelo][serie] = {};
    result[marca][modelo][serie][designacion] = {
      prefix,
      vin_length,
      vin_year,
      chassis_format
    };
  });

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log("✅ vin_prefixes.json generado correctamente desde vin_prefixes.xlsx");
}

main();
