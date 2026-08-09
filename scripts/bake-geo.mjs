// Hornea el catálogo geográfico (países + regiones + ciudades) que consumen las
// apps con desplegable país/región/ciudad (marketplace, leads, map, publish…).
//
//   node scripts/bake-geo.mjs
//
// FUENTES DE AUTORÍA:
//   - Países: `world-countries` (MIT) → 250 ISO 3166-1 con nombre ES/EN y región.
//   - Regiones (subdivisión de primer orden):
//       · 10 países foco (donde opera Beterano): `iso-3166-2` filtrado por el/los
//         `type` de primer orden de cada país (CCAA en ES, Länder en DE, Region en
//         IT, distrito en PT, nación en GB…), con nombres ES/limpios (overrides).
//         iso-3166-2 mezcla niveles, por eso el filtro por type.
//       · Resto de países: `country-region-data` (primer orden razonable, nombre
//         local/EN). Cobertura de los ~240 restantes sin config a mano.
//   - Ciudades: scripts/geo/cities.mjs, ANIDADAS por código de región. Solo foco.
//
// ARTEFACTOS (consumibles, se commitean):
//   - datasets/geo/countries.json      → [{ code, name, nameEn, region }]
//   - datasets/geo/regions/<code>.json → [{ code, name, cities: [...] }]
//   - datasets/geo/cities/<code>.json  → ["Madrid", …]  (plano; compat)
//   - datasets/geo/index.json          → resumen
//
// Banderas NO se guardan: se derivan del ISO2 en cada consumidor (emoji, o SVG
// vía country-flag-icons en escritorio — Windows no pinta el emoji).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CITIES_BY_REGION } from "./geo/cities.mjs";

const require = createRequire(import.meta.url);
const worldCountries = require("world-countries");
const iso31662 = require("iso-3166-2");
const crd = require("country-region-data");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const geoDir = path.join(repoRoot, "datasets", "geo");
const citiesDir = path.join(geoDir, "cities");
const regionsDir = path.join(geoDir, "regions");
fs.mkdirSync(citiesDir, { recursive: true });
fs.mkdirSync(regionsDir, { recursive: true });

