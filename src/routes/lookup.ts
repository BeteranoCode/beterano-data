import { Router } from "express";
import { prisma } from "../db";
import {
  toPartCategoryDto,
  toServiceOperationDto,
  toTaxonomyNodeDto,
  toVehicleMakeDto,
  toVehicleModelDto,
  toVehicleVariantDto,
} from "../dto";
import { requireQuery, safeString } from "./helpers";

export const lookupRouter = Router();

lookupRouter.get("/lookup/vehicle", async (req, res, next) => {
  try {
    const makeKey = requireQuery(req, res, "make");
    const modelKey = requireQuery(req, res, "model");
    if (!makeKey || !modelKey) return;

    const variantKey = safeString(req.query.variant);

    const make = await prisma.vehicleMake.findUnique({
      where: { key: makeKey },
    });

    if (!make) {
      return res.json({ valid: false, resolved: null });
    }

    const model = await prisma.vehicleModel.findFirst({
      where: { key: modelKey, makeId: make.id },
      include: { make: true },
    });

    if (!model) {
      return res.json({ valid: false, resolved: null });
    }

    if (variantKey) {
      const variant = await prisma.vehicleVariant.findFirst({
        where: { key: variantKey, modelId: model.id },
        include: { model: true },
      });

      if (!variant) {
        return res.json({ valid: false, resolved: null });
      }

      return res.json({
        valid: true,
        resolved: {
          make: toVehicleMakeDto(make),
          model: toVehicleModelDto(model),
          variant: toVehicleVariantDto(variant),
        },
      });
    }

    return res.json({
      valid: true,
      resolved: {
        make: toVehicleMakeDto(make),
        model: toVehicleModelDto(model),
      },
    });
  } catch (error) {
    next(error);
  }
});

lookupRouter.get("/lookup/service", async (req, res, next) => {
  try {
    const skill = requireQuery(req, res, "skill");
    const taxonomyKey = requireQuery(req, res, "taxonomyKey");
    const serviceKey = requireQuery(req, res, "serviceKey");
    if (!skill || !taxonomyKey || !serviceKey) return;

    const taxonomyNode = await prisma.taxonomyNode.findUnique({
      where: { key: taxonomyKey },
      include: { parent: true },
    });

    if (!taxonomyNode) {
      return res.json({ valid: false, resolved: null });
    }

    const service = await prisma.serviceOperation.findFirst({
      where: {
        key: serviceKey,
        skillKey: skill,
        taxonomyNodeId: taxonomyNode.id,
      },
      include: { taxonomyNode: true },
    });

    if (!service) {
      return res.json({ valid: false, resolved: null });
    }

    return res.json({
      valid: true,
      resolved: {
        service: toServiceOperationDto(service),
        taxonomy: toTaxonomyNodeDto(taxonomyNode),
      },
    });
  } catch (error) {
    next(error);
  }
});

lookupRouter.get("/lookup/part", async (req, res, next) => {
  try {
    const system = requireQuery(req, res, "system");
    const categoryKey = requireQuery(req, res, "categoryKey");
    if (!system || !categoryKey) return;

    const taxonomyNode = await prisma.taxonomyNode.findUnique({
      where: { key: system },
      include: { parent: true },
    });

    if (!taxonomyNode) {
      return res.json({ valid: false, resolved: null });
    }

    const category = await prisma.partCategory.findFirst({
      where: {
        key: categoryKey,
        taxonomyNodeId: taxonomyNode.id,
      },
      include: { taxonomyNode: true },
    });

    if (!category) {
      return res.json({ valid: false, resolved: null });
    }

    return res.json({
      valid: true,
      resolved: {
        system: toTaxonomyNodeDto(taxonomyNode),
        category: toPartCategoryDto(category),
      },
    });
  } catch (error) {
    next(error);
  }
});
