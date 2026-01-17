import "dotenv/config";
import {
  CatalogItemKind,
  MediaType,
  PrismaClient,
  TaxonomyKind,
  Locale,
} from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import xlsx from "xlsx";

const prisma = new PrismaClient();

type MakeRecord = { id?: string; key?: string; name: string };
type ModelRecord = { id?: string; key?: string; name: string };

type TaxonomySeed = {
  key: string;
  name: string;
  kind: TaxonomyKind;
  parentKey?: string;
};

type OperationSeed = {
  key: string;
  name: string;
  skillKey?: string;
  taxonomyKey?: string;
  estimatedMinutes?: number;
  source?: string;
};

type PartSeed = {
  key: string;
  name: string;
  taxonomyKey?: string;
  source?: string;
};

type MediaSeed = {
  key: string;
  type: MediaType;
  url: string;
  path?: string;
  taxonomyKey?: string;
  vehicleModelKey?: string;
};

type LocaleMap = {
  en: string;
  es: string;
  de: string;
};

type CatalogCategorySeed = {
  key: string;
  name: string;
  kind: TaxonomyKind;
  parentKey?: string;
  translations: Partial<Record<Locale, string>>;
};

type CatalogItemSeed = {
  code: number;
  key: string;
  name: string;
  categoryKey: string;
  kind: CatalogItemKind;
  translations: Partial<Record<Locale, { name: string }>>;
};

const datasetRoot = path.join(process.cwd(), "datasets");

