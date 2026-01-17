import { Router } from "express";
import { prisma } from "../db";
import {
  toPartCategoryDto,
  toPartElementDto,
  toPartGroupDto,
  toPartSystemDto,
  toServiceOperationDto,
  toTaxonomyNodeDto,
  toVehicleMakeDto,
  toVehicleModelDto,
  toVehicleVariantDto,
} from "../dto";
import { parseLocale, requireQuery, safeString, sendError } from "./helpers";

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
    const locale = parseLocale(req, res);
    if (!locale) return;

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
      include: {
        taxonomyNode: true,
        translations: { where: { locale } },
      },
    });

    if (!service) {
      return res.json({ valid: false, resolved: null });
    }

    return res.json({
      valid: true,
      resolved: {
        service: toServiceOperationDto(
          service,
          service.translations[0]?.name
        ),
        taxonomy: toTaxonomyNodeDto(taxonomyNode),
      },
    });
  } catch (error) {
    next(error);
  }
});

lookupRouter.get("/lookup/part", async (req, res, next) => {
  try {
    const locale = parseLocale(req, res);
    if (!locale) return;

    const systemKey = requireQuery(req, res, "systemKey");
    if (!systemKey) return;

    const groupKey = safeString(req.query.groupKey);
    const categoryKey = safeString(req.query.categoryKey);
    const elementKey = safeString(req.query.elementKey);

    if (categoryKey && !groupKey) {
      return sendError(res, 400, "categoryKey requires groupKey");
    }
    if (elementKey && !categoryKey) {
      return sendError(res, 400, "elementKey requires categoryKey");
    }

    const system = await prisma.partSystem.findUnique({
      where: { key: systemKey },
      include: { translations: { where: { locale } } },
    });

    if (!system) {
      return res.json({ valid: false, resolved: null });
    }

    let group = null;
    let category = null;
    let element = null;

    if (groupKey) {
      group = await prisma.partGroup.findFirst({
        where: { key: groupKey, systemId: system.id },
        include: { system: true, translations: { where: { locale } } },
      });

      if (!group) {
        return res.json({ valid: false, resolved: null });
      }
    }

    if (categoryKey && group) {
      category = await prisma.partCategory.findFirst({
        where: { key: categoryKey, groupId: group.id },
        include: { taxonomyNode: true, translations: { where: { locale } } },
      });

      if (!category) {
        return res.json({ valid: false, resolved: null });
      }
    }

    if (elementKey && category) {
      element = await prisma.partElement.findFirst({
        where: { key: elementKey, categoryId: category.id },
        include: { category: true, translations: { where: { locale } } },
      });

      if (!element) {
        return res.json({ valid: false, resolved: null });
      }
    }

    return res.json({
      valid: true,
      resolved: {
        system: toPartSystemDto(system, system.translations[0]?.name),
        group: group
          ? toPartGroupDto(group, group.translations[0]?.name)
          : null,
        category: category
          ? toPartCategoryDto(category, category.translations[0]?.name)
          : null,
        element: element
          ? toPartElementDto(element, element.translations[0]?.name)
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});
