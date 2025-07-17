
const fs = require('fs');
const path = require('path');

const vehiculosPath = path.join(__dirname, '../data/vehiculos.json');
const vinPrefixesPath = path.join(__dirname, '../data/vin_prefixes.json');

const defaultPrefixes = {
  "Land Rover": { prefix: "SAL", vin_length: 17, vin_start_year: 1981, chassis_format: "pre-1981: 8-11 chars (ej: 24126782C)" },
  "Mercedes-Benz": { prefix: "WDB", vin_length: 17, vin_start_year: 1980, chassis_format: "pre-1981: 14 chars (ej: 309350-12-012345)" },
  "Toyota": { prefix: "JT1", vin_length: 17, vin_start_year: 1980, chassis_format: "pre-1981: FJ40-123456" },
  "Suzuki": { prefix: "JSA", vin_length: 17, vin_start_year: 1981, chassis_format: "pre-1981: 8-11 chars" },
  "Nissan": { prefix: "JN1", vin_length: 17, vin_start_year: 1981, chassis_format: "pre-1981: SD33-123456" },
  "Ford": { prefix: "1FME", vin_length: 17, vin_start_year: 1981, chassis_format: "pre-1981: 11 chars (ej: U15GLR08721)" },
  "Chevrolet": { prefix: "1G1", vin_length: 17, vin_start_year: 1981, chassis_format: "pre-1981: 11 chars" },
  "GMC": { prefix: "1G2", vin_length: 17, vin_start_year: 1981, chassis_format: "pre-1981: 11 chars" },
  "Mitsubishi": { prefix: "JMYS", vin_length: 17, vin_start_year: 1981, chassis_format: "pre-1981: 11 chars" }
};

const loadJSON = (filepath) => {
  try {
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
};

const saveJSON = (filepath, data) => {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
};

const syncVINPrefixes = () => {
  const vehiculos = loadJSON(vehiculosPath);
  let vinPrefixes = loadJSON(vinPrefixesPath);

  const marcasUnicas = new Set(vehiculos.map(v => v.Marca));

  marcasUnicas.forEach(marca => {
    if (!vinPrefixes[marca]) {
      vinPrefixes[marca] = defaultPrefixes[marca] || {
        prefix: "",
        vin_length: "",
        vin_start_year: "",
        chassis_format: ""
      };
    }
  });

  const sortedPrefixes = Object.keys(vinPrefixes).sort().reduce((acc, key) => {
    acc[key] = vinPrefixes[key];
    return acc;
  }, {});

  saveJSON(vinPrefixesPath, sortedPrefixes);
  console.log("✅ vin_prefixes.json actualizado correctamente.");
};

syncVINPrefixes();
