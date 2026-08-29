# Dibujos de vehículos: cómo se nombran

**El nombre del fichero es el ID del modelo en el catálogo. La carpeta es su tipo.**

```
assets/img/<vehiculos|motos>/<tipo>/<id-del-catalogo>.jpg
```

No es una preferencia de estilo: las apps construyen esa ruta exacta a partir del
catálogo. Un dibujo con cualquier otro nombre **no lo pedirá nadie nunca**. En agosto
de 2026 había 146 dibujos hechos y solo se veían 29; los otros estaban bien dibujados
y en la carpeta correcta, pero llamados a mano (`Ford-Bronco-Gen2.jpg`,
`Land Rover-Range Rover-Classic.jpg`). Emparejarlos después resultó imposible de
automatizar sin equivocar de coche, así que siguen sin verse.

## Antes de dibujar, pide el nombre

```
node scripts/check-vehicle-images.mjs --list bmw
```

Imprime la ruta completa de cada modelo de esa marca que aún no tiene dibujo. Se copia
y se pega: no hay que interpretar nada.

## Antes de commitear, comprueba

```
node scripts/check-vehicle-images.mjs
```

Falla si algún dibujo no corresponde a ningún modelo, o está en una carpeta que no es
la de su tipo.

## Detalles que suelen morder

- **El id repite el modelo dentro de la serie.** `Giulia (105)` de Alfa Romeo es
  `alfa-romeo-giulia-giulia-105`, no `alfa-romeo-giulia-105`. Es feo pero es el id, y
  cambiarlo rompería las rutas de los dibujos que ya funcionan. Pídelo con `--list`.
- **El catálogo está en español.** `alfa-romeo-1900-1900-primera-serie`, no
  `...-first-serie`.
- **Carpetas que empiezan por `_`** (`_vector`, `_copyright`, `_archiv`) son material
  de trabajo: el verificador las ignora y las apps no las miran. Lo que se publica va
  en la carpeta del tipo, a pelo.
- **`.jpg` y `.png` valen los dos**, pero si conviven para el mismo modelo la app usa
  el `.jpg`. Cuidado con dejar el placeholder gris de 631 bytes al lado de un `.png`
  bueno: durante meses tapó 42 dibujos.
- **Peso**: los dibujos actuales rondan 1,1 MB. Una marca con 95 modelos son 100 MB en
  una sola pantalla del mosaico. Hace falta decidir una miniatura antes de producir en
  volumen.
