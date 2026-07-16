import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient, Locale } from "@prisma/client";

/**
 * Importa a beterano-data el árbol completo (system → group → category → element)
 * a partir de los JSON en datasets/parts/proposed/*.json.
 *
 * El PartSystem debe existir previamente (migrate-part-systems-canonical.ts
 * lo garantiza para los 20 canónicos). Aquí solo se pueblan los niveles
 * inferiores.
 *
 * Formato JSON esperado:
 *   { systemKey, labels: {en, es, ...}, groups: [
 *       { groupKey, labels, categories: [
 *           { categoryKey, labels, elements: [
 *               { elementKey, labels }
 *           ]}
 *       ]}
 *   ]}
 *
 * Modo DRY-RUN por defecto. --apply para escribir. Opcional: --file <path>
 * para importar un solo JSON en vez de la carpeta entera.
 */

const prisma = new PrismaClient();

interface LabelMap {
  [locale: string]: string;
}

interface ElementDef {
  elementKey: string;
  labels: LabelMap;
}
interface CategoryDef {
  categoryKey: string;
  labels: LabelMap;
  elements: ElementDef[];
}
interface GroupDef {
  groupKey: string;
  labels: LabelMap;
  categories: CategoryDef[];
}
interface SystemTreeJson {
  systemKey: string;
  imageKey?: string | null;
  labels: LabelMap;
  groups: GroupDef[];
}

const SUPPORTED_LOCALES: Locale[] = [
  "ar", "de", "en", "es", "fr", "hr", "it", "ja", "nl", "pl", "tr", "zh",
];

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const fileArgIdx = args.indexOf("--file");
const fileArg = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null;
const proposedDir = path.resolve(__dirname, "..", "datasets", "parts", "proposed");

function collectFiles(): string[] {
  if (fileArg) {
    const abs = path.resolve(fileArg);
    if (!fs.existsSync(abs)) throw new Error(`No existe: ${abs}`);
    return [abs];
  }
  return fs.readdirSync(proposedDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(proposedDir, f));
}

interface Counters {
  groupsCreated: number;
  groupsUpdated: number;
  categoriesCreated: number;
  categoriesUpdated: number;
  elementsCreated: number;
  elementsUpdated: number;
  translationsUpserted: number;
}

const emptyCounters = (): Counters => ({
  groupsCreated: 0,
  groupsUpdated: 0,
  categoriesCreated: 0,
  categoriesUpdated: 0,
  elementsCreated: 0,
  elementsUpdated: 0,
  translationsUpserted: 0,
});

async function upsertTranslations(
  kind: "group" | "category" | "element",
  parentId: string,
  labels: LabelMap,
  counters: Counters,
): Promise<void> {
  for (const [locale, name] of Object.entries(labels)) {
    if (!SUPPORTED_LOCALES.includes(locale as Locale)) continue;
    if (dryRun) { counters.translationsUpserted++; continue; }
    if (kind === "group") {
      await prisma.partGroupTranslation.upsert({
        where: { groupId_locale: { groupId: parentId, locale: locale as Locale } },
        create: { groupId: parentId, locale: locale as Locale, name },
        update: { name },
      });
    } else if (kind === "category") {
      await prisma.partCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: parentId, locale: locale as Locale } },
        create: { categoryId: parentId, locale: locale as Locale, name },
        update: { name },
      });
    } else {
      await prisma.partElementTranslation.upsert({
        where: { elementId_locale: { elementId: parentId, locale: locale as Locale } },
        create: { elementId: parentId, locale: locale as Locale, name },
        update: { name },
      });
    }
    counters.translationsUpserted++;
  }
}

