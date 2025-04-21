# Beterano Data

Este repositorio centraliza los **datos técnicos estructurados** utilizados por todos los proyectos del ecosistema Beterano.

### 📦 Contenido

- `vehiculos.json`: listado jerarquizado de marcas, modelos, generaciones, motores, etc.
- `biblioteca_piezas.json`: estructura de piezas organizada por ensamblaje > categoría > subcategoría > pieza
- `biblioteca_piezas_vehiculos.xlsx`: archivo fuente desde el cual se generan los JSON
- `scripts/sync_biblioteca.js`: script para sincronizar los archivos JSON desde la hoja Excel

---

### 🚀 Proyectos que utilizan este repositorio

Este repositorio actúa como **única fuente de verdad** para los siguientes proyectos:

- [`beterano-catalogo-web`](https://github.com/BeteranoMotors/beterano-catalogo-web)
- [`beterano_ai_wa_talk_catcher`](https://github.com/BeteranoMotors/beterano_ai_wa_talk_catcher)

---

### 🛠 Cómo sincronizar desde Excel

1. Asegurate de tener Node.js instalado
2. Instalá las dependencias:

```bash
npm install
