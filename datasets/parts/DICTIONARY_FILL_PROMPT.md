# TAREA: Completar el diccionario multilingüe de piezas de automóvil de Beterano

Eres un experto en **terminología de recambios de automóvil** en **español, alemán e inglés**, con conocimiento de cómo los vendedores particulares y desguaces redactan sus anuncios de piezas de segunda mano en portales como **eBay Kleinanzeigen (DE), Willhaben (AT), Wallapop (ES), Marktplaats (NL) y ricardo (CH)**.

Tu misión: **rellenar las columnas de keywords y aliases** del fichero adjunto `parts-dictionary.tsv` con los términos reales que un vendedor usaría para nombrar cada pieza, en los tres idiomas.

---

## 1. Por qué (contexto — léelo, cambia cómo rellenas)

Beterano scrapea anuncios de piezas de 2ª mano. **Esos portales NO tienen filtro por sistema/categoría de pieza** — el vendedor escribe texto libre en el título ("Motorsteuergerät EFI Range Rover Classic 3.9 V8"). Beterano tiene una **taxonomía canónica** de piezas (Sistema → Grupo → Categoría → Elemento). Un *matcher* usa este diccionario para dos cosas:

1. **Clasificar** un anuncio scrapeado → el nodo correcto de la taxonomía (casa el título contra tus keywords).
2. **Generar búsquedas de texto** por portal en su idioma (traduce el nodo a "motorsteuergerät" en DE, "centralita" en ES) para descubrir más anuncios.

**Por tanto: los keywords deben ser los términos que aparecen en anuncios reales**, no definiciones de diccionario técnico. Cuanto mejores y más completos, mejor clasifica y busca el sistema.

---

## 2. El fichero

`parts-dictionary.tsv` — **TSV (separado por TABULADORES)**, cabecera + **1680 filas** (una por nodo de la taxonomía).

Columnas, en este orden EXACTO:

```
ruta | tipo | key | name_es | keywords_es | aliases_es | name_de | keywords_de | aliases_de | name_en | keywords_en | aliases_en
```

- **`ruta`**: ruta legible del nodo (`Sistema > Grupo > Categoría > Elemento`). Úsala para entender EXACTAMENTE qué pieza es. **No la modifiques.**
- **`tipo`**: `system` | `group` | `category` | `element`. **No la modifiques.**
- **`key`**: identificador estable. **No la modifiques.**
- **`name_es` / `name_de` / `name_en`**: nombre canónico ya traducido. **NO los modifiques** (úsalos como referencia).
- **`keywords_es` / `keywords_de` / `keywords_en`**: ← **AQUÍ escribes** los términos de búsqueda/venta.
- **`aliases_es` / `aliases_de` / `aliases_en`**: ← variantes, erratas frecuentes, nombres de marca genéricos (opcional).

> ⛔ **SOLO puedes escribir en las 6 columnas keywords_* y aliases_*. Todo lo demás es de solo lectura.** No reordenes filas, no borres filas, no cambies la cabecera, no cambies el número de columnas.

---

## 3. Qué poner en `keywords_xx`

Los términos que un **vendedor** escribiría para una pieza de ESE nodo, en ese idioma:

- Nombre(s) común(es), **sinónimos**, términos coloquiales, **abreviaturas**, siglas, y **erratas frecuentes**.
- **Varios términos separados por `|` (barra vertical).** En **minúsculas**. Sin espacios sobrantes. Sin artículos ni puntuación.
- Objetivo: **3–8 keywords por elemento**; menos en categorías/grupos/sistemas (más genéricos).

### Ejemplos (así de bien hay que hacerlo)

