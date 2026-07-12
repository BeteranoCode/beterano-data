# Propuesta de reestructuración taxonómica

Ficheros de propuesta para revisar antes de tocar la taxonomía live.
Cada `NN-<systemKey>.json` describe un sistema completo con sus grupos,
categorías y elementos siguiendo el árbol de 4 niveles de beterano-data
(PartSystem → PartGroup → PartCategory → PartElement).

## Formato

- Keys en inglés canónico, kebab-case (fuente única de verdad).
- Etiquetas iniciales en **en** (canónica) y **es** (operativa) para validar
  la estructura. Los otros 10 idiomas (ar, de, fr, hr, it, ja, nl, pl, tr, zh)
  se rellenan en pasada batch una vez el árbol quede aprobado.
- `imageKey` a nivel de sistema apunta al PNG existente en
  `assets/img/biblioteca_piezas/PartSystem/`. Los niveles inferiores no llevan
  icono todavía.

## Estado

| Sistema           | Fichero                       | Estado    |
| ----------------- | ----------------------------- | --------- |
| brakes            | 01-brakes.json                | draft v1  |
| wheels-and-tires  | 02-wheels-and-tires.json      | draft v1  |

## Después de aprobar

1. Rellenar los 10 idiomas restantes (batch).
2. Convertir a XLSX compatible con el importador existente, o escribir un seed
   Prisma que ingesta directamente el JSON.
3. Aplicar migración: crear los nuevos PartSystem/Group/Category/Element,
   remapear las `MarketplacePart.categoryKey` que apuntaban a keys viejas.
4. Retirar el alias map `PARTS_SYSTEM_ALIASES` de beterano-leads-api y el
   `PART_SYSTEM_DUPLICATE_KEYS` del frontend.
