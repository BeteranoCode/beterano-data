# Museos del automóvil

Catálogo de museos y colecciones de automoción del mundo. Alimenta la tribu
`museos` del mapa (pines + cards).

## Origen

Los datos se extraen de [automobile-museums.com](https://automobile-museums.com),
un WordPress con la REST API abierta. Cada museo tiene dos fichas (francés e
inglés) que se emparejan por sus `<link rel="alternate" hreflang>`, que es la
relación autoritativa de Polylang — emparejar por teléfono o dirección junta
museos distintos que comparten centralita o código postal (Le Mans, Hickory
Corners, Turín).

De cada ficha salen: nombre, dirección estructurada (bloque Jetpack Contact
Info), teléfono, web, horarios, tarifas, logo, fotos y los textos de
presentación / "los coches" / "además de los coches".

Dos límites del origen que conviene recordar antes de "arreglarlos":

- **No hay coordenadas.** El sitio solo enlaza a una búsqueda de Google Maps.
  El campo `location` de este dataset es geocodificado nuestro, no del origen.
- **El email no es extraíble.** Va cifrado por el anti-spam CleanTalk y solo se
  descifra en el navegador con una clave de sesión. Se deja `null` en vez de
  guardar la versión enmascarada (`mu*******@****ge.fr`).

## Geocodificación

En cascada, hasta conseguir un punto:

1. Nominatim estructurado (calle + ciudad + CP + país).
2. Nominatim en texto libre con la dirección completa.
3. Nominatim con el nombre del museo (primero el francés: OSM nombra los
   equipamientos en el idioma local).
4. Overpass: museos `tourism=museum` en 20 km del centro de la ciudad, aceptando
   el candidato si comparte dominio web, si el nombre coincide en sus palabras
   distintivas, o si es el único museo de motor del radio.
5. Si nada encaja, queda el centroide de la ciudad con `precision: "city"`.

`location.precision` distingue ambos casos y `geocoding.method` deja rastro de
cómo se resolvió cada uno, para poder auditar los dudosos.

## Regenerar

El pipeline está en `scripts/` y se ejecuta en orden. Cada paso cachea su salida
en el mismo directorio, así que se puede reanudar sin repetir peticiones:

```bash
cd datasets/museums/scripts
python 01_dump.py             # volcado de las 356 paginas via WP REST API
python 03_hreflang.py         # pares FR<->EN leyendo los hreflang de cada ficha
python 04_build.py            # parsea y agrupa -> museums.json (intermedio)
python 05_geocode.py          # Nominatim: direccion estructurada y texto libre
python 06b_geocode_names.py   # Nominatim: por nombre del museo
python 06c_geocode_overpass.py # Overpass: tourism=museum cerca de la ciudad
python 07_seed.py             # aplica manual_overrides.json -> museums.dataset.json
cp museums.dataset.json ../museums.json
```

`02_parse.py` no se ejecuta suelto: es la librería de parseo que importan 04 y 07.

`manual_overrides.json` corrige lo que el origen trae mal (ciudades que no son
ciudades, calles traducidas al inglés, museos cerrados). Cada entrada lleva un
`_why`: revísalos antes de borrarlos tras un re-extraído.

Después, en `beterano-core-api`:

```bash
npm run vendor:catalog                     # copia museums.json a data/museums/
npm run import:museums -- --validate-only  # valida sin tocar la base de datos
npm run import:museums -- --dry-run        # dice que crearia/actualizaria
npm run import:museums
```

## Aviso de contenido

Las descripciones son texto con derechos de autor de automobile-museums.com. Se
conservan aquí como material de origen; lo que se publique de cara al usuario
debe reescribirse o resumirse, y en todo caso enlazar a la ficha original
(`source.urlEn` / `source.urlFr`).
