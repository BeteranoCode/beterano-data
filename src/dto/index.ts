import type {
  CatalogItemKind,
  MediaAsset,
  PartCategory,
  PartElement,
  PartGroup,
  PartSystem,
  ServiceOperation,
  TaxonomyNode,
  VehicleMake,
  VehicleModel,
  VehicleVariant,
  MediaType,
  TaxonomyKind,
  WorkCatalogItem,
} from "@prisma/client";
import { buildMetadata } from "./metadata";

type DtoMeta = {
  aliases?: string[];
  keywords?: string[];
  confidenceHints?: string[];
};

export type VehicleMakeDto = {
  key: string;
  name: string;
} & DtoMeta;

export type VehicleModelDto = {
  key: string;
  name: string;
  makeKey: string;
} & DtoMeta;

export type VehicleVariantDto = {
  key: string;
  name: string;
  modelKey: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  engine?: string | null;
  fuel?: string | null;
  powerKw?: number | null;
} & DtoMeta;

export type TaxonomyNodeDto = {
  key: string;
  name: string;
  kind: TaxonomyKind;
  parentKey?: string | null;
} & DtoMeta;

export type ServiceOperationDto = {
  key: string;
  name: string;
  skillKey?: string | null;
  taxonomyKey?: string | null;
  estimatedMinutes?: number | null;
} & DtoMeta;

export type PartCategoryDto = {
  key: string;
  name: string;
  taxonomyKey?: string | null;
  label?: string;
} & DtoMeta;

export type MediaAssetDto = {
  key: string;
  type: MediaType;
  url: string;
  path?: string | null;
  taxonomyKey?: string | null;
  vehicleModelKey?: string | null;
} & DtoMeta;

export type CatalogCategoryDto = {
  key: string;
  name: string;
} & DtoMeta;

export type CatalogItemDto = {
  code: number;
  key: string;
  name: string;
  kind: CatalogItemKind;
  categoryKey: string;
  aliases?: string[];
  keywords?: string[];
} & DtoMeta;

export type PartSystemDto = {
  key: string;
  label: string;
  imageKey?: string | null;
} & DtoMeta;

export type PartGroupDto = {
  key: string;
  label: string;
  systemKey: string;
  imageKey?: string | null;
} & DtoMeta;

export type PartElementDto = {
  key: string;
  label: string;
  categoryKey: string;
  imageKey?: string | null;
  legacyId?: string | null;
} & DtoMeta;

type VehicleModelWithMake = VehicleModel & { make: VehicleMake };
type VehicleVariantWithModel = VehicleVariant & { model: VehicleModel };
type TaxonomyNodeWithParent = TaxonomyNode & { parent: TaxonomyNode | null };
type ServiceOperationWithTaxonomy = ServiceOperation & {
  taxonomyNode: TaxonomyNode | null;
};
type PartCategoryWithTaxonomy = PartCategory & {
  taxonomyNode: TaxonomyNode | null;
};
type MediaAssetWithRelations = MediaAsset & {
  taxonomyNode: TaxonomyNode | null;
  vehicleModel: VehicleModel | null;
};

type CatalogItemWithCategory = WorkCatalogItem & {
  category: TaxonomyNode;
};

type PartGroupWithSystem = PartGroup & { system: PartSystem };
type PartCategoryWithGroup = PartCategory & { group: PartGroup | null };
type PartElementWithCategory = PartElement & { category: PartCategory };

export function toVehicleMakeDto(make: VehicleMake): VehicleMakeDto {
  return {
    key: make.key,
    name: make.name,
    ...buildMetadata(make.name, make.key),
  };
}

export function toVehicleModelDto(
  model: VehicleModelWithMake
): VehicleModelDto {
  return {
    key: model.key,
    name: model.name,
    makeKey: model.make.key,
    ...buildMetadata(model.name, model.key),
  };
}

export function toVehicleVariantDto(
  variant: VehicleVariantWithModel
): VehicleVariantDto {
  return {
    key: variant.key,
    name: variant.name,
    modelKey: variant.model.key,
    yearFrom: variant.yearFrom,
    yearTo: variant.yearTo,
    engine: variant.engine,
    fuel: variant.fuel,
    powerKw: variant.powerKw,
    ...buildMetadata(variant.name, variant.key),
  };
}

export function toTaxonomyNodeDto(
  node: TaxonomyNodeWithParent
): TaxonomyNodeDto {
  return {
    key: node.key,
    name: node.name,
    kind: node.kind,
    parentKey: node.parent?.key ?? null,
    ...buildMetadata(node.name, node.key),
  };
}

export function toServiceOperationDto(
  operation: ServiceOperationWithTaxonomy,
  translatedName?: string | null
): ServiceOperationDto {
  const name = translatedName ?? operation.name;
  return {
    key: operation.key,
    name,
    skillKey: operation.skillKey,
    taxonomyKey: operation.taxonomyNode?.key ?? null,
    estimatedMinutes: operation.estimatedMinutes,
    ...buildMetadata(name, operation.key),
  };
}

export function toPartCategoryDto(
  category: PartCategoryWithTaxonomy,
  translatedName?: string | null
): PartCategoryDto {
  const name = translatedName ?? category.name;
  return {
    key: category.key,
    name,
    taxonomyKey: category.taxonomyNode?.key ?? null,
    label: name,
    ...buildMetadata(name, category.key),
  };
}

export function toMediaAssetDto(
  asset: MediaAssetWithRelations
): MediaAssetDto {
  return {
    key: asset.key,
    type: asset.type,
    url: asset.url,
    path: asset.path,
    taxonomyKey: asset.taxonomyNode?.key ?? null,
    vehicleModelKey: asset.vehicleModel?.key ?? null,
    ...buildMetadata(asset.key, asset.key),
  };
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item) => typeof item === "string") as string[];
}

export function toCatalogCategoryDto(
  node: TaxonomyNode,
  translatedName?: string | null
): CatalogCategoryDto {
  const name = translatedName ?? node.name;
  return {
    key: node.key,
    name,
    ...buildMetadata(name, node.key),
  };
}

export function toCatalogItemDto(
  item: CatalogItemWithCategory,
  translatedName?: string | null
): CatalogItemDto {
  const name = translatedName ?? item.name;
  return {
    code: item.code,
    key: item.key,
    name,
    kind: item.kind,
    categoryKey: item.category.key,
    aliases: parseStringArray(item.aliases),
    keywords: parseStringArray(item.keywords),
    ...buildMetadata(name, item.key),
  };
}

export function toPartSystemDto(
  system: PartSystem,
  translatedName?: string | null
): PartSystemDto {
  const label = translatedName ?? system.key;
  return {
    key: system.key,
    label,
    imageKey: system.imageKey,
    ...buildMetadata(label, system.key),
  };
}

export function toPartGroupDto(
  group: PartGroupWithSystem,
  translatedName?: string | null
): PartGroupDto {
  const label = translatedName ?? group.key;
  return {
    key: group.key,
    label,
    systemKey: group.system.key,
    imageKey: group.imageKey,
    ...buildMetadata(label, group.key),
  };
}

export function toPartElementDto(
  element: PartElementWithCategory,
  translatedName?: string | null
): PartElementDto {
  const label = translatedName ?? element.key;
  return {
    key: element.key,
    label,
    categoryKey: element.category.key,
    imageKey: element.imageKey,
    legacyId: element.legacyId,
    ...buildMetadata(label, element.key),
  };
}
