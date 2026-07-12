import "dotenv/config";
import { PrismaClient, Locale } from "@prisma/client";

/**
 * Migración quirúrgica a la lista canónica de 20 PartSystem.
 *
 * Estrategia:
 *   - No borra ninguna fila existente (los duplicados se marcan como deuda
 *     y se purgan en una migración posterior cuando sepamos cuántas
 *     PartLine / MarketplacePart apuntan a cada uno).
 *   - Renombra la `key` de las filas ganadoras que necesitan alinearse con
 *     el plan (tires → wheels-and-tires, oils-liquids → oils-and-liquids).
 *     El `id` (cuid) NO cambia, así que las FKs persistidas en otros repos
 *     (lab-core-api, MarketplacePart) siguen resolviendo.
 *   - INSERT de los 8 sistemas nuevos que aún no existen.
 *   - Upsert de las 12 traducciones por cada uno de los 20 canónicos.
 *
 * Duplicados que NO se tocan aún (deuda pendiente):
 *   engine-unit, cooling, climate, climate-systems,
 *   chassis-and-steering, electrical-system, innenraum
 */

const prisma = new PrismaClient();

type Translations = Record<Locale, string>;

interface CanonicalSystem {
  key: string;
  origin: "existing" | "renamed" | "new";
  renamedFrom?: string;
  translations: Translations;
}

