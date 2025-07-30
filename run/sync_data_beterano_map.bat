@echo off
cd /d "%~dp0"

echo ▶ Ejecutando sincronización desde Google Sheets...
node ../scripts/sync_data_beterano_map.js

echo.
echo ✅ Sincronización completada. Verificando cambios en JSON...

cd ../data || exit /b

:: Verifica si hay archivos modificados
git status --porcelain > temp_git_status.txt
findstr /R ".*\.json" temp_git_status.txt >nul
if %errorlevel%==0 (
    echo.
    echo 🔄 Se han detectado cambios en los archivos JSON.

    cd ..
    git add data/*.json
    git commit -m "sync: actualiza JSON desde Google Sheets"
    git push
    echo 📤 Cambios subidos a GitHub.
) else (
    echo ⚠ No hay cambios en los JSON. Nada que hacer.
)

:: Limpieza
cd ..
del data\temp_git_status.txt 2>nul

pause
