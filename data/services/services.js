// beterano-data/services.js

// Lo que se ve en el STEP 1 del wizard (Reparaturen, Wartung, etc.)
window.BETERANO_SERVICES = [
  {
    id: "repairs",
    type: "service",
    i18nKeyTitle: "service_repairs_title",
    i18nKeySubtitle: "service_repairs_subtitle",
    defaultDurationMinutes: 180,
    defaultPriority: "normal"
  },
  {
    id: "maintenance",
    type: "service",
    i18nKeyTitle: "service_maintenance_title",
    i18nKeySubtitle: "service_maintenance_subtitle",
    defaultDurationMinutes: 120,
    defaultPriority: "normal"
  },
  {
    id: "diagnostics",
    type: "service",
    i18nKeyTitle: "service_diagnostics_title",
    i18nKeySubtitle: "service_diagnostics_subtitle",
    defaultDurationMinutes: 60,
    defaultPriority: "normal"
  },
  {
    id: "inspection",
    type: "service",
    i18nKeyTitle: "service_inspection_title",
    i18nKeySubtitle: "service_inspection_subtitle",
    defaultDurationMinutes: 90,
    defaultPriority: "normal"
  },
  {
    id: "restoration",
    type: "service",
    i18nKeyTitle: "service_restoration_title",
    i18nKeySubtitle: "service_restoration_subtitle",
    defaultDurationMinutes: 240,
    defaultPriority: "normal"
  },
  {
    id: "camperization",
    type: "service",
    i18nKeyTitle: "service_camperization_title",
    i18nKeySubtitle: "service_camperization_subtitle",
    defaultDurationMinutes: 240,
    defaultPriority: "normal"
  },
  {
    id: "bodywork",
    type: "service",
    i18nKeyTitle: "service_bodywork_title",
    i18nKeySubtitle: "service_bodywork_subtitle",
    defaultDurationMinutes: 180,
    defaultPriority: "normal"
  }
];