const CANONICAL_SYSTEMS: CanonicalSystem[] = [
  {
    key: "propulsion-unit",
    origin: "existing",
    translations: {
      ar: "المحرك",
      de: "Motor",
      en: "Propulsion unit",
      es: "Motor",
      fr: "Groupe motopropulseur",
      hr: "Motor",
      it: "Motore",
      ja: "エンジン",
      nl: "Aandrijving",
      pl: "Napęd",
      tr: "Motor",
      zh: "发动机",
    },
  },
  {
    key: "transmission",
    origin: "existing",
    translations: {
      ar: "ناقل الحركة",
      de: "Getriebe",
      en: "Transmission",
      es: "Transmisión",
      fr: "Transmission",
      hr: "Mjenjač",
      it: "Trasmissione",
      ja: "トランスミッション",
      nl: "Transmissie",
      pl: "Skrzynia biegów",
      tr: "Şanzıman",
      zh: "变速器",
    },
  },
  {
    key: "brakes",
    origin: "existing",
    translations: {
      ar: "المكابح",
      de: "Bremsen",
      en: "Brakes",
      es: "Frenos",
      fr: "Freins",
      hr: "Kočnice",
      it: "Freni",
      ja: "ブレーキ",
      nl: "Remmen",
      pl: "Hamulce",
      tr: "Frenler",
      zh: "制动系统",
    },
  },
  {
    key: "wheels-and-tires",
    origin: "renamed",
    renamedFrom: "tires",
    translations: {
      ar: "العجلات والإطارات",
      de: "Räder und Reifen",
      en: "Wheels and tires",
      es: "Ruedas y neumáticos",
      fr: "Roues et pneus",
      hr: "Kotači i gume",
      it: "Ruote e pneumatici",
      ja: "ホイールとタイヤ",
      nl: "Wielen en banden",
      pl: "Koła i opony",
      tr: "Jantlar ve lastikler",
      zh: "轮毂与轮胎",
    },
  },
  {
    key: "suspension",
    origin: "existing",
    translations: {
      ar: "نظام التعليق",
      de: "Fahrwerk",
      en: "Suspension",
      es: "Suspensión",
      fr: "Suspension",
      hr: "Ovjes",
      it: "Sospensione",
      ja: "サスペンション",
      nl: "Ophanging",
      pl: "Zawieszenie",
      tr: "Süspansiyon",
      zh: "悬挂系统",
    },
  },
  {
    key: "chassis-and-steering-system",
    origin: "existing",
    translations: {
      ar: "الهيكل ونظام التوجيه",
      de: "Fahrgestell und Lenkung",
      en: "Chassis and steering system",
      es: "Chasis y dirección",
      fr: "Châssis et direction",
      hr: "Šasija i upravljački sustav",
      it: "Telaio e sterzo",
      ja: "シャシーとステアリング",
      nl: "Chassis en besturing",
      pl: "Podwozie i układ kierowniczy",
      tr: "Şasi ve direksiyon sistemi",
      zh: "底盘与转向系统",
    },
  },
  {
    key: "electrics",
    origin: "existing",
    translations: {
      ar: "النظام الكهربائي",
      de: "Elektrik",
      en: "Electrical system",
      es: "Sistema eléctrico",
      fr: "Système électrique",
      hr: "Električni sustav",
      it: "Impianto elettrico",
      ja: "電気系統",
      nl: "Elektrisch systeem",
      pl: "Instalacja elektryczna",
      tr: "Elektrik sistemi",
      zh: "电气系统",
    },
  },
  {
    key: "body",
    origin: "existing",
    translations: {
      ar: "الهيكل الخارجي",
      de: "Karosserie",
      en: "Body",
      es: "Carrocería",
      fr: "Carrosserie",
      hr: "Karoserija",
      it: "Carrozzeria",
      ja: "ボディ",
      nl: "Carrosserie",
      pl: "Nadwozie",
      tr: "Kaporta",
      zh: "车身",
    },
  },
  {
    key: "interior",
    origin: "existing",
    translations: {
      ar: "المقصورة الداخلية",
      de: "Innenraum",
      en: "Interior",
      es: "Interior",
      fr: "Intérieur",
      hr: "Unutrašnjost",
      it: "Interni",
      ja: "インテリア",
      nl: "Interieur",
      pl: "Wnętrze",
      tr: "İç mekan",
      zh: "车厢内饰",
    },
  },
  {
    key: "cooling-system",
    origin: "existing",
    translations: {
      ar: "نظام التبريد",
      de: "Kühlsystem",
      en: "Cooling system",
      es: "Sistema de refrigeración",
      fr: "Système de refroidissement",
      hr: "Sustav hlađenja",
      it: "Impianto di raffreddamento",
      ja: "冷却システム",
      nl: "Koelsysteem",
      pl: "Układ chłodzenia",
      tr: "Soğutma sistemi",
      zh: "冷却系统",
    },
  },
  {
    key: "climate-control-systems",
    origin: "existing",
    translations: {
      ar: "نظام تكييف الهواء",
      de: "Klimaanlage",
      en: "Climate control system",
      es: "Sistema de climatización",
      fr: "Système de climatisation",
      hr: "Klima uređaj",
      it: "Impianto di climatizzazione",
      ja: "エアコンシステム",
      nl: "Klimaatregeling",
      pl: "Klimatyzacja",
      tr: "Klima sistemi",
      zh: "空调系统",
    },
  },
  {
    key: "exhaust-system",
    origin: "new",
    translations: {
      ar: "نظام العادم",
      de: "Abgasanlage",
      en: "Exhaust system",
      es: "Sistema de escape",
      fr: "Système d'échappement",
      hr: "Ispušni sustav",
      it: "Impianto di scarico",
      ja: "排気システム",
      nl: "Uitlaatsysteem",
      pl: "Układ wydechowy",
      tr: "Egzoz sistemi",
      zh: "排气系统",
    },
  },
  {
    key: "fuel-system",
    origin: "new",
    translations: {
      ar: "نظام الوقود",
      de: "Kraftstoffsystem",
      en: "Fuel system",
      es: "Sistema de alimentación",
      fr: "Système d'alimentation",
      hr: "Sustav goriva",
      it: "Impianto di alimentazione",
      ja: "燃料システム",
      nl: "Brandstofsysteem",
      pl: "Układ paliwowy",
      tr: "Yakıt sistemi",
      zh: "燃油系统",
    },
  },
  {
    key: "ignition-system",
    origin: "new",
    translations: {
      ar: "نظام الإشعال",
      de: "Zündanlage",
      en: "Ignition system",
      es: "Sistema de encendido",
      fr: "Système d'allumage",
      hr: "Sustav paljenja",
      it: "Impianto di accensione",
      ja: "点火システム",
      nl: "Ontstekingssysteem",
      pl: "Układ zapłonowy",
      tr: "Ateşleme sistemi",
      zh: "点火系统",
    },
  },
  {
    key: "lighting-system",
    origin: "new",
    translations: {
      ar: "نظام الإضاءة",
      de: "Beleuchtung",
      en: "Lighting system",
      es: "Sistema de iluminación",
      fr: "Système d'éclairage",
      hr: "Rasvjeta",
      it: "Impianto di illuminazione",
      ja: "灯火装置",
      nl: "Verlichting",
      pl: "Oświetlenie",
      tr: "Aydınlatma sistemi",
      zh: "照明系统",
    },
  },
  {
    key: "safety-and-restraints",
    origin: "new",
    translations: {
      ar: "أنظمة السلامة والاحتجاز",
      de: "Sicherheit und Rückhaltesysteme",
      en: "Safety and restraints",
      es: "Sistema de seguridad y sujeción",
      fr: "Sécurité et retenue",
      hr: "Sigurnosni sustavi",
      it: "Sicurezza e ritenuta",
      ja: "安全装置と拘束装置",
      nl: "Veiligheid en beveiligingssystemen",
      pl: "Bezpieczeństwo i systemy przytrzymujące",
      tr: "Güvenlik ve tutucu sistemler",
      zh: "安全与约束系统",
    },
  },
  {
    key: "glass-and-mirrors",
    origin: "new",
    translations: {
      ar: "الزجاج والمرايا",
      de: "Verglasung und Spiegel",
      en: "Glass and mirrors",
      es: "Cristales y retrovisores",
      fr: "Vitres et rétroviseurs",
      hr: "Stakla i retrovizori",
      it: "Vetri e specchietti",
      ja: "ガラスとミラー",
      nl: "Ruiten en spiegels",
      pl: "Szyby i lusterka",
      tr: "Camlar ve aynalar",
      zh: "玻璃与后视镜",
    },
  },
  {
    key: "wipers-and-washers",
    origin: "new",
    translations: {
      ar: "المساحات وغسالات الزجاج",
      de: "Wisch- und Waschanlage",
      en: "Wipers and washers",
      es: "Limpiaparabrisas y lavaparabrisas",
      fr: "Essuie-glaces et lave-glaces",
      hr: "Brisači i perači stakala",
      it: "Tergicristalli e lavavetri",
      ja: "ワイパーとウォッシャー",
      nl: "Ruitenwissers en sproeiers",
      pl: "Wycieraczki i spryskiwacze",
      tr: "Silecekler ve fıskiye sistemi",
      zh: "雨刮器与清洗器",
    },
  },
  {
    key: "oils-and-liquids",
    origin: "renamed",
    renamedFrom: "oils-liquids",
    translations: {
      ar: "الزيوت والسوائل",
      de: "Öle und Flüssigkeiten",
      en: "Oils and liquids",
      es: "Aceites y líquidos",
      fr: "Huiles et liquides",
      hr: "Ulja i tekućine",
      it: "Oli e liquidi",
      ja: "オイルと液体",
      nl: "Oliën en vloeistoffen",
      pl: "Oleje i płyny",
      tr: "Yağlar ve sıvılar",
      zh: "油品与液体",
    },
  },
  {
    key: "tools-and-workshop",
    origin: "new",
    translations: {
      ar: "الأدوات ومعدات الورشة",
      de: "Werkzeuge und Werkstatt",
      en: "Tools and workshop",
      es: "Herramientas y taller",
      fr: "Outils et atelier",
      hr: "Alati i radionica",
      it: "Utensili e attrezzatura da officina",
      ja: "工具と工房設備",
      nl: "Gereedschap en werkplaats",
      pl: "Narzędzia i warsztat",
      tr: "Aletler ve atölye",
      zh: "工具与车间设备",
    },
  },
];

