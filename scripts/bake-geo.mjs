// Hornea el catálogo geográfico (países + ciudades) que consumen las apps con
// desplegable de país/ciudad (marketplace, leads, map, publish forms…).
//
//   node scripts/bake-geo.mjs
//
// FUENTES DE AUTORÍA:
//   - Países: paquete `world-countries` (MIT) → los 250 ISO 3166-1 con nombre
//     español (translations.spa), inglés y región. Reference data estándar, no
//     se mantiene a mano.
//   - Ciudades: datasets/geo/cities.xlsx si existe (editable en Excel); si no,
//     el seed curado de scripts/geo/cities.mjs (y de paso genera el xlsx para
//     que puedas mantenerlas en Excel a partir de ahora).
//
// ARTEFACTOS (consumibles, se commitean junto a las fuentes):
//   - datasets/geo/countries.json      → [{ code, name, nameEn, region }]
//   - datasets/geo/cities/<code>.json  → ["Madrid", "Barcelona", …]
//   - datasets/geo/index.json          → { countries: N, citiesByCountry: {…} }
//   - datasets/geo/cities.xlsx         → fuente editable (país=hoja o columna)
//
// Las banderas NO se guardan: se derivan del ISO2 en cada consumidor (emoji por
// aritmética de regional-indicator, o SVG vía country-flag-icons en escritorio,
// donde Windows no pinta el emoji).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES_BY_COUNTRY as SEED_CITIES } from "./geo/cities.mjs";

const require = createRequire(import.meta.url);
const worldCountries = require("world-countries");
const XLSX = require("xlsx");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const geoDir = path.join(repoRoot, "datasets", "geo");
const citiesDir = path.join(geoDir, "cities");
const citiesXlsx = path.join(geoDir, "cities.xlsx");
const countriesXlsx = path.join(geoDir, "countries.xlsx");

fs.mkdirSync(citiesDir, { recursive: true });

const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

// --- Países (world-countries → forma estable { code, name, nameEn, region }) ---
const countries = worldCountries
  .map((c) => ({
    code: c.cca2,
    name: c.translations?.spa?.common || c.name.common,
    nameEn: c.name.common,
    region: c.region || "",
  }))
  .filter((c) => /^[A-Z]{2}$/.test(c.code))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

// --- Ciudades: del xlsx si existe, si no del seed (y escribe el xlsx) ---
function readCitiesFromXlsx() {
  if (!fs.existsSync(citiesXlsx)) return null;
  const wb = XLSX.readFile(citiesXlsx);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const map = {};
  for (const row of rows) {
    const code = String(row.code || row.countryCode || "").trim().toUpperCase();
    const city = String(row.city || row.ciudad || "").trim();
    if (!/^[A-Z]{2}$/.test(code) || !city) continue;
    (map[code] ??= []).push(city);
  }
  return map;
}

const validCodes = new Set(countries.map((c) => c.code));
const dedupSorted = (list) =>
  [...new Set(list.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

const fromXlsx = readCitiesFromXlsx();
const citiesSource = fromXlsx || SEED_CITIES;

const citiesByCountry = {};
for (const [code, list] of Object.entries(citiesSource)) {
  const cc = code.toUpperCase();
  if (!validCodes.has(cc)) {
    console.warn(`[bake-geo] AVISO: código de país desconocido en ciudades: ${cc} (se omite)`);
    continue;
  }
  const cities = dedupSorted(list);
  if (cities.length) citiesByCountry[cc] = cities;
}

// Si las ciudades venían del seed, deja el xlsx editable para el futuro.
if (!fromXlsx) {
  const rows = [];
  for (const [code, cities] of Object.entries(citiesByCountry)) {
    for (const city of cities) rows.push({ code, city });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "cities");
  XLSX.writeFile(wb, citiesXlsx);
}

// countries.xlsx: fuente de conveniencia (regenerable desde world-countries).
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(countries), "countries");
  XLSX.writeFile(wb, countriesXlsx);
}

// --- Escribe artefactos JSON ---
writeJson(path.join(geoDir, "countries.json"), countries);

// Limpia cities/ previos para no dejar huérfanos.
for (const file of fs.readdirSync(citiesDir)) {
  if (file.endsWith(".json")) fs.rmSync(path.join(citiesDir, file));
}
const citiesCount = {};
for (const [code, cities] of Object.entries(citiesByCountry)) {
  writeJson(path.join(citiesDir, `${code}.json`), cities);
  citiesCount[code] = cities.length;
}

writeJson(path.join(geoDir, "index.json"), {
  countries: countries.length,
  countriesWithCities: Object.keys(citiesByCountry).length,
  citiesByCountry: citiesCount,
});

const totalCities = Object.values(citiesCount).reduce((a, b) => a + b, 0);
console.log(
  `[bake-geo] ${countries.length} países, ${Object.keys(citiesByCountry).length} con ciudades ` +
    `(${totalCities} ciudades). Fuente ciudades: ${fromXlsx ? "cities.xlsx" : "seed → cities.xlsx creado"}.`,
);
console.log(`[bake-geo] escrito en ${geoDir}`);