const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
const dedupSorted = (list) =>
  [...new Set(list.map((v) => String(v).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

// --- Países ---------------------------------------------------------------
const countries = worldCountries
  .map((c) => ({
    code: c.cca2,
    name: c.translations?.spa?.common || c.name.common,
    nameEn: c.name.common,
    region: c.region || "",
  }))
  .filter((c) => /^[A-Z]{2}$/.test(c.code))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));
const validCodes = new Set(countries.map((c) => c.code));

// --- Regiones de primer orden ---------------------------------------------
// type(s) de primer orden por país foco (iso-3166-2 mezcla niveles).
const REGION_FIRST_ORDER_TYPES = {
  ES: ["Autonomous community", "Autonomous city in north africa"],
  PT: ["District", "Autonomous region"],
  FR: ["Metropolitan region", "Overseas department"],
  DE: ["Länder"],
  AT: ["Federal länder"],
  IT: ["Region"],
  NL: ["Province"],
  BE: ["Region"],
  CH: ["Canton"],
  // GB: el filtro por type da agrupaciones, no naciones → hardcode.
};

// Nombres ES/canónicos donde el paquete da algo feo, invertido o en cooficial.
const REGION_NAME_OVERRIDES = {
  "ES-IB": "Islas Baleares", "ES-AS": "Asturias", "ES-MC": "Murcia", "ES-MD": "Madrid",
  "ES-VC": "Comunidad Valenciana", "ES-CT": "Cataluña", "ES-PV": "País Vasco", "ES-NC": "Navarra",
  "ES-CL": "Castilla y León", "ES-CM": "Castilla-La Mancha", "ES-AN": "Andalucía", "ES-AR": "Aragón",
  "PT-20": "Azores", "PT-30": "Madeira",
  "BE-VLG": "Flandes", "BE-WAL": "Valonia", "BE-BRU": "Bruselas",
};

const REGION_HARDCODE = {
  GB: [
    { code: "GB-ENG", name: "Inglaterra" },
    { code: "GB-SCT", name: "Escocia" },
    { code: "GB-WLS", name: "Gales" },
    { code: "GB-NIR", name: "Irlanda del Norte" },
  ],
};

const cleanRegionName = (code, raw) => {
  if (REGION_NAME_OVERRIDES[code]) return REGION_NAME_OVERRIDES[code];
  let name = String(raw || "").replace(/\*/g, "").trim();
  const comma = name.match(/^(.+?),\s*(.+)$/); // "Asturias, Principado de" → "Principado de Asturias"
  if (comma) name = `${comma[2]} ${comma[1]}`.trim();
  return name;
};

const FOCUS = new Set([...Object.keys(REGION_FIRST_ORDER_TYPES), ...Object.keys(REGION_HARDCODE)]);

// country-region-data: export con claves por país; crd[cc] = [name, code, [[name, short], …]].
const crdRegions = (cc) => {
  const entry = crd[cc] || (crd.allCountries || []).find((t) => t[1] === cc);
  if (!entry) return [];
  return (entry[2] || [])
    .map(([name, short]) => ({ code: short ? `${cc}-${short}` : "", name: String(name || "").trim() }))
    .filter((r) => r.code && r.name);
};

// Regiones de primer orden de un país foco (iso-3166-2 + filtro type, o hardcode).
const focusRegions = (cc) => {
  if (REGION_HARDCODE[cc]) return REGION_HARDCODE[cc].map((r) => ({ ...r }));
  const country = iso31662.country(cc);
  const types = REGION_FIRST_ORDER_TYPES[cc];
  return Object.entries(country?.sub || {})
    .filter(([, sub]) => types.includes(sub.type))
    .map(([code, sub]) => ({ code, name: cleanRegionName(code, sub.name) }));
};

const regionsByCountry = {};
for (const cc of validCodes) {
  let regions = FOCUS.has(cc) ? focusRegions(cc) : crdRegions(cc);
  // Anida ciudades curadas bajo su región (solo países foco tienen cities.mjs).
  const cityMap = CITIES_BY_REGION[cc] || {};
  regions = regions
    .filter((r) => r.name)
    .map((r) => ({ code: r.code, name: r.name, cities: dedupSorted(cityMap[r.code] || []) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  if (regions.length) regionsByCountry[cc] = regions;
}

// Aviso si el seed referencia un código de región que el bake no produjo (typo).
for (const [cc, byRegion] of Object.entries(CITIES_BY_REGION)) {
  const known = new Set((regionsByCountry[cc] || []).map((r) => r.code));
  for (const regionCode of Object.keys(byRegion)) {
    if (!known.has(regionCode)) {
      console.warn(`[bake-geo] AVISO: ciudades en región desconocida ${regionCode} (no existe en ${cc}); se ignoran.`);
    }
  }
}

// --- Ciudades planas (union de las regiones) — compat con consumidores actuales ---
const citiesByCountry = {};
for (const [cc, regions] of Object.entries(regionsByCountry)) {
  const flat = dedupSorted(regions.flatMap((r) => r.cities));
  if (flat.length) citiesByCountry[cc] = flat;
}

// --- Escritura ------------------------------------------------------------
const cleanDir = (dir) => {
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) fs.rmSync(path.join(dir, f));
};

writeJson(path.join(geoDir, "countries.json"), countries);

cleanDir(regionsDir);
const regionsCount = {};
for (const [cc, regions] of Object.entries(regionsByCountry)) {
  writeJson(path.join(regionsDir, `${cc}.json`), regions);
  regionsCount[cc] = regions.length;
}

cleanDir(citiesDir);
const citiesCount = {};
for (const [cc, cities] of Object.entries(citiesByCountry)) {
  writeJson(path.join(citiesDir, `${cc}.json`), cities);
  citiesCount[cc] = cities.length;
}

writeJson(path.join(geoDir, "index.json"), {
  countries: countries.length,
  countriesWithRegions: Object.keys(regionsByCountry).length,
  countriesWithCities: Object.keys(citiesByCountry).length,
  regionsByCountry: regionsCount,
  citiesByCountry: citiesCount,
});

const totalRegions = Object.values(regionsCount).reduce((a, b) => a + b, 0);
const totalCities = Object.values(citiesCount).reduce((a, b) => a + b, 0);
console.log(
  `[bake-geo] ${countries.length} países · ${Object.keys(regionsByCountry).length} con regiones (${totalRegions}) · ` +
    `${Object.keys(citiesByCountry).length} con ciudades (${totalCities}).`,
);
console.log(`[bake-geo] escrito en ${geoDir}`);