// Duplicados heredados que NO se tocan en esta migración.
// Se limpian cuando confirmemos cuántas filas de otras DB apuntan a ellos.
const KNOWN_DUPLICATES_TO_PURGE_LATER = [
  "engine-unit",              // → propulsion-unit
  "cooling",                  // → cooling-system
  "climate",                  // → climate-control-systems
  "climate-systems",          // → climate-control-systems
  "chassis-and-steering",     // → chassis-and-steering-system
  "electrical-system",        // → electrics
  "innenraum",                // → interior
] as const;

async function renameKey(oldKey: string, newKey: string): Promise<"renamed" | "already" | "missing"> {
  const existing = await prisma.partSystem.findUnique({ where: { key: oldKey } });
  if (!existing) {
    const alreadyNew = await prisma.partSystem.findUnique({ where: { key: newKey } });
    return alreadyNew ? "already" : "missing";
  }
  const collision = await prisma.partSystem.findUnique({ where: { key: newKey } });
  if (collision && collision.id !== existing.id) {
    throw new Error(
      `Rename ${oldKey}→${newKey} bloqueado: ambas keys ya existen con IDs diferentes. Consolidación manual necesaria.`,
    );
  }
  await prisma.partSystem.update({ where: { id: existing.id }, data: { key: newKey } });
  return "renamed";
}

