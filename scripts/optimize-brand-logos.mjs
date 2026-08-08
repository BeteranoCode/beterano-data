// Deja los logos de marca a peso de web.
//
// Los originales son PNG de 1024x1024 o 1536x1024 y hasta 1,3 MB cada uno, pero
// en la UI se pintan en insignias de 20-32 px. Ademas casi la mitad son
// apaisados, asi que dentro de una insignia circular salian letterboxeados con
// barras de fondo a los lados.
//
// Este script, para cada PNG de assets/img/logo_brands:
//   1. archiva el original en _archiv/ (si no estaba ya),
//   2. recorta el fondo liso que rodea al logotipo,
//   3. lo centra en un lienzo cuadrado con un margen del 7%,
//   4. lo deja en 128 px (cubre 32 px a densidad 4x) y lo recomprime.
//
// Se mantiene PNG y el mismo nombre de fichero a proposito: cambiar a WebP
// ahorraria otro 80% pero obligaria a tocar todos los consumidores (el shell,
// core-api, los publish). No compensa para 12 KB por logo.
//
//   node scripts/optimize-brand-logos.mjs [--size 128] [--dry-run]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logosDir = path.resolve(__dirname, "..", "assets", "img", "logo_brands");
const archiveDir = path.join(logosDir, "_archiv");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sizeIndex = args.indexOf("--size");
const targetSize = sizeIndex >= 0 ? Number(args[sizeIndex + 1]) : 128;
const MARGIN_RATIO = 0.07;

if (!Number.isFinite(targetSize) || targetSize < 16) {
  throw new Error(`--size invalido: ${args[sizeIndex + 1]}`);
}

const kb = (bytes) => Math.round(bytes / 1024);

async function optimize(file) {
  const source = path.join(logosDir, file);
  const before = (await fs.stat(source)).size;

  // El original se guarda entero antes de tocarlo. Si ya estaba archivado se
  // respeta el de _archiv: es el bueno, este ya podria venir optimizado.
  const archived = path.join(archiveDir, file);
  const alreadyArchived = await fs
    .access(archived)
    .then(() => true)
    .catch(() => false);
  if (!alreadyArchived && !dryRun) {
    await fs.copyFile(source, archived);
  }

  const input = alreadyArchived ? archived : source;

  // Fondo plano aplanado sobre blanco: el recorte busca el area que se sale de
  // ese color, con tolerancia porque el blanco no es puro (254,253,252).
  const trimmed = sharp(input).flatten({ background: "#ffffff" }).trim({ threshold: 12 });
  const { width, height } = await trimmed.toBuffer({ resolveWithObject: true }).then((r) => r.info);

  const side = Math.max(width, height);
  const canvas = side + Math.round(side * MARGIN_RATIO) * 2;

  const output = await sharp(input)
    .flatten({ background: "#ffffff" })
    .trim({ threshold: 12 })
    .resize(canvas, canvas, { fit: "contain", background: "#ffffff" })
    .resize(targetSize, targetSize, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  if (!dryRun) await fs.writeFile(source, output);

  return { file, before, after: output.length, archived: !alreadyArchived };
}

const entries = (await fs.readdir(logosDir)).filter((f) => f.toLowerCase().endsWith(".png")).sort();
if (!entries.length) throw new Error(`sin PNGs en ${logosDir}`);

await fs.mkdir(archiveDir, { recursive: true });

let totalBefore = 0;
let totalAfter = 0;
let newlyArchived = 0;

for (const file of entries) {
  const result = await optimize(file);
  totalBefore += result.before;
  totalAfter += result.after;
  if (result.archived) newlyArchived += 1;
}

const pct = totalBefore ? Math.round(100 - (totalAfter * 100) / totalBefore) : 0;
console.log(
  `[logos] ${entries.length} logos a ${targetSize}px: ${kb(totalBefore)}KB -> ${kb(totalAfter)}KB (-${pct}%)`,
);
console.log(`[logos] originales archivados en _archiv esta pasada: ${newlyArchived}`);
if (dryRun) console.log("[logos] --dry-run: no se ha escrito nada");