async function readJson<T>(relativePath: string): Promise<T | null> {
  try {
    const data = await fs.readFile(path.join(datasetRoot, relativePath), "utf8");
    if (!data.trim()) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

function normalizeKey(value: string | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildLocaleTranslations(
  names: LocaleMap,
  fallbackLocale: Locale,
  originalLocales: Partial<Record<Locale, boolean>>
) {
  const build = (name: string, locale: Locale, isFallback: boolean) => ({
    name,
    aliasesJson: [name],
    keywordsJson: Array.from(new Set(tokenize(name))),
    confidenceHint: isFallback ? `fallback_from_${fallbackLocale}` : null,
  });

  const isOriginal = (locale: Locale) => originalLocales[locale] === true;

  const result: Record<Locale, ReturnType<typeof build>> = {
    [Locale.ar]: build(names.en, Locale.ar, true),
    [Locale.de]: build(
      names.de,
      Locale.de,
      !isOriginal(Locale.de)
    ),
    [Locale.en]: build(
      names.en,
      Locale.en,
      !isOriginal(Locale.en)
    ),
    [Locale.es]: build(
      names.es,
      Locale.es,
      !isOriginal(Locale.es)
    ),
    [Locale.fr]: build(names.en, Locale.fr, true),
    [Locale.hr]: build(names.en, Locale.hr, true),
    [Locale.it]: build(names.en, Locale.it, true),
    [Locale.ja]: build(names.en, Locale.ja, true),
    [Locale.nl]: build(names.en, Locale.nl, true),
    [Locale.pl]: build(names.en, Locale.pl, true),
    [Locale.tr]: build(names.en, Locale.tr, true),
    [Locale.zh]: build(names.en, Locale.zh, true),
  };

  return result;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function buildCatalogMeta(name: string, code: number) {
  return {
    aliases: [name, String(code)],
    keywords: Array.from(new Set(tokenize(name))),
  };
}

function buildNames(
  enValue?: string,
  esValue?: string,
  deValue?: string
): {
  names: LocaleMap;
  fallbackLocale: Locale;
  originalLocales: Partial<Record<Locale, boolean>>;
} | null {
  const en = (enValue ?? "").trim();
  const es = (esValue ?? "").trim();
  const de = (deValue ?? "").trim();
  const fallback = en || es || de;
  if (!fallback) return null;
  const fallbackLocale = en ? Locale.en : es ? Locale.es : Locale.de;
  return {
    names: {
      en: en || fallback,
      es: es || fallback,
      de: de || fallback,
    },
    fallbackLocale,
    originalLocales: {
      [Locale.en]: Boolean(en),
      [Locale.es]: Boolean(es),
      [Locale.de]: Boolean(de),
    },
  };
}

function getRowValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return String(direct).trim();
    }
  }
  const loweredKeys = keys.map((key) => key.toLowerCase());
  for (const [rowKey, value] of Object.entries(row)) {
    const normalized = rowKey.toLowerCase();
    if (loweredKeys.some((key) => normalized.includes(key))) {
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
  }
  return "";
}

function imageKeyFromFilename(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const base = trimmed.replace(/\.[^/.]+$/, "");
  const key = normalizeKey(base);
  return key || null;
}

async function importPartsFromExcel() {
  const partsPath =
    process.env.PARTS_XLSX_PATH ??
    path.join(datasetRoot, "parts", "biblioteca_piezas.xlsx");

  if (!(await fileExists(partsPath))) {
    console.warn(`Parts Excel not found at ${partsPath}, skipping import.`);
    return;
  }

  const workbook = xlsx.readFile(partsPath);
  const sheet = workbook.Sheets["00_DATA"];
  if (!sheet) {
    console.warn("Sheet 00_DATA not found in parts Excel.");
    return;
  }

  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const systemMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  const categoryMap = new Map<string, string>();

  for (const row of rows) {
    const legacyId = getRowValue(row, ["ID", "id"]);

    const systemNames = buildNames(
      getRowValue(row, ["EN_automotive systems", "EN_automotive_systems"]),
      getRowValue(row, ["ES_Sistemas automotrices", "ES_Sistemas_automotrices"]),
      getRowValue(row, ["DE_Automobilsysteme"])
    );

    const groupNames = buildNames(
      getRowValue(row, ["EN_Groups", "EN_Group"]),
      getRowValue(row, ["ES_Groups", "ES_Group"]),
      getRowValue(row, ["DE_Groups", "DE_Group"])
    );

    const categoryNames = buildNames(
      getRowValue(row, ["EN_Category"]),
      getRowValue(row, ["ES_Category"]),
      getRowValue(row, ["DE_Category"])
    );

    const elementNames = buildNames(
      getRowValue(row, ["EN_Element"]),
      getRowValue(row, ["ES_Element"]),
      getRowValue(row, ["DE_Element"])
    );

    if (!systemNames || !groupNames || !categoryNames || !elementNames) {
      continue;
    }

    const systemKey = normalizeKey(systemNames.names.en);
    const groupKey = normalizeKey(groupNames.names.en);
    const categoryKey = normalizeKey(categoryNames.names.en);
    const elementKey = legacyId.trim();

    if (!systemKey || !groupKey || !categoryKey || !elementKey) {
      console.warn(`Skipping row with empty key: ${legacyId || "unknown"}`);
      continue;
    }

    const systemImage = imageKeyFromFilename(
      getRowValue(row, ["Image_automotive system"])
    );
    const groupImage = imageKeyFromFilename(getRowValue(row, ["Image_Group2"]));
    const elementImage = imageKeyFromFilename(
      getRowValue(row, ["Image_Elemnt", "Image_Element"])
    );

    let systemId = systemMap.get(systemKey);
    if (!systemId) {
      const system = await prisma.partSystem.upsert({
        where: { key: systemKey },
        update: { imageKey: systemImage || null },
        create: { key: systemKey, imageKey: systemImage || null },
      });
      systemId = system.id;
      systemMap.set(systemKey, systemId);

      const translations = buildLocaleTranslations(
        systemNames.names,
        systemNames.fallbackLocale,
        systemNames.originalLocales
      );
      for (const [locale, payload] of Object.entries(translations)) {
        await prisma.partSystemTranslation.upsert({
          where: {
            systemId_locale: { systemId, locale: locale as Locale },
          },
          update: payload,
          create: { systemId, locale: locale as Locale, ...payload },
        });
      }
    }

    const groupKeyComposite = `${systemId}-${groupKey}`;
    let groupId = groupMap.get(groupKeyComposite);
    if (!groupId) {
      const group = await prisma.partGroup.upsert({
        where: {
          systemId_key: {
            systemId,
            key: groupKey,
          },
        },
        update: { systemId, imageKey: groupImage || null },
        create: { key: groupKey, systemId, imageKey: groupImage || null },
      });
      groupId = group.id;
      groupMap.set(groupKeyComposite, groupId);

      const translations = buildLocaleTranslations(
        groupNames.names,
        groupNames.fallbackLocale,
        groupNames.originalLocales
      );
      for (const [locale, payload] of Object.entries(translations)) {
        await prisma.partGroupTranslation.upsert({
          where: { groupId_locale: { groupId, locale: locale as Locale } },
          update: payload,
          create: { groupId, locale: locale as Locale, ...payload },
        });
      }
    }

    const categoryKeyComposite = `${groupId}-${categoryKey}`;
    let categoryId = categoryMap.get(categoryKeyComposite);
    if (!categoryId) {
      const category = await prisma.partCategory.upsert({
        where: {
          groupId_key: {
            groupId,
            key: categoryKey,
          },
        },
        update: { groupId, systemId },
        create: {
          key: categoryKey,
          name: categoryNames.names.es,
          groupId,
          systemId,
        },
      });
      categoryId = category.id;
      categoryMap.set(categoryKeyComposite, categoryId);

      const translations = buildLocaleTranslations(
        categoryNames.names,
        categoryNames.fallbackLocale,
        categoryNames.originalLocales
      );
      for (const [locale, payload] of Object.entries(translations)) {
        await prisma.partCategoryTranslation.upsert({
          where: {
            categoryId_locale: { categoryId, locale: locale as Locale },
          },
          update: payload,
          create: { categoryId, locale: locale as Locale, ...payload },
        });
      }
    }

    const element = await prisma.partElement.upsert({
      where: { key: elementKey },
      update: {
        categoryId,
        systemId,
        groupId,
        legacyId: legacyId || null,
        imageKey: elementImage || null,
      },
      create: {
        key: elementKey,
        categoryId,
        systemId,
        groupId,
        legacyId: legacyId || null,
        imageKey: elementImage || null,
      },
    });

    const translations = buildLocaleTranslations(
      elementNames.names,
      elementNames.fallbackLocale,
      elementNames.originalLocales
    );
    for (const [locale, payload] of Object.entries(translations)) {
      await prisma.partElementTranslation.upsert({
        where: {
          elementId_locale: { elementId: element.id, locale: locale as Locale },
        },
        update: payload,
        create: { elementId: element.id, locale: locale as Locale, ...payload },
      });
    }
  }
}

async function logPartCounts() {
  const systems = await prisma.partSystem.count();
  const groups = await prisma.partGroup.count();
  const categories = await prisma.partCategory.count();
  const elements = await prisma.partElement.count();
  const systemTranslations = await prisma.partSystemTranslation.count();
  const groupTranslations = await prisma.partGroupTranslation.count();
  const categoryTranslations = await prisma.partCategoryTranslation.count();
  const elementTranslations = await prisma.partElementTranslation.count();

  console.log("Parts import counts:");
  console.log(
    `systems: ${systems}, groups: ${groups}, categories: ${categories}, elements: ${elements}`
  );
  console.log(
    `translations: systems ${systemTranslations}, groups ${groupTranslations}, categories ${categoryTranslations}, elements ${elementTranslations}`
  );
}

const CATALOG_ROOT_KEY = "workshop_catalog";

const ALL_LOCALES: Locale[] = [
  Locale.ar,
  Locale.de,
  Locale.en,
  Locale.es,
  Locale.fr,
  Locale.hr,
  Locale.it,
  Locale.ja,
  Locale.nl,
  Locale.pl,
  Locale.tr,
  Locale.zh,
];

type LocaleNames = {
  ar: string;
  de: string;
  en: string;
  es: string;
  fr: string;
  hr: string;
  it: string;
  ja: string;
  nl: string;
  pl: string;
  tr: string;
  zh: string;
};

function buildCatalogCategory(input: {
  key: string;
  parentKey?: string;
  names: LocaleNames;
}): CatalogCategorySeed {
  return {
    key: input.key,
    name: input.names.es,
    kind: TaxonomyKind.CATALOG,
    parentKey: input.parentKey,
    translations: {
      [Locale.ar]: input.names.ar,
      [Locale.de]: input.names.de,
      [Locale.en]: input.names.en,
      [Locale.es]: input.names.es,
      [Locale.fr]: input.names.fr,
      [Locale.hr]: input.names.hr,
      [Locale.it]: input.names.it,
      [Locale.ja]: input.names.ja,
      [Locale.nl]: input.names.nl,
      [Locale.pl]: input.names.pl,
      [Locale.tr]: input.names.tr,
      [Locale.zh]: input.names.zh,
    },
  };
}

const catalogCategories: CatalogCategorySeed[] = [
  buildCatalogCategory({
    key: CATALOG_ROOT_KEY,
    names: {
      ar: "كتالوج الورشة",
      de: "Werkstattkatalog",
      en: "Workshop catalog",
      es: "Catalogo de taller",
      fr: "Catalogue d'atelier",
      hr: "Katalog radionice",
      it: "Catalogo officina",
      ja: "ワークショップカタログ",
      nl: "Werkplaatscatalogus",
      pl: "Katalog warsztatu",
      tr: "Atolye katalogu",
      zh: "车间目录",
    },
  }),
  buildCatalogCategory({
    key: "diagnosis",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "التشخيص والاختبارات",
      de: "Diagnose und Pruefungen",
      en: "Diagnostics and tests",
      es: "Diagnostico y pruebas",
      fr: "Diagnostic et tests",
      hr: "Dijagnostika i testovi",
      it: "Diagnosi e test",
      ja: "診断とテスト",
      nl: "Diagnose en tests",
      pl: "Diagnostyka i testy",
      tr: "Ariza tespiti ve testler",
      zh: "诊断与测试",
    },
  }),
  buildCatalogCategory({
    key: "service_maintenance",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "الخدمة والصيانة",
      de: "Service und Wartung",
      en: "Service and maintenance",
      es: "Servicio y mantenimiento",
      fr: "Service et entretien",
      hr: "Servis i odrzavanje",
      it: "Servizio e manutenzione",
      ja: "サービスとメンテナンス",
      nl: "Service en onderhoud",
      pl: "Serwis i konserwacja",
      tr: "Servis ve bakim",
      zh: "保养与维护",
    },
  }),
  buildCatalogCategory({
    key: "oils_fluids",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "الزيوت والسوائل",
      de: "Oele und Fluessigkeiten",
      en: "Oils and fluids",
      es: "Aceites y liquidos",
      fr: "Huiles et liquides",
      hr: "Ulja i tekucine",
      it: "Oli e liquidi",
      ja: "オイルと液体",
      nl: "Olie en vloeistoffen",
      pl: "Oleje i plyny",
      tr: "Yaglar ve sivililar",
      zh: "机油与液体",
    },
  }),
  buildCatalogCategory({
    key: "additives_consumables",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "المضافات والمواد الاستهلاكية",
      de: "Additive und Verbrauchsmaterial",
      en: "Additives and consumables",
      es: "Aditivos y consumibles",
      fr: "Additifs et consommables",
      hr: "Aditivi i potrosni materijal",
      it: "Additivi e materiali di consumo",
      ja: "添加剤と消耗品",
      nl: "Additieven en verbruiksartikelen",
      pl: "Dodatki i materialy eksploatacyjne",
      tr: "Katkilar ve sarf malzemeleri",
      zh: "添加剂和耗材",
    },
  }),
  buildCatalogCategory({
    key: "wheels_tyres",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "العجلات والإطارات",
      de: "Raeder und Reifen",
      en: "Wheels and tyres",
      es: "Ruedas y neumaticos",
      fr: "Roues et pneus",
      hr: "Kotaci i gume",
      it: "Ruote e pneumatici",
      ja: "ホイールとタイヤ",
      nl: "Wielen en banden",
      pl: "Kola i opony",
      tr: "Jantlar ve lastikler",
      zh: "车轮与轮胎",
    },
  }),
  buildCatalogCategory({
    key: "filters_ignition",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "المرشحات والإشعال",
      de: "Filter und Zuendung",
      en: "Filters and ignition",
      es: "Filtros y encendido",
      fr: "Filtres et allumage",
      hr: "Filteri i paljenje",
      it: "Filtri e accensione",
      ja: "フィルターと点火",
      nl: "Filters en ontsteking",
      pl: "Filtry i zaplon",
      tr: "Filtreler ve atesleme",
      zh: "滤清器与点火",
    },
  }),
  buildCatalogCategory({
    key: "brakes",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "نظام الفرامل",
      de: "Bremsanlage",
      en: "Brake system",
      es: "Sistema de frenos",
      fr: "Système de freinage",
      hr: "Kocioni sustav",
      it: "Impianto frenante",
      ja: "ブレーキシステム",
      nl: "Remsysteem",
      pl: "Uklad hamulcowy",
      tr: "Fren sistemi",
      zh: "制动系统",
    },
  }),
  buildCatalogCategory({
    key: "engine_drive",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "المحرك ونظام نقل الحركة",
      de: "Motor und Antrieb",
      en: "Engine and drivetrain",
      es: "Motor y transmision",
      fr: "Moteur et transmission",
      hr: "Motor i pogon",
      it: "Motore e trasmissione",
      ja: "エンジンと駆動系",
      nl: "Motor en aandrijving",
      pl: "Silnik i naped",
      tr: "Motor ve aktarma",
      zh: "发动机与传动",
    },
  }),
  buildCatalogCategory({
    key: "electrical",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "الكهرباء والإلكترونيات",
      de: "Elektrik und Elektronik",
      en: "Electrical and electronics",
      es: "Electricidad y electronica",
      fr: "Électricité et électronique",
      hr: "Elektrika i elektronika",
      it: "Elettrico ed elettronica",
      ja: "電装と電子",
      nl: "Elektrisch en elektronica",
      pl: "Elektryka i elektronika",
      tr: "Elektrik ve elektronik",
      zh: "电气与电子",
    },
  }),
  buildCatalogCategory({
    key: "exhaust",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "نظام العادم",
      de: "Abgasanlage",
      en: "Exhaust system",
      es: "Sistema de escape",
      fr: "Système d'échappement",
      hr: "Ispusni sustav",
      it: "Impianto di scarico",
      ja: "排気システム",
      nl: "Uitlaatsysteem",
      pl: "Układ wydechowy",
      tr: "Egzoz sistemi",
      zh: "排气系统",
    },
  }),
  buildCatalogCategory({
    key: "hoses_fixings",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "الخراطيم والتثبيتات",
      de: "Schlaeuche und Befestigungen",
      en: "Hoses and fittings",
      es: "Mangueras y fijaciones",
      fr: "Durites et fixations",
      hr: "Crijeva i pricvrsnica",
      it: "Tubi e fissaggi",
      ja: "ホースと固定具",
      nl: "Slangen en bevestigingen",
      pl: "Węże i mocowania",
      tr: "Hortumlar ve baglantilar",
      zh: "软管与固定件",
    },
  }),
  buildCatalogCategory({
    key: "extras",
    parentKey: CATALOG_ROOT_KEY,
    names: {
      ar: "خدمات اضافية",
      de: "Zusatzleistungen",
      en: "Additional services",
      es: "Servicios adicionales",
      fr: "Services supplémentaires",
      hr: "Dodatne usluge",
      it: "Servizi aggiuntivi",
      ja: "追加サービス",
      nl: "Aanvullende diensten",
      pl: "Uslugi dodatkowe",
      tr: "Ek hizmetler",
      zh: "附加服务",
    },
  }),
];

function buildCatalogItem(
  code: number,
  categoryKey: string,
  names: LocaleNames
): CatalogItemSeed {
  const key = normalizeKey(`${names.es}-${code}`);
  return {
    code,
    key,
    name: names.es,
    categoryKey,
    kind: getCatalogItemKind(categoryKey, names.es),
    translations: {
      [Locale.ar]: { name: names.ar },
      [Locale.de]: { name: names.de },
      [Locale.en]: { name: names.en },
      [Locale.es]: { name: names.es },
      [Locale.fr]: { name: names.fr },
      [Locale.hr]: { name: names.hr },
      [Locale.it]: { name: names.it },
      [Locale.ja]: { name: names.ja },
      [Locale.nl]: { name: names.nl },
      [Locale.pl]: { name: names.pl },
      [Locale.tr]: { name: names.tr },
      [Locale.zh]: { name: names.zh },
    },
  };
}