async function processTree(tree: SystemTreeJson, counters: Counters): Promise<void> {
  const system = await prisma.partSystem.findUnique({ where: { key: tree.systemKey } });
  if (!system) {
    throw new Error(
      `PartSystem no existe: ${tree.systemKey}. Correr primero migrate:part-systems.`,
    );
  }
  console.log(`\n▸ ${tree.systemKey}  (system.id=${system.id})`);

  for (const group of tree.groups) {
    let groupId: string;
    const existingGroup = await prisma.partGroup.findUnique({
      where: { systemId_key: { systemId: system.id, key: group.groupKey } },
    });
    if (existingGroup) {
      groupId = existingGroup.id;
      counters.groupsUpdated++;
    } else if (!dryRun) {
      const g = await prisma.partGroup.create({
        data: { systemId: system.id, key: group.groupKey },
      });
      groupId = g.id;
      counters.groupsCreated++;
    } else {
      groupId = `dryrun-group-${group.groupKey}`;
      counters.groupsCreated++;
    }
    console.log(`   · group  ${group.groupKey}`);
    await upsertTranslations("group", groupId, group.labels, counters);

    for (const category of group.categories) {
      let categoryId: string;
      const existingCategory = await prisma.partCategory.findFirst({
        where: { groupId, key: category.categoryKey },
      });
      const defaultName = category.labels.en ?? category.labels.es ?? category.categoryKey;
      if (existingCategory) {
        categoryId = existingCategory.id;
        if (!dryRun) {
          await prisma.partCategory.update({
            where: { id: categoryId },
            data: { name: defaultName, systemId: system.id, groupId },
          });
        }
        counters.categoriesUpdated++;
      } else if (!dryRun) {
        const c = await prisma.partCategory.create({
          data: {
            key: category.categoryKey,
            name: defaultName,
            groupId,
            systemId: system.id,
          },
        });
        categoryId = c.id;
        counters.categoriesCreated++;
      } else {
        categoryId = `dryrun-category-${category.categoryKey}`;
        counters.categoriesCreated++;
      }
      console.log(`     · category  ${category.categoryKey}`);
      await upsertTranslations("category", categoryId, category.labels, counters);

      for (const element of category.elements) {
        let elementId: string;
        const existingElement = await prisma.partElement.findUnique({
          where: { key: element.elementKey },
        });
        if (existingElement) {
          elementId = existingElement.id;
          if (!dryRun) {
            await prisma.partElement.update({
              where: { id: elementId },
              data: { categoryId, groupId, systemId: system.id },
            });
          }
          counters.elementsUpdated++;
        } else if (!dryRun) {
          const e = await prisma.partElement.create({
            data: {
              key: element.elementKey,
              categoryId,
              groupId,
              systemId: system.id,
            },
          });
          elementId = e.id;
          counters.elementsCreated++;
        } else {
          elementId = `dryrun-element-${element.elementKey}`;
          counters.elementsCreated++;
        }
        await upsertTranslations("element", elementId, element.labels, counters);
      }
    }
  }
}

async function main() {
  console.log(dryRun ? "MODO DRY-RUN (usa --apply para escribir)\n" : "MODO APPLY (escribe cambios)\n");
  const files = collectFiles();
  console.log(`Ficheros a procesar: ${files.length}`);
  files.forEach((f) => console.log(`   - ${path.relative(process.cwd(), f)}`));

  const counters = emptyCounters();
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const tree = JSON.parse(raw) as SystemTreeJson;
    await processTree(tree, counters);
  }

  console.log("\n▸ Resumen:");
  console.log(`   Groups:       ${counters.groupsCreated} nuevos / ${counters.groupsUpdated} existentes`);
  console.log(`   Categories:   ${counters.categoriesCreated} nuevos / ${counters.categoriesUpdated} existentes`);
  console.log(`   Elements:     ${counters.elementsCreated} nuevos / ${counters.elementsUpdated} existentes`);
  console.log(`   Translations: ${counters.translationsUpserted} upserted`);

  if (dryRun) {
    console.log("\n→ Vuelve a lanzar con --apply para escribir cambios.");
  } else {
    console.log("\n✓ Importación completada.");
  }
}

main()
  .catch((err) => {
    console.error("✗ Falló la importación:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
