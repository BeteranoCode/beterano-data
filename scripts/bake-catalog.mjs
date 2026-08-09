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
import * as XLSX from "xlsx";

// La build ESM de SheetJS (xlsx desde su CDN) no incluye el acceso a ficheros
// por compatibilidad con el navegador: hay que inyectarle el fs de Node.
XLSX.set_fs(fs);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VEH = path.join(root, "datasets", "vehicles");
const MOTO = path.join(root, "datasets", "motos");

const SOURCES = [
  { kind: "car", file: path.join(VEH, "world_classics.xlsx") },
  { kind: "moto", file: path.join(MOTO, "world_classics_motos.xlsx") },
];

// Cada carpeta recibe SU brands.json/types.json/models. Una marca "both" (BMW,
// Honda...) se emite en ambas carpetas; una moto pura solo en motos, y al reves.
// Asi vehicles/brands.json deja de filtrar motos y los consumidores no cambian.
const OUTPUTS = [
  { kind: "car", dir: VEH },
  { kind: "moto", dir: MOTO },
];
const wantsKind = (itemKinds, target) => itemKinds.has(target); // "both" tiene ambas

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

for (const { kind, dir } of OUTPUTS) {
  fs.mkdirSync(dir, { recursive: true });

  // --- brands.json (solo marcas de este kind; "both" entra en ambos) ---
  const brandsOut = [...brands.values()]
    .filter((b) => wantsKind(b.kinds, kind))
    .map((b) => ({
      key: b.key,
      name: b.name,
      kind: b.kinds.size > 1 ? "both" : [...b.kinds][0],
      types: [...b.types].filter((t) => (types.get(slug(t))?.kinds ?? new Set()).has(kind)).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  fs.writeFileSync(path.join(dir, "brands.json"), JSON.stringify(brandsOut, null, 2) + "\n");

  // --- models/<key>.json (solo modelos cuyo tipo pertenece a este kind) ---
  const modelsDir = path.join(dir, "models");
  fs.mkdirSync(modelsDir, { recursive: true });
  for (const f of fs.readdirSync(modelsDir)) {
    if (/\.json$/i.test(f)) fs.unlinkSync(path.join(modelsDir, f));
  }
  let modelCount = 0, brandFiles = 0;
  for (const b of brandsOut) {
    const mm = modelsByBrand.get(b.key);
    if (!mm) continue;
    const arr = [...mm.values()]
      .filter((m) => !m.type || (types.get(slug(m.type))?.kinds ?? new Set()).has(kind))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (!arr.length) continue;
    modelCount += arr.length; brandFiles += 1;
    fs.writeFileSync(path.join(modelsDir, `${b.key}.json`), JSON.stringify(arr, null, 2) + "\n");
  }

  // --- types.json (solo tipos de este kind) ---
  const typesOut = [...types.values()]
    .filter((t) => t.kinds.has(kind))
    .map((t) => ({ key: t.key, name: t.name, kind: t.kinds.size > 1 ? "both" : [...t.kinds][0], count: t.count }))
    .sort((a, b) => b.count - a.count);
  fs.writeFileSync(path.join(dir, "types.json"), JSON.stringify(typesOut, null, 2) + "\n");

  // --- segments.json (proyeccion names-only de types; lo consumen los seeders
  // como string[] -> tabla/coleccion vehicle_segments). Se hornea para no quedar stale. ---
  const segmentsOut = typesOut.map((t) => t.name).sort((a, b) => a.localeCompare(b, "es"));
  fs.writeFileSync(path.join(dir, "segments.json"), JSON.stringify(segmentsOut) + "\n");

  console.log(`[bake:${kind}] ${path.relative(root, dir)} -> marcas ${brandsOut.length}, modelos ${modelCount} en ${brandFiles} ficheros, tipos ${typesOut.length}, segmentos ${segmentsOut.length}`);
}