function getCatalogItemKind(
  categoryKey: string,
  name: string
): CatalogItemKind {
  const normalizedName = name.toLowerCase();
  if (categoryKey === "extras") {
    if (normalizedName.includes("combustible")) {
      return CatalogItemKind.CONSUMABLE;
    }
    return CatalogItemKind.FEE;
  }

  if (categoryKey === "diagnosis" || categoryKey === "service_maintenance") {
    return CatalogItemKind.LABOR;
  }

  if (categoryKey === "oils_fluids" || categoryKey === "additives_consumables") {
    return CatalogItemKind.CONSUMABLE;
  }

  return CatalogItemKind.PART;
}

const workshopCatalogItems: CatalogItemSeed[] = [
  // Diagnosis / Pruefungen
  buildCatalogItem(122, "diagnosis", {
    ar: "توصيل جهاز تشخيص المحرك",
    de: "Motor-Diagnosegeraet anschliessen",
    en: "Connect engine diagnostic equipment",
    es: "Conectar equipo de diagnosis del motor",
    fr: "Raccorder l'appareil de diagnostic moteur",
    hr: "Spojiti uredjaj za dijagnostiku motora",
    it: "Collegare l'apparecchio di diagnosi motore",
    ja: "エンジン診断機器を接続",
    nl: "Motordiagnoseapparaat aansluiten",
    pl: "Podlaczenie testera diagnostycznego silnika",
    tr: "Motor ariza tespit cihazini baglama",
    zh: "连接发动机诊断设备",
  }),
  buildCatalogItem(503, "diagnosis", {
    ar: "جهاز اختبار الفرامل",
    de: "Bremsenpruefstand",
    en: "Brake test bench",
    es: "Banco de pruebas de frenos",
    fr: "Banc d'essai de freins",
    hr: "Kocioni ispitni stol",
    it: "Banco prova freni",
    ja: "ブレーキテストベンチ",
    nl: "Remmentestbank",
    pl: "Stanowisko prob hamulcow",
    tr: "Fren test cihazi",
    zh: "制动测试台",
  }),
  buildCatalogItem(504, "diagnosis", {
    ar: "جهاز اختبار ممتصات الصدمات",
    de: "Stossdaempfer-Pruefstand",
    en: "Shock absorber test bench",
    es: "Banco de pruebas de amortiguadores",
    fr: "Banc d'essai d'amortisseurs",
    hr: "Ispitni stol amortizera",
    it: "Banco prova ammortizzatori",
    ja: "ショックアブソーバーテストベンチ",
    nl: "Schokdemper testbank",
    pl: "Stanowisko prob amortyzatorow",
    tr: "Amortisor test cihazi",
    zh: "减震器测试台",
  }),
  buildCatalogItem(505, "diagnosis", {
    ar: "فحص محاذاة العجلات",
    de: "Achsvermessung",
    en: "Wheel alignment check",
    es: "Control de alineacion",
    fr: "Controle de parallélisme",
    hr: "Provjera geometrije",
    it: "Controllo convergenza",
    ja: "ホイールアライメント確認",
    nl: "Uitlijnen controleren",
    pl: "Sprawdzenie geometrii",
    tr: "Rot ayar kontrolu",
    zh: "四轮定位检查",
  }),
  buildCatalogItem(507, "diagnosis", {
    ar: "فحص المصابيح الامامية",
    de: "Scheinwerferpruefung",
    en: "Headlight check",
    es: "Control de faros",
    fr: "Controle des phares",
    hr: "Provjera farova",
    it: "Controllo fari",
    ja: "ヘッドライト点検",
    nl: "Koplampcontrole",
    pl: "Kontrola swiatel",
    tr: "Far kontrolu",
    zh: "前照灯检查",
  }),
  buildCatalogItem(509, "diagnosis", {
    ar: "قياس غازات العادم للبنزين",
    de: "Abgaspruefung Benzin",
    en: "Gasoline emissions test",
    es: "Medicion de gases gasolina",
    fr: "Mesure des gaz essence",
    hr: "Mjerenje ispusnih plinova benzina",
    it: "Misurazione gas benzina",
    ja: "ガソリン排ガス測定",
    nl: "Benzine emissietest",
    pl: "Pomiar spalin benzyna",
    tr: "Benzin emisyon olcumu",
    zh: "汽油尾气检测",
  }),
  buildCatalogItem(510, "diagnosis", {
    ar: "قياس غازات العادم للديزل",
    de: "Abgaspruefung Diesel",
    en: "Diesel emissions test",
    es: "Medicion de gases diesel",
    fr: "Mesure des gaz diesel",
    hr: "Mjerenje ispusnih plinova dizela",
    it: "Misurazione gas diesel",
    ja: "ディーゼル排ガス測定",
    nl: "Diesel emissietest",
    pl: "Pomiar spalin diesel",
    tr: "Dizel emisyon olcumu",
    zh: "柴油尾气检测",
  }),
  buildCatalogItem(511, "diagnosis", {
    ar: "هندسة التوجيه",
    de: "Lenkgeometrie",
    en: "Steering geometry",
    es: "Geometria de direccion",
    fr: "Geometrie de direction",
    hr: "Geometrija upravljanja",
    it: "Geometria sterzo",
    ja: "ステアリングジオメトリ",
    nl: "Stuurgeometrie",
    pl: "Geometria ukladu kierowniczego",
    tr: "Direksiyon geometrisi",
    zh: "转向几何",
  }),
  buildCatalogItem(522, "diagnosis", {
    ar: "رسوم الفحص / التشخيص",
    de: "Pruef- / Diagnosegebuehr",
    en: "Inspection / diagnosis fee",
    es: "Tasa de inspeccion / diagnostico",
    fr: "Frais d'inspection / diagnostic",
    hr: "Naknada za pregled / dijagnostiku",
    it: "Tariffa ispezione / diagnosi",
    ja: "点検/診断料金",
    nl: "Inspectie-/diagnosekosten",
    pl: "Oplata za przeglad / diagnostyke",
    tr: "Muayene / diagnostik ucreti",
    zh: "检测/诊断费用",
  }),
  // Service / Wartung
  buildCatalogItem(500, "service_maintenance", {
    ar: "فحص الشتاء",
    de: "Wintercheck",
    en: "Winter check",
    es: "Revision de invierno",
    fr: "Controle d'hiver",
    hr: "Zimski pregled",
    it: "Controllo invernale",
    ja: "冬季点検",
    nl: "Wintercheck",
    pl: "Przeglad zimowy",
    tr: "Kis kontrolu",
    zh: "冬季检查",
  }),
  buildCatalogItem(501, "service_maintenance", {
    ar: "فحص الربيع",
    de: "Fruehjahrscheck",
    en: "Spring check",
    es: "Revision de primavera",
    fr: "Controle de printemps",
    hr: "Proljetni pregled",
    it: "Controllo primaverile",
    ja: "春季点検",
    nl: "Lentecheck",
    pl: "Przeglad wiosenny",
    tr: "Ilkbahar kontrolu",
    zh: "春季检查",
  }),
  buildCatalogItem(502, "service_maintenance", {
    ar: "شحن البطارية",
    de: "Batterie laden",
    en: "Charge battery",
    es: "Cargar bateria",
    fr: "Recharger la batterie",
    hr: "Punjenje baterije",
    it: "Caricare la batteria",
    ja: "バッテリー充電",
    nl: "Accu opladen",
    pl: "Ladowanie akumulatora",
    tr: "Aku sarji",
    zh: "电池充电",
  }),
  buildCatalogItem(512, "service_maintenance", {
    ar: "تنظيف المحرك",
    de: "Motorreinigung",
    en: "Engine cleaning",
    es: "Limpieza de motor",
    fr: "Nettoyage moteur",
    hr: "Ciscenje motora",
    it: "Pulizia motore",
    ja: "エンジンクリーニング",
    nl: "Motorreiniging",
    pl: "Czyszczenie silnika",
    tr: "Motor temizligi",
    zh: "发动机清洗",
  }),
  buildCatalogItem(513, "service_maintenance", {
    ar: "تنظيف المحرك والهيكل",
    de: "Motor- und Fahrwerksreinigung",
    en: "Engine and chassis cleaning",
    es: "Limpieza de motor y chasis",
    fr: "Nettoyage moteur et châssis",
    hr: "Ciscenje motora i sasije",
    it: "Pulizia motore e telaio",
    ja: "エンジンとシャーシの洗浄",
    nl: "Motor- en chassisreiniging",
    pl: "Czyszczenie silnika i podwozia",
    tr: "Motor ve sasi temizligi",
    zh: "发动机与底盘清洗",
  }),
  buildCatalogItem(514, "service_maintenance", {
    ar: "ضبط المصابيح وتسويتها",
    de: "Scheinwerfer einstellen und nivellieren",
    en: "Headlight adjustment and leveling",
    es: "Regulacion de faros y nivelacion",
    fr: "Réglage et mise à niveau des phares",
    hr: "Podesavanje farova i nivelacija",
    it: "Regolazione e livellamento fari",
    ja: "ヘッドライト調整とレベリング",
    nl: "Koplampen afstellen en nivelleren",
    pl: "Ustawienie i poziomowanie reflektorow",
    tr: "Far ayari ve seviyeleme",
    zh: "前照灯调节与水平校正",
  }),
  buildCatalogItem(515, "service_maintenance", {
    ar: "مواد صغيرة ومواد تنظيف",
    de: "Kleinteile und Reinigungsmaterial",
    en: "Small materials and cleaning supplies",
    es: "Material pequeno y de limpieza",
    fr: "Petits matériaux et produits de nettoyage",
    hr: "Sitni materijal i sredstva za ciscenje",
    it: "Piccoli materiali e prodotti di pulizia",
    ja: "小物品と清掃用品",
    nl: "Klein materiaal en reinigingsmiddelen",
    pl: "Drobne materialy i srodki czyszczace",
    tr: "Kucuk malzemeler ve temizlik malzemeleri",
    zh: "小型材料和清洁用品",
  }),
  buildCatalogItem(521, "service_maintenance", {
    ar: "خدمة تكييف الهواء",
    de: "Klimaservice",
    en: "Air conditioning service",
    es: "Servicio de climatizacion",
    fr: "Service de climatisation",
    hr: "Servis klima uredaja",
    it: "Servizio climatizzatore",
    ja: "エアコン整備",
    nl: "Aircoservice",
    pl: "Serwis klimatyzacji",
    tr: "Klima servisi",
    zh: "空调保养",
  }),
  // Oele & Fluessigkeiten
  buildCatalogItem(392, "oils_fluids", {
    ar: "زيت محرك 0W-40",
    de: "Motoroel 0W-40",
    en: "Engine oil 0W-40",
    es: "Aceite motor 0W-40",
    fr: "Huile moteur 0W-40",
    hr: "Motorno ulje 0W-40",
    it: "Olio motore 0W-40",
    ja: "エンジンオイル 0W-40",
    nl: "Motorolie 0W-40",
    pl: "Olej silnikowy 0W-40",
    tr: "Motor yagi 0W-40",
    zh: "发动机油 0W-40",
  }),
  buildCatalogItem(393, "oils_fluids", {
    ar: "زيت محرك 10W-40 ديزل",
    de: "Motoroel 10W-40 Diesel",
    en: "Engine oil 10W-40 diesel",
    es: "Aceite motor 10W-40 diesel",
    fr: "Huile moteur 10W-40 diesel",
    hr: "Motorno ulje 10W-40 dizel",
    it: "Olio motore 10W-40 diesel",
    ja: "エンジンオイル 10W-40 ディーゼル",
    nl: "Motorolie 10W-40 diesel",
    pl: "Olej silnikowy 10W-40 diesel",
    tr: "Motor yagi 10W-40 dizel",
    zh: "发动机油 10W-40 柴油",
  }),
  buildCatalogItem(394, "oils_fluids", {
    ar: "زيت محرك 10W-40",
    de: "Motoroel 10W-40",
    en: "Engine oil 10W-40",
    es: "Aceite motor 10W-40",
    fr: "Huile moteur 10W-40",
    hr: "Motorno ulje 10W-40",
    it: "Olio motore 10W-40",
    ja: "エンジンオイル 10W-40",
    nl: "Motorolie 10W-40",
    pl: "Olej silnikowy 10W-40",
    tr: "Motor yagi 10W-40",
    zh: "发动机油 10W-40",
  }),
  buildCatalogItem(395, "oils_fluids", {
    ar: "زيت ناقل الحركة 75W-90",
    de: "Getriebeoel 75W-90",
    en: "Transmission oil 75W-90",
    es: "Aceite transmision 75W-90",
    fr: "Huile de transmission 75W-90",
    hr: "Ulje mjenjaca 75W-90",
    it: "Olio trasmissione 75W-90",
    ja: "トランスミッションオイル 75W-90",
    nl: "Transmissieolie 75W-90",
    pl: "Olej przekladniowy 75W-90",
    tr: "Sanziman yagi 75W-90",
    zh: "变速箱油 75W-90",
  }),
  buildCatalogItem(396, "oils_fluids", {
    ar: "زيت المحور 85W-140",
    de: "Achsoel 85W-140",
    en: "Axle oil 85W-140",
    es: "Aceite eje 85W-140",
    fr: "Huile de pont 85W-140",
    hr: "Ulje diferencijala 85W-140",
    it: "Olio ponte 85W-140",
    ja: "デフオイル 85W-140",
    nl: "Axoil 85W-140",
    pl: "Olej mostu 85W-140",
    tr: "Aks yagi 85W-140",
    zh: "车桥油 85W-140",
  }),
  buildCatalogItem(397, "oils_fluids", {
    ar: "زيت ناقل حركة اوتوماتيكي",
    de: "Automatikgetriebeoel",
    en: "Automatic transmission oil",
    es: "Aceite caja automatica",
    fr: "Huile de boîte automatique",
    hr: "Ulje automatskog mjenjaca",
    it: "Olio cambio automatico",
    ja: "オートマチックオイル",
    nl: "Automaatbakolie",
    pl: "Olej skrzyni automatycznej",
    tr: "Otomatik sanziman yagi",
    zh: "自动变速箱油",
  }),
  buildCatalogItem(398, "oils_fluids", {
    ar: "سائل الفرامل",
    de: "Bremsfluessigkeit",
    en: "Brake fluid",
    es: "Liquido de frenos",
    fr: "Liquide de frein",
    hr: "Kociona tekucina",
    it: "Liquido freni",
    ja: "ブレーキフルード",
    nl: "Remvloeistof",
    pl: "Plyn hamulcowy",
    tr: "Fren hidroliği",
    zh: "制动液",
  }),
  buildCatalogItem(399, "oils_fluids", {
    ar: "مانع التجمد",
    de: "Kuehlmittel",
    en: "Antifreeze",
    es: "Anticongelante",
    fr: "Antigel",
    hr: "Antifriz",
    it: "Antigelo",
    ja: "不凍液",
    nl: "Koelvloeistof",
    pl: "Plyn chlodniczy",
    tr: "Antifriz",
    zh: "防冻液",
  }),
  buildCatalogItem(400, "oils_fluids", {
    ar: "مانع تجمد احمر",
    de: "Rotes Kuehlmittel",
    en: "Red antifreeze",
    es: "Anticongelante rojo",
    fr: "Antigel rouge",
    hr: "Crveni antifriz",
    it: "Antigelo rosso",
    ja: "赤色不凍液",
    nl: "Rode koelvloeistof",
    pl: "Czerwony plyn chlodniczy",
    tr: "Kirmizi antifriz",
    zh: "红色防冻液",
  }),
  buildCatalogItem(401, "oils_fluids", {
    ar: "سائل تنظيف الزجاج",
    de: "Scheibenwaschfluessigkeit",
    en: "Washer fluid",
    es: "Liquido limpiaparabrisas",
    fr: "Liquide lave-glace",
    hr: "Tekucina za pranje stakla",
    it: "Liquido lavavetri",
    ja: "ウォッシャー液",
    nl: "Ruitensproeiervloeistof",
    pl: "Plyn do spryskiwaczy",
    tr: "Silecek cam suyu",
    zh: "玻璃水",
  }),
  // Additive / Verbrauchsmaterial
  buildCatalogItem(402, "additives_consumables", {
    ar: "مضاف بنزين",
    de: "Benzin-Additiv",
    en: "Gasoline additive",
    es: "Aditivo gasolina",
    fr: "Additif essence",
    hr: "Aditiv za benzin",
    it: "Additivo benzina",
    ja: "ガソリン添加剤",
    nl: "Benzine-additief",
    pl: "Dodatek do benzyny",
    tr: "Benzin katki",
    zh: "汽油添加剂",
  }),
  buildCatalogItem(403, "additives_consumables", {
    ar: "مضاف ديزل",
    de: "Diesel-Additiv",
    en: "Diesel additive",
    es: "Aditivo diesel",
    fr: "Additif diesel",
    hr: "Aditiv za dizel",
    it: "Additivo diesel",
    ja: "ディーゼル添加剤",
    nl: "Diesel-additief",
    pl: "Dodatek do diesla",
    tr: "Dizel katki",
    zh: "柴油添加剂",
  }),
  // Raeder & Reifen
  buildCatalogItem(516, "wheels_tyres", {
    ar: "تبديل العجلات",
    de: "Raederwechsel",
    en: "Wheel swap",
    es: "Cambio de ruedas",
    fr: "Changement de roues",
    hr: "Zamjena kotaca",
    it: "Cambio ruote",
    ja: "ホイール交換",
    nl: "Wielen wisselen",
    pl: "Wymiana kol",
    tr: "Tekerlek degisimi",
    zh: "更换车轮",
  }),
  buildCatalogItem(517, "wheels_tyres", {
    ar: "موازنة العجلات",
    de: "Radauswuchten",
    en: "Wheel balancing",
    es: "Equilibrado de ruedas",
    fr: "Équilibrage des roues",
    hr: "Balansiranje kotaca",
    it: "Bilanciamento ruote",
    ja: "ホイールバランス",
    nl: "Wielen balanceren",
    pl: "Wywazanie kol",
    tr: "Tekerlek balans",
    zh: "车轮平衡",
  }),
  buildCatalogItem(518, "wheels_tyres", {
    ar: "تبديل الاطارات شامل الموازنة",
    de: "Reifenwechsel inkl. Auswuchten",
    en: "Tire change incl. balancing",
    es: "Cambio de neumaticos incl. equilibrado",
    fr: "Changement de pneus avec équilibrage",
    hr: "Zamjena guma s balansiranjem",
    it: "Cambio pneumatici con bilanciamento",
    ja: "タイヤ交換（バランス含む）",
    nl: "Bandenwissel incl. balanceren",
    pl: "Wymiana opon z wywazeniem",
    tr: "Lastik degisimi dengeli",
    zh: "更换轮胎（含平衡）",
  }),
  buildCatalogItem(519, "wheels_tyres", {
    ar: "اصلاح الاطارات",
    de: "Reifenreparatur",
    en: "Tire repair",
    es: "Reparacion de neumaticos",
    fr: "Réparation de pneus",
    hr: "Popravak gume",
    it: "Riparazione pneumatici",
    ja: "タイヤ修理",
    nl: "Bandenreparatie",
    pl: "Naprawa opon",
    tr: "Lastik tamiri",
    zh: "轮胎修理",
  }),
  buildCatalogItem(520, "wheels_tyres", {
    ar: "صمام الاطار",
    de: "Reifenventil",
    en: "Tire valve",
    es: "Valvula de rueda",
    fr: "Valve de pneu",
    hr: "Ventil gume",
    it: "Valvola pneumatico",
    ja: "タイヤバルブ",
    nl: "Bandenventiel",
    pl: "Zawor opony",
    tr: "Lastik supabi",
    zh: "轮胎气门",
  }),
  buildCatalogItem(612, "wheels_tyres", {
    ar: "اطارات صيفية",
    de: "Sommerreifen",
    en: "Summer tires",
    es: "Neumaticos de verano",
    fr: "Pneus d'ete",
    hr: "Ljetne gume",
    it: "Pneumatici estivi",
    ja: "夏タイヤ",
    nl: "Zomerbanden",
    pl: "Opony letnie",
    tr: "Yaz lastikleri",
    zh: "夏季轮胎",
  }),
  buildCatalogItem(613, "wheels_tyres", {
    ar: "اطارات شتوية",
    de: "Winterreifen",
    en: "Winter tires",
    es: "Neumaticos de invierno",
    fr: "Pneus d'hiver",
    hr: "Zimske gume",
    it: "Pneumatici invernali",
    ja: "冬タイヤ",
    nl: "Winterbanden",
    pl: "Opony zimowe",
    tr: "Kis lastikleri",
    zh: "冬季轮胎",
  }),
  buildCatalogItem(520, "wheels_tyres", {
    ar: "جنوط فولاذية",
    de: "Stahlfelgen",
    en: "Steel rims",
    es: "Llantas de acero",
    fr: "Jantes en acier",
    hr: "Celicne felge",
    it: "Cerchi in acciaio",
    ja: "スチールホイール",
    nl: "Stalen velgen",
    pl: "Felgi stalowe",
    tr: "Celik jant",
    zh: "钢轮圈",
  }),
  buildCatalogItem(521, "wheels_tyres", {
    ar: "جنوط الومنيوم",
    de: "Alufelgen",
    en: "Alloy rims",
    es: "Llantas de aluminio",
    fr: "Jantes en alliage",
    hr: "Aluminijske felge",
    it: "Cerchi in lega",
    ja: "アルミホイール",
    nl: "Lichtmetalen velgen",
    pl: "Felgi aluminiowe",
    tr: "Alyans jant",
    zh: "合金轮圈",
  }),
  buildCatalogItem(522, "wheels_tyres", {
    ar: "عجلة كاملة",
    de: "Komplettrad",
    en: "Complete wheel",
    es: "Rueda completa",
    fr: "Roue complete",
    hr: "Kompletan kotac",
    it: "Ruota completa",
    ja: "ホイール一式",
    nl: "Complete wiel",
    pl: "Kompletne kolo",
    tr: "Komple tekerlek",
    zh: "完整车轮",
  }),
  buildCatalogItem(630, "wheels_tyres", {
    ar: "تخزين العجلات",
    de: "Raedereinlagerung",
    en: "Wheel storage",
    es: "Almacenaje de ruedas",
    fr: "Stockage des roues",
    hr: "Skladistenje kotaca",
    it: "Deposito ruote",
    ja: "ホイール保管",
    nl: "Wielopslag",
    pl: "Przechowywanie kol",
    tr: "Tekerlek depolama",
    zh: "轮胎存放",
  }),
  // Filter & Zuendung
  buildCatalogItem(701, "filters_ignition", {
    ar: "فلتر زيت",
    de: "Oelfilter",
    en: "Oil filter",
    es: "Filtro de aceite",
    fr: "Filtre a huile",
    hr: "Filter ulja",
    it: "Filtro olio",
    ja: "オイルフィルター",
    nl: "Oliefilter",
    pl: "Filtr oleju",
    tr: "Yag filtresi",
    zh: "机油滤清器",
  }),
  buildCatalogItem(702, "filters_ignition", {
    ar: "فلتر هواء",
    de: "Luftfilter",
    en: "Air filter",
    es: "Filtro de aire",
    fr: "Filtre a air",
    hr: "Filter zraka",
    it: "Filtro aria",
    ja: "エアフィルター",
    nl: "Luchtfilter",
    pl: "Filtr powietrza",
    tr: "Hava filtresi",
    zh: "空气滤清器",
  }),
  buildCatalogItem(703, "filters_ignition", {
    ar: "فلتر وقود (بنزين)",
    de: "Kraftstofffilter (Benzin)",
    en: "Fuel filter (gasoline)",
    es: "Filtro de gasolina",
    fr: "Filtre a carburant (essence)",
    hr: "Filter goriva (benzin)",
    it: "Filtro carburante (benzina)",
    ja: "燃料フィルター（ガソリン）",
    nl: "Brandstoffilter (benzine)",
    pl: "Filtr paliwa (benzyna)",
    tr: "Yakit filtresi (benzin)",
    zh: "燃油滤清器（汽油）",
  }),
  buildCatalogItem(704, "filters_ignition", {
    ar: "فلتر وقود (ديزل)",
    de: "Kraftstofffilter (Diesel)",
    en: "Fuel filter (diesel)",
    es: "Filtro diesel",
    fr: "Filtre a carburant (diesel)",
    hr: "Filter goriva (dizel)",
    it: "Filtro carburante (diesel)",
    ja: "燃料フィルター（ディーゼル）",
    nl: "Brandstoffilter (diesel)",
    pl: "Filtr paliwa (diesel)",
    tr: "Yakit filtresi (dizel)",
    zh: "燃油滤清器（柴油）",
  }),
  buildCatalogItem(705, "filters_ignition", {
    ar: "فلتر مقصورة",
    de: "Innenraumfilter",
    en: "Cabin filter",
    es: "Filtro de habitaculo",
    fr: "Filtre d'habitacle",
    hr: "Filter kabine",
    it: "Filtro abitacolo",
    ja: "キャビンフィルター",
    nl: "Interieurfilter",
    pl: "Filtr kabinowy",
    tr: "Kabin filtresi",
    zh: "空调滤清器",
  }),
  buildCatalogItem(706, "filters_ignition", {
    ar: "شمعات الاشعال",
    de: "Zuendkerzen",
    en: "Spark plugs",
    es: "Bujias",
    fr: "Bougies d'allumage",
    hr: "Svjecice",
    it: "Candele",
    ja: "スパークプラグ",
    nl: "Bougies",
    pl: "Swiece zaplonowe",
    tr: "Bujiler",
    zh: "火花塞",
  }),
  buildCatalogItem(707, "filters_ignition", {
    ar: "غطاء الصمامات",
    de: "Ventildeckel",
    en: "Valve cover",
    es: "Tapa de balancines",
    fr: "Couvercle de soupapes",
    hr: "Poklopac ventila",
    it: "Coperchio valvole",
    ja: "バルブカバー",
    nl: "Kleppendeksel",
    pl: "Pokrywa zaworow",
    tr: "Supap kapagi",
    zh: "气门室盖",
  }),
  // Bremsanlage
  buildCatalogItem(710, "brakes", {
    ar: "بطانات فرامل امامية",
    de: "Bremsbelaege vorne",
    en: "Front brake pads",
    es: "Pastillas freno delanteras",
    fr: "Plaquettes de frein avant",
    hr: "Prednje kocione plocice",
    it: "Pastiglie freno anteriori",
    ja: "フロントブレーキパッド",
    nl: "Voorremblokken",
    pl: "Klocki hamulcowe przednie",
    tr: "On fren balatalari",
    zh: "前制动片",
  }),
  buildCatalogItem(711, "brakes", {
    ar: "بطانات فرامل خلفية",
    de: "Bremsbelaege hinten",
    en: "Rear brake pads",
    es: "Pastillas freno traseras",
    fr: "Plaquettes de frein arriere",
    hr: "Straznje kocione plocice",
    it: "Pastiglie freno posteriori",
    ja: "リアブレーキパッド",
    nl: "Achterremblokken",
    pl: "Klocki hamulcowe tylne",
    tr: "Arka fren balatalari",
    zh: "后制动片",
  }),
  buildCatalogItem(712, "brakes", {
    ar: "اقراص فرامل امامية",
    de: "Bremsscheiben vorne",
    en: "Front brake discs",
    es: "Discos freno delanteros",
    fr: "Disques de frein avant",
    hr: "Prednji kocioni diskovi",
    it: "Dischi freno anteriori",
    ja: "フロントブレーキディスク",
    nl: "Voorremsschijven",
    pl: "Tarcze hamulcowe przednie",
    tr: "On fren diskleri",
    zh: "前制动盘",
  }),
  buildCatalogItem(713, "brakes", {
    ar: "اقراص فرامل خلفية",
    de: "Bremsscheiben hinten",
    en: "Rear brake discs",
    es: "Discos freno traseros",
    fr: "Disques de frein arriere",
    hr: "Straznji kocioni diskovi",
    it: "Dischi freno posteriori",
    ja: "リアブレーキディスク",
    nl: "Achterremsschijven",
    pl: "Tarcze hamulcowe tylne",
    tr: "Arka fren diskleri",
    zh: "后制动盘",
  }),
  buildCatalogItem(714, "brakes", {
    ar: "احذية فرامل",
    de: "Bremsbacken",
    en: "Brake shoes",
    es: "Zapatas de freno",
    fr: "Machoires de frein",
    hr: "Kocione papuce",
    it: "Ganasce freno",
    ja: "ブレーキシュー",
    nl: "Remschoenen",
    pl: "Szczeki hamulcowe",
    tr: "Fren pabuclari",
    zh: "制动蹄",
  }),
  buildCatalogItem(715, "brakes", {
    ar: "احذية فرامل يد",
    de: "Handbremsbacken",
    en: "Parking brake shoes",
    es: "Zapatas freno de mano",
    fr: "Machoires de frein a main",
    hr: "Papuce rucne kocnice",
    it: "Ganasce freno a mano",
    ja: "パーキングブレーキシュー",
    nl: "Handremschoenen",
    pl: "Szczeki hamulca postojowego",
    tr: "El freni pabuclari",
    zh: "手刹制动蹄",
  }),
  buildCatalogItem(716, "brakes", {
    ar: "اسطوانة فرامل العجلة",
    de: "Radbremszylinder",
    en: "Wheel brake cylinder",
    es: "Cilindro de freno de rueda",
    fr: "Cylindre de roue",
    hr: "Kocioni cilindar kotaca",
    it: "Cilindro ruota",
    ja: "ホイールブレーキシリンダー",
    nl: "Wielremcilinder",
    pl: "Cylinder hamulcowy kola",
    tr: "Tekerlek fren silindiri",
    zh: "车轮制动缸",
  }),
  buildCatalogItem(717, "brakes", {
    ar: "اسطوانة الفرامل الرئيسية",
    de: "Hauptbremszylinder",
    en: "Brake master cylinder",
    es: "Cilindro maestro de freno",
    fr: "Maitre-cylindre",
    hr: "Glavni kocioni cilindar",
    it: "Cilindro maestro freni",
    ja: "マスターブレーキシリンダー",
    nl: "Hoofdremcilinder",
    pl: "Glowny cylinder hamulcowy",
    tr: "Ana fren silindiri",
    zh: "主制动缸",
  }),
  buildCatalogItem(718, "brakes", {
    ar: "طبلة فرامل",
    de: "Bremstrommel",
    en: "Brake drum",
    es: "Tambor de freno",
    fr: "Tambour de frein",
    hr: "Kocioni bubanj",
    it: "Tamburo freno",
    ja: "ブレーキドラム",
    nl: "Remtrommel",
    pl: "Bebny hamulcowe",
    tr: "Fren tamburu",
    zh: "制动鼓",
  }),
  buildCatalogItem(719, "brakes", {
    ar: "مكبس الفرامل",
    de: "Bremssattel",
    en: "Brake caliper",
    es: "Pinza de freno",
    fr: "Etrier de frein",
    hr: "Kociona klijesta",
    it: "Pinza freno",
    ja: "ブレーキキャリパー",
    nl: "Remklauw",
    pl: "Zacisk hamulcowy",
    tr: "Fren kaliperi",
    zh: "制动卡钳",
  }),
  // Motor & Antrieb
  buildCatalogItem(720, "engine_drive", {
    ar: "طقم القابض",
    de: "Kupplungssatz",
    en: "Clutch kit",
    es: "Kit de embrague",
    fr: "Kit d'embrayage",
    hr: "Komplet kvacila",
    it: "Kit frizione",
    ja: "クラッチキット",
    nl: "Koppelingsset",
    pl: "Zestaw sprzegla",
    tr: "Debriyaj seti",
    zh: "离合器套件",
  }),
  buildCatalogItem(721, "engine_drive", {
    ar: "قرص القابض",
    de: "Kupplungsscheibe",
    en: "Clutch disc",
    es: "Disco de embrague",
    fr: "Disque d'embrayage",
    hr: "Lamelna spojka",
    it: "Disco frizione",
    ja: "クラッチディスク",
    nl: "Koppelingsplaat",
    pl: "Tarcza sprzegla",
    tr: "Debriyaj diski",
    zh: "离合器片",
  }),
  buildCatalogItem(722, "engine_drive", {
    ar: "صفيحة الضغط",
    de: "Druckplatte",
    en: "Pressure plate",
    es: "Plato de presion",
    fr: "Mecanisme d'embrayage",
    hr: "Pritisna ploca",
    it: "Spingidisco",
    ja: "プレッシャープレート",
    nl: "Drukgroep",
    pl: "Docisk sprzegla",
    tr: "Baski plakasi",
    zh: "压盘",
  }),
  buildCatalogItem(723, "engine_drive", {
    ar: "رولمان الدفع",
    de: "Ausruecklager",
    en: "Release bearing",
    es: "Cojinete de empuje",
    fr: "Butée d'embrayage",
    hr: "Potisni lezaj",
    it: "Cuscinetto reggispinta",
    ja: "レリーズベアリング",
    nl: "Druklager",
    pl: "Lozysko oporowe",
    tr: "Baski rulmani",
    zh: "分离轴承",
  }),
  buildCatalogItem(730, "engine_drive", {
    ar: "طقم سير التوقيت",
    de: "Zahnriemensatz",
    en: "Timing belt kit",
    es: "Kit correa de distribucion",
    fr: "Kit de courroie de distribution",
    hr: "Komplet zupcastog remena",
    it: "Kit cinghia distribuzione",
    ja: "タイミングベルトキット",
    nl: "Distributieriemset",
    pl: "Zestaw paska rozrzadu",
    tr: "Triger kayisi seti",
    zh: "正时皮带套件",
  }),
  buildCatalogItem(731, "engine_drive", {
    ar: "سير التوقيت",
    de: "Zahnriemen",
    en: "Timing belt",
    es: "Correa de distribucion",
    fr: "Courroie de distribution",
    hr: "Zupcasti remen",
    it: "Cinghia distribuzione",
    ja: "タイミングベルト",
    nl: "Distributieriem",
    pl: "Pasek rozrzadu",
    tr: "Triger kayisi",
    zh: "正时皮带",
  }),
  buildCatalogItem(732, "engine_drive", {
    ar: "شداد سير التوقيت",
    de: "Zahnriemenspanner",
    en: "Timing belt tensioner",
    es: "Tensor distribucion",
    fr: "Tendeur de courroie de distribution",
    hr: "Zatezac zupcastog remena",
    it: "Tendicinghia distribuzione",
    ja: "タイミングベルトテンショナー",
    nl: "Distributieriemspanner",
    pl: "Napinacz paska rozrzadu",
    tr: "Triger kayisi gergisi",
    zh: "正时皮带张紧器",
  }),
  buildCatalogItem(733, "engine_drive", {
    ar: "بكرة توجيه",
    de: "Umlenkrolle",
    en: "Guide roller",
    es: "Rodillo guia",
    fr: "Galet guide",
    hr: "Vodilica",
    it: "Rullo guida",
    ja: "ガイドローラー",
    nl: "Geleiderol",
    pl: "Rolka prowadzaca",
    tr: "Yonlendirme rulmani",
    zh: "导向轮",
  }),
  buildCatalogItem(734, "engine_drive", {
    ar: "سير ملحقات",
    de: "Keilrippenriemen",
    en: "Accessory belt",
    es: "Correa AGW",
    fr: "Courroie d'accessoires",
    hr: "Remen pomocnih agregata",
    it: "Cinghia servizi",
    ja: "補機ベルト",
    nl: "Multiriem",
    pl: "Pasek osprzetu",
    tr: "Aksesuar kayisi",
    zh: "附件皮带",
  }),
  buildCatalogItem(735, "engine_drive", {
    ar: "شداد سير الملحقات",
    de: "Keilrippenriemenspanner",
    en: "Accessory belt tensioner",
    es: "Tensor AGW",
    fr: "Tendeur de courroie d'accessoires",
    hr: "Zatezac remena pomocnih agregata",
    it: "Tendicinghia servizi",
    ja: "補機ベルトテンショナー",
    nl: "Multiriemspanner",
    pl: "Napinacz paska osprzetu",
    tr: "Aksesuar kayisi gergisi",
    zh: "附件皮带张紧器",
  }),
  buildCatalogItem(736, "engine_drive", {
    ar: "رولمان سير الملحقات",
    de: "Keilrippenriemenlager",
    en: "Accessory belt bearing",
    es: "Rodamiento AGW",
    fr: "Roulement de courroie d'accessoires",
    hr: "Lezaj remena pomocnih agregata",
    it: "Cuscinetto cinghia servizi",
    ja: "補機ベルトベアリング",
    nl: "Multiriemlager",
    pl: "Lozysko paska osprzetu",
    tr: "Aksesuar kayisi rulmani",
    zh: "附件皮带轴承",
  }),
  buildCatalogItem(740, "engine_drive", {
    ar: "مضخة مياه",
    de: "Wasserpumpe",
    en: "Water pump",
    es: "Bomba de agua",
    fr: "Pompe a eau",
    hr: "Vodena pumpa",
    it: "Pompa acqua",
    ja: "ウォーターポンプ",
    nl: "Waterpomp",
    pl: "Pompa wody",
    tr: "Su pompasi",
    zh: "水泵",
  }),
  buildCatalogItem(741, "engine_drive", {
    ar: "منظم حرارة",
    de: "Thermostat",
    en: "Thermostat",
    es: "Termostato",
    fr: "Thermostat",
    hr: "Termostat",
    it: "Termostato",
    ja: "サーモスタット",
    nl: "Thermostaat",
    pl: "Termostat",
    tr: "Termostat",
    zh: "节温器",
  }),
  buildCatalogItem(744, "engine_drive", {
    ar: "سير V",
    de: "Keilriemen",
    en: "V-belt",
    es: "Correa trapezoidal",
    fr: "Courroie trapezoidale",
    hr: "Klinasti remen",
    it: "Cinghia trapezoidale",
    ja: "Vベルト",
    nl: "V-snaar",
    pl: "Pasek klinowy",
    tr: "V kayisi",
    zh: "V形皮带",
  }),
  buildCatalogItem(745, "engine_drive", {
    ar: "سير متعدد الحواف",
    de: "Keilrippenriemen",
    en: "Poly-V belt",
    es: "Correa Poly-V",
    fr: "Courroie poly-V",
    hr: "ViseZljebni remen",
    it: "Cinghia Poly-V",
    ja: "ポリVベルト",
    nl: "Multiriem",
    pl: "Pasek wielorowkowy",
    tr: "Poly-V kayisi",
    zh: "多楔带",
  }),
  // Elektrik & Elektronik
  buildCatalogItem(760, "electrical", {
    ar: "لمبة H4",
    de: "H4-Lampe",
    en: "H4 bulb",
    es: "Bombilla H4",
    fr: "Ampoule H4",
    hr: "Zarulja H4",
    it: "Lampadina H4",
    ja: "H4バルブ",
    nl: "H4-lamp",
    pl: "Zarowka H4",
    tr: "H4 ampul",
    zh: "H4灯泡",
  }),
  buildCatalogItem(761, "electrical", {
    ar: "لمبة H1",
    de: "H1-Lampe",
    en: "H1 bulb",
    es: "Bombilla H1",
    fr: "Ampoule H1",
    hr: "Zarulja H1",
    it: "Lampadina H1",
    ja: "H1バルブ",
    nl: "H1-lamp",
    pl: "Zarowka H1",
    tr: "H1 ampul",
    zh: "H1灯泡",
  }),
  buildCatalogItem(762, "electrical", {
    ar: "لمبة H7",
    de: "H7-Lampe",
    en: "H7 bulb",
    es: "Bombilla H7",
    fr: "Ampoule H7",
    hr: "Zarulja H7",
    it: "Lampadina H7",
    ja: "H7バルブ",
    nl: "H7-lamp",
    pl: "Zarowka H7",
    tr: "H7 ampul",
    zh: "H7灯泡",
  }),
  buildCatalogItem(763, "electrical", {
    ar: "لمبة 21W",
    de: "21W-Lampe",
    en: "21W bulb",
    es: "Bombilla 21W",
    fr: "Ampoule 21W",
    hr: "Zarulja 21W",
    it: "Lampadina 21W",
    ja: "21Wバルブ",
    nl: "21W-lamp",
    pl: "Zarowka 21W",
    tr: "21W ampul",
    zh: "21W灯泡",
  }),
  buildCatalogItem(764, "electrical", {
    ar: "لمبة 21/5W",
    de: "21/5W-Lampe",
    en: "21/5W bulb",
    es: "Bombilla 21/5W",
    fr: "Ampoule 21/5W",
    hr: "Zarulja 21/5W",
    it: "Lampadina 21/5W",
    ja: "21/5Wバルブ",
    nl: "21/5W-lamp",
    pl: "Zarowka 21/5W",
    tr: "21/5W ampul",
    zh: "21/5W灯泡",
  }),
  buildCatalogItem(780, "electrical", {
    ar: "طقم اسلاك الاشعال",
    de: "Zuendkabelsatz",
    en: "Ignition cable set",
    es: "Juego cables de encendido",
    fr: "Jeu de cables d'allumage",
    hr: "Set kablova paljenja",
    it: "Set cavi accensione",
    ja: "点火ケーブルセット",
    nl: "Ontstekingskabelset",
    pl: "Zestaw przewodow zaplonowych",
    tr: "Atesleme kablo seti",
    zh: "点火线套件",
  }),
  buildCatalogItem(781, "electrical", {
    ar: "سلك الاشعال",
    de: "Zuendkabel",
    en: "Ignition cable",
    es: "Cable de encendido",
    fr: "Cable d'allumage",
    hr: "Kabel paljenja",
    it: "Cavo accensione",
    ja: "点火ケーブル",
    nl: "Ontstekingskabel",
    pl: "Przewod zaplonowy",
    tr: "Atesleme kablosu",
    zh: "点火线",
  }),
  buildCatalogItem(782, "electrical", {
    ar: "غطاء الموزع",
    de: "Verteilerkappe",
    en: "Distributor cap",
    es: "Tapa distribuidor",
    fr: "Tete d'allumeur",
    hr: "Poklopac razvodnika",
    it: "Calotta distributore",
    ja: "ディストリビューターキャップ",
    nl: "Verdelerkap",
    pl: "Kopulka rozdzielacza",
    tr: "Distributor kapagı",
    zh: "分电器盖",
  }),
  buildCatalogItem(783, "electrical", {
    ar: "دوار الموزع",
    de: "Verteilerlaeufer",
    en: "Distributor rotor",
    es: "Rotor distribuidor",
    fr: "Rotor d'allumeur",
    hr: "Rotor razvodnika",
    it: "Rotore distributore",
    ja: "ディストリビューターローター",
    nl: "Verdelerrotor",
    pl: "Palec rozdzielacza",
    tr: "Distributor rotoru",
    zh: "分电器转子",
  }),
  buildCatalogItem(784, "electrical", {
    ar: "ملف الاشعال",
    de: "Zuendspule",
    en: "Ignition coil",
    es: "Bobina encendido",
    fr: "Bobine d'allumage",
    hr: "Zavojnica paljenja",
    it: "Bobina accensione",
    ja: "イグニッションコイル",
    nl: "Bobine",
    pl: "Cewka zaplonowa",
    tr: "Atesleme bobini",
    zh: "点火线圈",
  }),
  buildCatalogItem(790, "electrical", {
    ar: "بطارية",
    de: "Batterie",
    en: "Battery",
    es: "Bateria",
    fr: "Batterie",
    hr: "Baterija",
    it: "Batteria",
    ja: "バッテリー",
    nl: "Accu",
    pl: "Akumulator",
    tr: "Akü",
    zh: "电池",
  }),
  buildCatalogItem(793, "electrical", {
    ar: "محرك بادئ",
    de: "Anlasser",
    en: "Starter motor",
    es: "Motor de arranque",
    fr: "Demarreur",
    hr: "Anlaser",
    it: "Motorino di avviamento",
    ja: "スターターモーター",
    nl: "Startmotor",
    pl: "Rozrusznik",
    tr: "Mars motoru",
    zh: "起动机",
  }),
  buildCatalogItem(794, "electrical", {
    ar: "مرحل بادئ",
    de: "Anlasserrelais",
    en: "Starter relay",
    es: "Rele de arranque",
    fr: "Relais de demarreur",
    hr: "Relej anlasera",
    it: "Relè avviamento",
    ja: "スターターリレー",
    nl: "Startrelais",
    pl: "Przekaznik rozrusznika",
    tr: "Mars rolesi",
    zh: "起动继电器",
  }),
  buildCatalogItem(795, "electrical", {
    ar: "مولد كهرباء",
    de: "Lichtmaschine",
    en: "Alternator",
    es: "Alternador",
    fr: "Alternateur",
    hr: "Alternator",
    it: "Alternatore",
    ja: "オルタネーター",
    nl: "Dynamo",
    pl: "Alternator",
    tr: "Alternator",
    zh: "发电机",
  }),
  buildCatalogItem(796, "electrical", {
    ar: "منظم المولد",
    de: "Lichtmaschinenregler",
    en: "Alternator regulator",
    es: "Regulador alternador",
    fr: "Regulateur d'alternateur",
    hr: "Regulator alternatora",
    it: "Regolatore alternatore",
    ja: "オルタネーターレギュレーター",
    nl: "Dynamoregelaar",
    pl: "Regulator alternatora",
    tr: "Alternator regülatörü",
    zh: "发电机调节器",
  }),
  // Abgasanlage
  buildCatalogItem(801, "exhaust", {
    ar: "مشبك العادم",
    de: "Auspuffschelle",
    en: "Exhaust clamp",
    es: "Abrazadera de escape",
    fr: "Collier d'echappement",
    hr: "Stega ispuha",
    it: "Fascetta scarico",
    ja: "排気クランプ",
    nl: "Uitlaatklem",
    pl: "Opaska wydechu",
    tr: "Egzoz kelepcesi",
    zh: "排气夹",
  }),
  buildCatalogItem(802, "exhaust", {
    ar: "كاتم صوت",
    de: "Schalldaempfer",
    en: "Muffler",
    es: "Silenciador",
    fr: "Silencieux",
    hr: "Prigusivac",
    it: "Silenziatore",
    ja: "マフラー",
    nl: "Demper",
    pl: "Tlumik",
    tr: "Susturucu",
    zh: "消音器",
  }),
  buildCatalogItem(804, "exhaust", {
    ar: "حامل مطاطي للعادم",
    de: "Auspuffgummi",
    en: "Exhaust rubber mount",
    es: "Goma de escape",
    fr: "Support en caoutchouc d'echappement",
    hr: "Gumeni nosac ispuha",
    it: "Supporto gomma scarico",
    ja: "排気ゴムマウント",
    nl: "Uitlaatrubber",
    pl: "Guma wydechu",
    tr: "Egzoz lastigi",
    zh: "排气橡胶吊耳",
  }),
  // Schlaeuche & Befestigung
  buildCatalogItem(810, "hoses_fixings", {
    ar: "مشبك خرطوم صغير",
    de: "Schlauchschelle klein",
    en: "Small hose clamp",
    es: "Abrazadera manguera pequena",
    fr: "Collier de durite petit",
    hr: "Mala stega crijeva",
    it: "Fascetta tubo piccola",
    ja: "小型ホースクランプ",
    nl: "Kleine slangklem",
    pl: "Mala opaska weza",
    tr: "Kucuk hortum kelepcesi",
    zh: "小号软管卡箍",
  }),
  buildCatalogItem(811, "hoses_fixings", {
    ar: "مشبك خرطوم كبير",
    de: "Schlauchschelle gross",
    en: "Large hose clamp",
    es: "Abrazadera manguera grande",
    fr: "Collier de durite grand",
    hr: "Velika stega crijeva",
    it: "Fascetta tubo grande",
    ja: "大型ホースクランプ",
    nl: "Grote slangklem",
    pl: "Duza opaska weza",
    tr: "Buyuk hortum kelepcesi",
    zh: "大号软管卡箍",
  }),
  buildCatalogItem(901, "hoses_fixings", {
    ar: "جلدة عمود نقل الحركة العامة",
    de: "Universal-Antriebswellenmanschette",
    en: "Universal driveshaft boot",
    es: "Fuelle de transmision universal",
    fr: "Soufflet de transmission universel",
    hr: "Univerzalna manzetna poluosovine",
    it: "Cuffia semiasse universale",
    ja: "ユニバーサルドライブシャフトブーツ",
    nl: "Universele aandrijfasmanchet",
    pl: "Uniwersalna oslona przegubu",
    tr: "Universal aks korugu",
    zh: "通用传动轴防尘套",
  }),
  // Zusatzleistungen
  buildCatalogItem(128, "extras", {
    ar: "سحب المركبة",
    de: "Fahrzeugabschleppen",
    en: "Vehicle towing",
    es: "Remolque del vehiculo",
    fr: "Remorquage du vehicule",
    hr: "Slepanje vozila",
    it: "Traino del veicolo",
    ja: "車両牽引",
    nl: "Voertuig slepen",
    pl: "Holowanie pojazdu",
    tr: "Arac cekme",
    zh: "车辆拖车",
  }),
  buildCatalogItem(408, "extras", {
    ar: "ملصق طريق",
    de: "Vignette",
    en: "Vignette",
    es: "Vineta",
    fr: "Vignette",
    hr: "Vinjeta",
    it: "Vignetta",
    ja: "ビネット",
    nl: "Vignet",
    pl: "Winieta",
    tr: "Vinyet",
    zh: "通行贴",
  }),
  buildCatalogItem(990, "extras", {
    ar: "سيارة بديلة",
    de: "Ersatzfahrzeug",
    en: "Replacement vehicle",
    es: "Vehiculo de sustitucion",
    fr: "Vehicule de remplacement",
    hr: "Zamjensko vozilo",
    it: "Veicolo sostitutivo",
    ja: "代車",
    nl: "Vervangend voertuig",
    pl: "Pojazd zastepczy",
    tr: "Ikame arac",
    zh: "代用车",
  }),
  buildCatalogItem(995, "extras", {
    ar: "وقود بنزين 98",
    de: "Kraftstoff Benzin 98",
    en: "Gasoline 98 fuel",
    es: "Combustible gasolina 98",
    fr: "Carburant essence 98",
    hr: "Gorivo benzin 98",
    it: "Carburante benzina 98",
    ja: "ガソリン98",
    nl: "Benzine 98 brandstof",
    pl: "Paliwo benzyna 98",
    tr: "Benzin 98 yakit",
    zh: "98号汽油",
  }),
  buildCatalogItem(996, "extras", {
    ar: "وقود ديزل",
    de: "Dieselkraftstoff",
    en: "Diesel fuel",
    es: "Combustible diesel",
    fr: "Carburant diesel",
    hr: "Dizel gorivo",
    it: "Carburante diesel",
    ja: "ディーゼル燃料",
    nl: "Dieselbrandstof",
    pl: "Paliwo diesel",
    tr: "Dizel yakit",
    zh: "柴油",
  }),
];

