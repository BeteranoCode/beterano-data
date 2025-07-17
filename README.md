# Beterano Data

Este repositorio centraliza los **datos técnicos estructurados** utilizados por todos los proyectos del ecosistema Beterano.

### 📦 Contenido

- `vehiculos.json`: listado jerarquizado de marcas, modelos, generaciones, motores, etc.
- `biblioteca_piezas.json`: estructura de piezas organizada por ensamblaje > categoría > subcategoría > pieza
- `biblioteca_piezas_vehiculos.xlsx`: archivo fuente desde el cual se generan los JSON
- `vin_prefixes.xlsx`: base editable con prefijos VIN, longitud y años por modelo
- `scripts/sync_biblioteca.js`: script para sincronizar los archivos JSON desde la hoja Excel
- `scripts/sync_vin_prefixes.js`: script que convierte `vin_prefixes.xlsx` en `vin_prefixes.json`

---

### 🚀 Proyectos que utilizan este repositorio

Este repositorio actúa como **única fuente de verdad** para los siguientes proyectos:

- [`beterano-catalogo-web`](https://github.com/BeteranoMotors/beterano-catalogo-web)
- [`beterano_ai_wa_talk_catcher`](https://github.com/BeteranoMotors/beterano_ai_wa_talk_catcher)

---

### 🛠 Cómo sincronizar desde Excel

1. Asegúrate de tener Node.js instalado
2. Instala las dependencias (por única vez):

```bash
npm install
```

3. Ejecuta uno de los siguientes comandos según el tipo de sincronización:

```bash
# Para actualizar biblioteca_piezas.json
node scripts/sync_biblioteca.js

# Para actualizar vin_prefixes.json desde vin_prefixes.xlsx
node scripts/sync_vin_prefixes.js
```

También puedes usar los archivos `.bat` en la carpeta `run/` si estás en Windows.
