#!/bin/bash
echo "▶ Ejecutando sincronización desde Google Sheets..."

# Ejecuta el script JS
node scripts/sync_data_beterano_map.js

echo
echo "✅ Sincronización completada. Verificando cambios en JSON..."

# Ruta al directorio de datos
cd ../beterano-map/src/data || exit 1

# Verifica si hay cambios en archivos JSON
git status --porcelain > temp_git_status.txt
grep '\.json' temp_git_status.txt > /dev/null

if [ $? -eq 0 ]; then
    echo
    echo "🔄 Se han detectado cambios en los archivos JSON."

    cd ../../.. || exit 1
    git add beterano-map/src/data/*.json
    git commit -m "sync: actualiza JSON desde Google Sheets"
    git push
    echo "📤 Cambios subidos a GitHub."
else
    echo "⚠ No hay cambios en los JSON. Nada que hacer."
fi

# Limpieza
rm -f ../beterano-map/src/data/temp_git_status.txt