async function ensureTaxonomyNodes(nodes: TaxonomySeed[]) {
  const nodeMap = new Map<string, string>();

  for (const node of nodes) {
    const parentId = node.parentKey ? nodeMap.get(node.parentKey) : undefined;
    const record = await prisma.taxonomyNode.upsert({
      where: { key: node.key },
      update: {
        name: node.name,
        kind: node.kind,
        parentId: parentId ?? null,
      },
      create: {
        key: node.key,
        name: node.name,
        kind: node.kind,
        parentId: parentId ?? null,
      },
    });

    nodeMap.set(node.key, record.id);
  }

  return nodeMap;
}

async function upsertTaxonomyTranslations(
  nodeId: string,
  translations: Partial<Record<Locale, string>>
) {
  const entries = Object.entries(translations) as [Locale, string][];
  for (const [locale, name] of entries) {
    await prisma.taxonomyNodeTranslation.upsert({
      where: { taxonomyNodeId_locale: { taxonomyNodeId: nodeId, locale } },
      update: { name },
      create: { taxonomyNodeId: nodeId, locale, name },
    });
  }
}

async function upsertCatalogItemTranslations(
  itemId: string,
  translations: Partial<Record<Locale, { name: string }>>
) {
  const entries = Object.entries(translations) as [
    Locale,
    { name: string }
  ][];
  for (const [locale, payload] of entries) {
    await prisma.workCatalogItemTranslation.upsert({
      where: { itemId_locale: { itemId, locale } },
      update: { name: payload.name },
      create: { itemId, locale, name: payload.name },
    });
  }
}