| ruta (elemento) | keywords_es | keywords_de | keywords_en |
|---|---|---|---|
| …Centralita del motor | `centralita motor\|centralita\|ecu\|unidad de control motor\|calculador motor` | `motorsteuergerät\|steuergerät motor\|motor steuergerät\|ecu\|edc` | `ecu\|engine control unit\|engine control module\|ecm\|dme` |
| …Disco de freno | `disco de freno\|discos de freno\|disco freno` | `bremsscheibe\|bremsscheiben` | `brake disc\|brake discs\|brake rotor\|rotors` |
| …Alternador | `alternador\|dinamo` | `lichtmaschine\|generator\|lima` | `alternator\|generator` |
| …Bomba de agua | `bomba de agua\|bomba agua` | `wasserpumpe\|kühlmittelpumpe` | `water pump\|coolant pump` |
| …Amortiguador | `amortiguador\|amortiguadores\|amortidor` | `stoßdämpfer\|stossdämpfer\|dämpfer` | `shock absorber\|shock\|damper` |

---

## 4. Reglas de calidad (CRÍTICAS)

1. **Específico, no genérico.** NUNCA pongas palabras sueltas que casan con todo (`motor`, `parte`, `pieza`, `auto`, `teil`, `part`). Provocan falsos positivos. Usa el término completo de la pieza.
2. **Alemán = palabra compuesta completa** (`bremssattel`, `zündspule`, `zylinderkopfdichtung`). El matcher maneja compuestos; no los partas.
3. **Longitud mínima**: cada keyword ≥ 4 caracteres (evita fragmentos como `öl`, `kfz`).
4. **`aliases_xx`** = nombres alternativos / genéricos de marca / erratas típicas (`amortidor`, `stossdämpfer`). Opcional — puedes dejarlo vacío.
5. **Si no conoces una traducción específica con seguridad, deja la celda VACÍA** en vez de inventar. Vacío = no se sobrescribe nada (es seguro). Es mejor cobertura parcial correcta que ruido.
6. Términos **tal como aparecen en anuncios** (sin "el", "the", "der", sin comas ni paréntesis dentro del término; el separador entre términos es solo `|`).
7. No repitas el `name_xx` como único keyword si es idéntico — añade sinónimos/variantes que aporten.

---

## 5. Prioridad (haz en este orden)

1. **`tipo = element`** — los nodos hoja son los de MÁXIMO impacto para clasificar. Empieza por ellos.
2. Dentro de elementos, prioriza los **sistemas más comunes**: frenos, motor, suspensión, transmisión/embrague, escape, sistema eléctrico, refrigeración, dirección, filtros, encendido.
3. Después `category`, luego `group`, luego `system`.

Trabaja **por lotes/sistemas** de forma sistemática. Puedes recorrer todo el fichero; no pasa nada por dejar vacío un nodo que no domines, pero **apunta a cobertura completa de los elementos**.

---

## 6. Cómo entregar

- **Edita el fichero `parts-dictionary.tsv` en su sitio**, conservando **exactamente** la estructura TSV: mismos tabuladores, mismo orden de columnas, **todas las filas**, misma cabecera, codificación **UTF-8**. No reordenes ni elimines filas.
- Si trabajas por lotes, ve guardando; al final, **auto-verifica**:
  - Mismo nº de filas que el original (1681 con cabecera).
  - Cabecera intacta.
  - Solo modificadas las 6 columnas `keywords_*` / `aliases_*`.
  - Ningún término contiene TAB ni saltos de línea (solo `|` como separador interno).

---

## 7. Verificación posterior (la hará el humano)

En el repo `beterano-data`, con su base de datos levantada:

```
npm run dict:import
```

Es **seguro e idempotente**: solo actualiza celdas NO vacías, nunca borra, no toca nombres. Después, el matcher `GET /v1/lookup/part-text?q=<texto>&locale=<es|de|en>` usará tus keywords para clasificar anuncios reales.

---

**Resumen en una frase:** rellena `keywords_es/de/en` (y opcionalmente `aliases_*`) de cada fila del TSV con los términos reales que un vendedor usaría para esa pieza en cada idioma, empezando por los elementos de los sistemas más comunes, sin tocar ninguna otra columna.
