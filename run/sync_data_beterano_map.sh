#!/bin/bash
echo "▶ Ejecutando sincronización desde Google Sheets..."

# Ejecuta el script pasando la ruta de salida
node scripts/sync_data_beterano_map.js ./data

echo ""
echo "✅ Sincronización completada. Verificando cambios en JSON..."

# Verifica cambios en archivos JSON en la carpeta /data
cd data || exit 1
git status --porcelain > ../temp_git_status.txt
grep '\.json' ../temp_git_status.txt > /dev/null

if [ $? -eq 0 ]; then
  echo ""
  echo "🔄 Se han detectado cambios en los archivos JSON."

  cd .. || exit 1
  git add data/*.json
  git commit -m "sync: actualiza JSON desde Google Sheets"
  git push
  echo "📤 Cambios subidos a GitHub."
else
  echo "⚠ No hay cambios en los JSON. Nada que hacer."
fi

# Limpieza
rm -f temp_git_status.txt
