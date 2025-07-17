
const fs = require('fs');
const path = require('path');

const vehiculosPath = path.join(__dirname, '../data/vehiculos.json');
const vinPrefixesPath = path.join(__dirname, '../data/vin_prefixes.json');

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return [];
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function expandYearRange(yearStr) {
  if (!yearStr) return [];
  const match = yearStr.match(/(\d{4})(?:\D+(\d{4}))?/);
  if (!match) return [];
  const start = parseInt(match[1]);
  const end = match[2] ? parseInt(match[2]) : start;
  const years = [];
  for (let y = start; y <= end; y++) {
    years.push(y);
  }
  return years;
}

function syncVINByModel() {
  const vehiculos = loadJSON(vehiculosPath);
  const vinData = {};

  vehiculos.forEach(v => {
    const marca = v.Marca || "_";
    const modelo = v.Modelo || "_";
    const serie = v["Serie/Generacion"] || "_";
    const designacion = v.Designacion || "_";
    const años = expandYearRange(v.Año);

    if (!vinData[marca]) vinData[marca] = {};
    if (!vinData[marca][modelo]) vinData[marca][modelo] = {};
    if (!vinData[marca][modelo][serie]) vinData[marca][modelo][serie] = {};
    if (!vinData[marca][modelo][serie][designacion]) {
      vinData[marca][modelo][serie][designacion] = {
        prefix: [],
        vin_length: "",
        vin_year: años,
        chassis_format: ""
      };
    } else {
      // fusionar años si ya existe
      const existentes = new Set(vinData[marca][modelo][serie][designacion].vin_year);
      años.forEach(y => existentes.add(y));
      vinData[marca][modelo][serie][designacion].vin_year = Array.from(existentes).sort();
    }
  });

  saveJSON(vinPrefixesPath, vinData);
  console.log("✅ vin_prefixes.json generado con estructura anidada por modelo y años VIN.");
}

syncVINByModel();