async function main() {
  const makesDataset =
    (await readJson<MakeRecord[]>("vehicles/brands.json")) ?? [];

  const makeRecords: MakeRecord[] = makesDataset.length
    ? makesDataset
    : [{ key: "seat", name: "Seat" }];

  const makes = [] as { id: string; key: string }[];

  for (const make of makeRecords) {
    const key = normalizeKey(make.key ?? make.id ?? make.name);
    const record = await prisma.vehicleMake.upsert({
      where: { key },
      update: { name: make.name },
      create: { key, name: make.name },
    });
    makes.push({ id: record.id, key: record.key });
  }

  const models = [] as { id: string; key: string }[];

  for (const make of makes) {
    const modelsDataset = await readJson<ModelRecord[]>(
      `vehicles/models/${make.key}.json`
    );
    const modelRecords = modelsDataset?.length
      ? modelsDataset
      : make.key === "seat"
        ? [{ key: "ibiza", name: "Ibiza" }]
        : [];

    for (const model of modelRecords) {
      const modelKey = normalizeKey(model.key ?? model.id ?? model.name);
      const record = await prisma.vehicleModel.upsert({
        where: { key: modelKey },
        update: { name: model.name, makeId: make.id },
        create: { key: modelKey, name: model.name, makeId: make.id },
      });
      models.push({ id: record.id, key: record.key });
    }
  }

  const ibiza = models.find((model) => model.key === "ibiza");
  if (ibiza) {
    await prisma.vehicleVariant.upsert({
      where: { key: "ibiza-1-2-2012" },
      update: {
        name: "1.2 2012",
        modelId: ibiza.id,
        yearFrom: 2012,
        yearTo: 2015,
        engine: "1.2 MPI",
        fuel: "gasoline",
        powerKw: 51,
      },
      create: {
        key: "ibiza-1-2-2012",
        name: "1.2 2012",
        modelId: ibiza.id,
        yearFrom: 2012,
        yearTo: 2015,
        engine: "1.2 MPI",
        fuel: "gasoline",
        powerKw: 51,
      },
    });
  }

  const taxonomySeeds: TaxonomySeed[] = [
    { key: "mechanics", name: "Mechanics", kind: TaxonomyKind.SERVICE },
    {
      key: "engine-service",
      name: "Engine Service",
      kind: TaxonomyKind.SERVICE,
      parentKey: "mechanics",
    },
    {
      key: "brakes",
      name: "Brakes",
      kind: TaxonomyKind.SERVICE,
      parentKey: "mechanics",
    },
    { key: "bodywork", name: "Bodywork", kind: TaxonomyKind.SERVICE },
    {
      key: "electronics",
      name: "Electronics",
      kind: TaxonomyKind.VEHICLE_SYSTEM,
    },
    { key: "parts", name: "Parts", kind: TaxonomyKind.PARTS },
    {
      key: "brake-system",
      name: "Brake System",
      kind: TaxonomyKind.PARTS,
      parentKey: "parts",
    },
    {
      key: "filters",
      name: "Filters",
      kind: TaxonomyKind.PARTS,
      parentKey: "parts",
    },
  ];

  const taxonomyMap = await ensureTaxonomyNodes(taxonomySeeds);

  const catalogSeeds: TaxonomySeed[] = catalogCategories.map((category) => ({
    key: category.key,
    name: category.name,
    kind: category.kind,
    parentKey: category.parentKey,
  }));

  const catalogMap = await ensureTaxonomyNodes(catalogSeeds);

  for (const category of catalogCategories) {
    const nodeId = catalogMap.get(category.key);
    if (!nodeId) continue;
    await upsertTaxonomyTranslations(nodeId, category.translations);
  }

  for (const item of workshopCatalogItems) {
    const categoryId = catalogMap.get(item.categoryKey);
    if (!categoryId) continue;

    const meta = buildCatalogMeta(item.name, item.code);
    const record = await prisma.workCatalogItem.upsert({
      where: { key: item.key },
      update: {
        code: item.code,
        name: item.name,
        kind: item.kind,
        categoryId,
        aliases: meta.aliases,
        keywords: meta.keywords,
      },
      create: {
        code: item.code,
        key: item.key,
        name: item.name,
        kind: item.kind,
        categoryId,
        aliases: meta.aliases,
        keywords: meta.keywords,
      },
    });

    await upsertCatalogItemTranslations(record.id, item.translations);
  }

  const operations: OperationSeed[] = [
    {
      key: "oil-change",
      name: "Oil change",
      skillKey: "mechanics",
      taxonomyKey: "engine-service",
      estimatedMinutes: 60,
      source: "seed",
    },
    {
      key: "brake-pad-replacement",
      name: "Brake pad replacement",
      skillKey: "mechanics",
      taxonomyKey: "brakes",
      estimatedMinutes: 90,
      source: "seed",
    },
  ];

  for (const op of operations) {
    const taxonomyNodeId = op.taxonomyKey
      ? taxonomyMap.get(op.taxonomyKey)
      : undefined;

    const record = await prisma.serviceOperation.upsert({
      where: { key: op.key },
      update: {
        name: op.name,
        skillKey: op.skillKey,
        taxonomyNodeId: taxonomyNodeId ?? null,
        estimatedMinutes: op.estimatedMinutes,
        source: op.source,
      },
      create: {
        key: op.key,
        name: op.name,
        skillKey: op.skillKey,
        taxonomyNodeId: taxonomyNodeId ?? null,
        estimatedMinutes: op.estimatedMinutes,
        source: op.source,
      },
    });

    const nameMap = buildNames(op.name, op.name, op.name);
    if (nameMap) {
      const translations = buildLocaleTranslations(
        nameMap.names,
        nameMap.fallbackLocale,
        nameMap.originalLocales
      );
      for (const [locale, payload] of Object.entries(translations)) {
        await prisma.serviceOperationTranslation.upsert({
          where: {
            operationId_locale: {
              operationId: record.id,
              locale: locale as Locale,
            },
          },
          update: payload,
          create: { operationId: record.id, locale: locale as Locale, ...payload },
        });
      }
    }
  }

  const parts: PartSeed[] = [
    {
      key: "brake-pads",
      name: "Brake pads",
      taxonomyKey: "brake-system",
      source: "seed",
    },
    {
      key: "oil-filters",
      name: "Oil filters",
      taxonomyKey: "filters",
      source: "seed",
    },
  ];

  for (const part of parts) {
    const taxonomyNodeId = part.taxonomyKey
      ? taxonomyMap.get(part.taxonomyKey)
      : undefined;

    const existing = await prisma.partCategory.findFirst({
      where: { key: part.key },
    });

    const record = existing
      ? await prisma.partCategory.update({
          where: { id: existing.id },
          data: {
            name: part.name,
            taxonomyNodeId: taxonomyNodeId ?? null,
            source: part.source,
          },
        })
      : await prisma.partCategory.create({
          data: {
            key: part.key,
            name: part.name,
            taxonomyNodeId: taxonomyNodeId ?? null,
            source: part.source,
          },
        });

    const nameMap = buildNames(part.name, part.name, part.name);
    if (nameMap) {
      const translations = buildLocaleTranslations(
        nameMap.names,
        nameMap.fallbackLocale,
        nameMap.originalLocales
      );
      for (const [locale, payload] of Object.entries(translations)) {
        await prisma.partCategoryTranslation.upsert({
          where: {
            categoryId_locale: {
              categoryId: record.id,
              locale: locale as Locale,
            },
          },
          update: payload,
          create: { categoryId: record.id, locale: locale as Locale, ...payload },
        });
      }
    }
  }

  await importPartsFromExcel();
  await logPartCounts();

  const port = process.env.PORT ?? "3000";
  const assetsBaseUrl =
    process.env.ASSETS_BASE_URL ?? `http://localhost:${port}/assets`;

  const mediaSeeds: MediaSeed[] = [
    {
      key: "seat-ibiza-img-1",
      type: MediaType.IMG,
      url: `${assetsBaseUrl}/img/seat-ibiza.jpg`,
      path: "assets/img/seat-ibiza.jpg",
      vehicleModelKey: "ibiza",
    },
    {
      key: "seat-ibiza-glb-1",
      type: MediaType.GLB,
      url: `${assetsBaseUrl}/glb/seat-ibiza.glb`,
      path: "assets/glb/seat-ibiza.glb",
      taxonomyKey: "mechanics",
    },
  ];

  for (const media of mediaSeeds) {
    const taxonomyNodeId = media.taxonomyKey
      ? taxonomyMap.get(media.taxonomyKey)
      : undefined;
    const vehicleModelId = media.vehicleModelKey
      ? models.find((model) => model.key === media.vehicleModelKey)?.id
      : undefined;

    await prisma.mediaAsset.upsert({
      where: { key: media.key },
      update: {
        type: media.type,
        url: media.url,
        path: media.path ?? null,
        taxonomyNodeId: taxonomyNodeId ?? null,
        vehicleModelId: vehicleModelId ?? null,
      },
      create: {
        key: media.key,
        type: media.type,
        url: media.url,
        path: media.path ?? null,
        taxonomyNodeId: taxonomyNodeId ?? null,
        vehicleModelId: vehicleModelId ?? null,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
