import "dotenv/config";
import { PrismaClient, MediaType, TaxonomyKind } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

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

    await prisma.serviceOperation.upsert({
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

    await prisma.partCategory.upsert({
      where: { key: part.key },
      update: {
        name: part.name,
        taxonomyNodeId: taxonomyNodeId ?? null,
        source: part.source,
      },
      create: {
        key: part.key,
        name: part.name,
        taxonomyNodeId: taxonomyNodeId ?? null,
        source: part.source,
      },
    });
  }

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
