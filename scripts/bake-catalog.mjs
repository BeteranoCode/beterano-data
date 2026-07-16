// Hornea el catálogo de vehículos desde los Excel de autoría a JSON que consumen
// las apps (beterano-leads, etc.). Fuente viva: world_classics.xlsx (coches) +
// world_classics_motos.xlsx (motos). Salida: brands.json, models/<key>.json, types.json.
//
//   node scripts/bake-catalog.mjs
//
// Editas los .xlsx y re-horneas; commitea ambos (xlsx = autoría, json = artefacto).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VEH = path.join(root, "datasets", "vehicles");
const MODELS_DIR = path.join(VEH, "models");

const SOURCES = [
  { kind: "car", file: path.join(VEH, "world_classics.xlsx") },
  { kind: "moto", file: path.join(root, "datasets", "motos", "world_classics_motos.xlsx") },
];

const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const readRows = (file) => {
  if (!fs.existsSync(file)) { console.warn(`[bake] no existe ${file}, se omite`); return []; }
  const wb = XLSX.readFile(file);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
};

// key de marca -> { key, name, kinds:Set, types:Set }
const brands = new Map();
// key de marca -> Map(id -> { id, name, type })
const modelsByBrand = new Map();
// tipo -> { key, name, count, kinds:Set }
const types = new Map();

for (const { kind, file } of SOURCES) {
  for (const r of readRows(file)) {
    const name = String(r.Marca || "").trim();
    if (!name) continue;
    const key = slug(name);
    const tipo = String(r.Tipo || "").trim();
    const modelo = String(r.Modelo || "").trim();
    const serie = String(r["Serie/Generacion"] || "").trim();
    const id = String(r.ID || slug(`${name}-${modelo}-${serie}`)).trim();

    if (!brands.has(key)) brands.set(key, { key, name, kinds: new Set(), types: new Set() });
    const b = brands.get(key);
    b.kinds.add(kind);
    if (tipo) b.types.add(tipo);

    if (tipo) {
      const tk = slug(tipo);
      if (!types.has(tk)) types.set(tk, { key: tk, name: tipo, count: 0, kinds: new Set() });
      const t = types.get(tk);
      t.count += 1;
      t.kinds.add(kind);
    }

    if (!modelsByBrand.has(key)) modelsByBrand.set(key, new Map());
    const mm = modelsByBrand.get(key);
    if (id && !mm.has(id)) {
      // Etiqueta legible: quita el prefijo de marca del modelo y evita duplicar
      // modelo/serie cuando uno contiene al otro.
      const m = modelo.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "").trim() || modelo;
      const s = serie;
      const ml = m.toLowerCase(), sl = s.toLowerCase();
      let label;
      if (!s || sl === ml) label = m;
      else if (ml.includes(sl)) label = m;
      else if (sl.includes(ml)) label = s;
      else label = `${m} ${s}`;
      mm.set(id, { id, name: label || m || id, type: tipo || undefined });
    }
  }
}

// --- Escribir brands.json ---
const brandsOut = [...brands.values()]
  .map((b) => ({
    key: b.key,
    name: b.name,
    kind: b.kinds.size > 1 ? "both" : [...b.kinds][0],
    types: [...b.types].sort(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));
fs.writeFileSync(path.join(VEH, "brands.json"), JSON.stringify(brandsOut, null, 2) + "\n");

// --- Escribir models/<key>.json (limpia los viejos primero) ---
fs.mkdirSync(MODELS_DIR, { recursive: true });
for (const f of fs.readdirSync(MODELS_DIR)) {
  if (/\.json$/i.test(f)) fs.unlinkSync(path.join(MODELS_DIR, f));
}
let modelCount = 0;
for (const [key, mm] of modelsByBrand) {
  const arr = [...mm.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  modelCount += arr.length;
  fs.writeFileSync(path.join(MODELS_DIR, `${key}.json`), JSON.stringify(arr, null, 2) + "\n");
}

// --- Escribir types.json ---
const typesOut = [...types.values()]
  .map((t) => ({ key: t.key, name: t.name, kind: t.kinds.size > 1 ? "both" : [...t.kinds][0], count: t.count }))
  .sort((a, b) => b.count - a.count);
fs.writeFileSync(path.join(VEH, "types.json"), JSON.stringify(typesOut, null, 2) + "\n");

console.log(`[bake] marcas: ${brandsOut.length} (coches+motos)`);
console.log(`[bake] modelos: ${modelCount} en ${modelsByBrand.size} ficheros`);
console.log(`[bake] tipos: ${typesOut.length} -> ${typesOut.map((t) => `${t.name}(${t.count})`).join(", ")}`);
