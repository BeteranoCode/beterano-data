// Hornea el catálogo geográfico (países + ciudades) que consumen las apps con
// desplegable de país/ciudad (marketplace, leads, map, publish forms…).
//
//   node scripts/bake-geo.mjs
//
// FUENTES DE AUTORÍA:
//   - Países: paquete `world-countries` (MIT) → los 250 ISO 3166-1 con nombre
//     español (translations.spa), inglés y región. Reference data estándar, no
//     se mantiene a mano.
//   - Ciudades: scripts/geo/cities.mjs (curadas a mano, editable). No se usa
//     xlsx aquí (a diferencia de vehículos): una lista de ~300 ciudades es más
//     clara y versionable en un .mjs, y evita pelear con el *.xlsx gitignoreado.
//
// ARTEFACTOS (consumibles, se commitean):
//   - datasets/geo/countries.json      → [{ code, name, nameEn, region }]
//   - datasets/geo/cities/<code>.json  → ["Madrid", "Barcelona", …]
//   - datasets/geo/index.json          → { countries: N, citiesByCountry: {…} }
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const geoDir = path.join(repoRoot, "datasets", "geo");
const citiesDir = path.join(geoDir, "cities");

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

// --- Ciudades: del seed curado, validadas contra los códigos ISO reales ---
const validCodes = new Set(countries.map((c) => c.code));
const dedupSorted = (list) =>
  [...new Set(list.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

const citiesByCountry = {};
for (const [code, list] of Object.entries(SEED_CITIES)) {
  const cc = code.toUpperCase();
  if (!validCodes.has(cc)) {
    console.warn(`[bake-geo] AVISO: código de país desconocido en ciudades: ${cc} (se omite)`);
    continue;
  }
  const cities = dedupSorted(list);
  if (cities.length) citiesByCountry[cc] = cities;
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
    `(${totalCities} ciudades).`,
);
console.log(`[bake-geo] escrito en ${geoDir}`);