async function upsertSystem(sys: CanonicalSystem): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.partSystem.findUnique({ where: { key: sys.key } });
  if (existing) return { id: existing.id, created: false };
  const created = await prisma.partSystem.create({ data: { key: sys.key } });
  return { id: created.id, created: true };
}

async function upsertTranslations(systemId: string, translations: Translations): Promise<number> {
  let n = 0;
  for (const [locale, name] of Object.entries(translations) as [Locale, string][]) {
    await prisma.partSystemTranslation.upsert({
      where: { systemId_locale: { systemId, locale } },
      create: { systemId, locale, name },
      update: { name },
    });
    n++;
  }
  return n;
}

async function main() {
  console.log("→ Renames de key (conservan id):");
  for (const sys of CANONICAL_SYSTEMS) {
    if (sys.origin !== "renamed" || !sys.renamedFrom) continue;
    const result = await renameKey(sys.renamedFrom, sys.key);
    console.log(`   ${sys.renamedFrom} → ${sys.key}: ${result}`);
  }

  console.log("\n→ Upsert de 20 sistemas canónicos + 12 traducciones cada uno:");
  let totalCreated = 0;
  let totalTx = 0;
  for (const sys of CANONICAL_SYSTEMS) {
    const { id, created } = await upsertSystem(sys);
    if (created) totalCreated++;
    const nTx = await upsertTranslations(id, sys.translations);
    totalTx += nTx;
    const marker = created ? "＋" : "·";
    console.log(`   ${marker} ${sys.key.padEnd(32)} [${sys.origin.padEnd(8)}]  → ${nTx} translations`);
  }

  console.log("\n→ Resumen:");
  console.log(`   Sistemas creados nuevos:   ${totalCreated}`);
  console.log(`   Traducciones upserted:     ${totalTx}`);
  console.log(`   Total sistemas canónicos:  ${CANONICAL_SYSTEMS.length}`);

  console.log("\n→ Duplicados heredados NO tocados (deuda pendiente):");
  for (const key of KNOWN_DUPLICATES_TO_PURGE_LATER) {
    const row = await prisma.partSystem.findUnique({ where: { key } });
    console.log(`   ${row ? "✗" : "·"} ${key} ${row ? `(id=${row.id})` : "(ya no existe)"}`);
  }

  console.log("\n✓ Migración completada. Recuerda:");
  console.log("   1. Reiniciar beterano-data para invalidar caches.");
  console.log("   2. Correr la migración equivalente en leads-api (MarketplacePart renames).");
  console.log("   3. Auditar marketplace-api y whatsapp-bot para uso de keys viejas.");
}

main()
  .catch((err) => {
    console.error("✗ Falló la migración:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
