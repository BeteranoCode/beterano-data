// Verifica que cada dibujo de vehículo se llame como el ID del modelo en el catálogo,
// porque es la ÚNICA forma de que una app lo pida: las apps construyen la URL como
//   assets/img/<vehiculos|motos>/<tipo>/<id-del-catalogo>.<jpg|png>
// Un fichero con cualquier otro nombre es trabajo perdido: nadie lo pedirá nunca.
//
// De ahí viene este script. En agosto de 2026 había 146 dibujos hechos y solo 29 se
// veían: 63 estaban en su sitio con nombres humanos ("Land Rover-Range Rover-Classic",
// "Ford-Bronco-Gen2") que no casaban con ningún id, y emparejarlos a posteriori resultó
// imposible de automatizar sin equivocar de coche.
//
//   node scripts/check-vehicle-images.mjs           # informe + salida 1 si hay huérfanos
//   node scripts/check-vehicle-images.mjs --list    # los ids que faltan por dibujar
//   node scripts/check-vehicle-images.mjs --list bmw # ...de una marca
//
// Las carpetas que empiezan por "_" (_vector, _copyright, _archiv) son de trabajo y se
// ignoran a propósito: ahí se guarda el material intermedio, no lo que se publica.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const listar = args.includes("--list");
const marcaFiltro = args.find((a) => !a.startsWith("--")) || "";

// El placeholder gris pesa 631 bytes; cualquier dibujo de verdad pasa de largo.
const MIN_BYTES = 5000;
const SETS = [
  { imgs: "vehiculos", catalogo: "vehicles" },
  { imgs: "motos", catalogo: "motos" },
];

const leerCatalogo = (carpeta) => {
  const dir = path.join(root, "datasets", carpeta, "models");
  if (!fs.existsSync(dir)) return new Map();
  const out = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const marca = file.replace(/\.json$/, "");
    for (const m of JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))) {
      if (m?.id) out.set(m.id, { marca, nombre: m.name || "", tipo: (m.type || "").toLowerCase() });
    }
  }
  return out;
};

const esCarpetaDeTrabajo = (rel) => rel.split("/").some((seg) => seg.startsWith("_"));

const recorrer = (dir, base = "") => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) return recorrer(path.join(dir, e.name), rel);
    return /\.(jpe?g|png)$/i.test(e.name) ? [rel] : [];
  });
};

let huerfanos = [];
let hechos = 0;
let placeholders = 0;
let enTrabajo = 0;
const pendientesPorMarca = new Map();

for (const set of SETS) {
  const catalogo = leerCatalogo(set.catalogo);
  const raiz = path.join(root, "assets", "img", set.imgs);
  const conDibujo = new Set();

  for (const rel of recorrer(raiz)) {
    const abs = path.join(raiz, rel);
    if (fs.statSync(abs).size < MIN_BYTES) { placeholders += 1; continue; }
    if (esCarpetaDeTrabajo(rel)) { enTrabajo += 1; continue; }

    const id = path.basename(rel).replace(/\.(jpe?g|png)$/i, "");
    const modelo = catalogo.get(id);
    if (!modelo) {
      huerfanos.push({ set: set.imgs, rel, id });
      continue;
    }
    // El tipo del catálogo manda: la carpeta debe coincidir o la URL no resolverá.
    const carpeta = path.dirname(rel).split("/")[0];
    if (modelo.tipo && carpeta !== modelo.tipo) {
      huerfanos.push({ set: set.imgs, rel, id, motivo: `esta en ${carpeta} y el catalogo dice ${modelo.tipo}` });
      continue;
    }
    conDibujo.add(id);
    hechos += 1;
  }

  for (const [id, m] of catalogo) {
    if (conDibujo.has(id)) continue;
    if (!pendientesPorMarca.has(m.marca)) pendientesPorMarca.set(m.marca, []);
    pendientesPorMarca.get(m.marca).push({ id, tipo: m.tipo, nombre: m.nombre, set: set.imgs });
  }
}

if (listar) {
  const marcas = [...pendientesPorMarca.keys()].filter((m) => !marcaFiltro || m === marcaFiltro).sort();
  if (!marcas.length) {
    console.error(`[check-vehicle-images] no hay marca "${marcaFiltro}" en el catalogo.`);
    process.exit(1);
  }
  for (const marca of marcas) {
    const items = pendientesPorMarca.get(marca).sort((a, b) => a.id.localeCompare(b.id));
    console.log(`\n${marca} (${items.length} sin dibujo)`);
    for (const it of items) console.log(`  assets/img/${it.set}/${it.tipo}/${it.id}.jpg   ${it.nombre}`);
  }
  process.exit(0);
}

const totalPendientes = [...pendientesPorMarca.values()].reduce((n, a) => n + a.length, 0);
console.log(`[check-vehicle-images] dibujos publicables: ${hechos}`);
console.log(`[check-vehicle-images] modelos sin dibujo:  ${totalPendientes}`);
console.log(`[check-vehicle-images] placeholders:        ${placeholders}`);
console.log(`[check-vehicle-images] en carpetas de trabajo (ignoradas): ${enTrabajo}`);

if (!huerfanos.length) process.exit(0);

console.error(`\n[check-vehicle-images] ${huerfanos.length} dibujos que NINGUNA app puede pedir:\n`);
for (const h of huerfanos.slice(0, 40)) {
  console.error(`  assets/img/${h.set}/${h.rel}`);
  console.error(`    ${h.motivo || `"${h.id}" no es un id del catalogo`}`);
}
if (huerfanos.length > 40) console.error(`  ... y ${huerfanos.length - 40} mas`);
console.error(`
  El nombre del fichero TIENE que ser el id del modelo en el catalogo, y la carpeta
  su tipo. Para ver los nombres que faltan por dibujar:

    node scripts/check-vehicle-images.mjs --list <marca>
`);
process.exit(1);
