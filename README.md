# Beterano Data

Este repositorio centraliza los datos técnicos usados por todos los proyectos del ecosistema Beterano:

- `vehiculos.json`: lista de marcas, modelos, generaciones, motores, etc.
- `biblioteca_piezas.json`: estructura jerárquica de piezas (ensamblaje > categoría > subcategoría > pieza)

Estos archivos deben mantenerse actualizados y compartidos para que cualquier modificación impacte automáticamente en las interfaces que los consumen.

## Uso recomendado

En proyectos frontend (como `beterano-catalogo-web`):

```js
fetch("https://raw.githubusercontent.com/BeteranoMotors/beterano-data/main/vehiculos.json")
```

## Actualización

Si se actualiza este repositorio, los proyectos que lo consumen deben recibir los cambios automáticamente si usan las URLs crudas.

## Licencia

Uso interno de Beterano Motors. No redistribuir sin autorización.
# beterano-data
# beterano-data
