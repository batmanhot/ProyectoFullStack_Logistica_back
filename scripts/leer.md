# Recrear toda las tablas e informacion del sistema

# Base de Datos: stockpro
# Usuario: postgres
# Password: root

# Ingresar hasta la carpeta stock-api y ejecutar : 

## .\scripts\recreate-db.ps1 : Este archivo recrea todas las tablas desde 0

# En caso de error de ejecucion 

# Verifica el PATH de PostgreSQL
# El script usa psql, createdb y pg_isready. Si al ejecutarlo te da 'comando no reconocido', agrega la carpeta bin de tu instalación al PATH, # típicamente C:\Program Files\PostgreSQL\<versión>\bin, y abre una terminal nueva.


# Solución permanente (recomendada, para no repetirlo cada vez)
# Windows + escribe "variables de entorno" → abre "Editar las variables de entorno del sistema"
# Botón "Variables de entorno..."
# En la sección de abajo (variables del sistema) o arriba (variables de usuario), busca Path → Editar
# Nuevo → pega C:\Program Files\PostgreSQL\18\bin
# Aceptar todo, y cierra y vuelve a abrir la terminal (PowerShell no relee el PATH de una ventana ya abierta)

# Después de eso, psql, createdb y pg_isready funcionarán desde cualquier carpeta, y podrás correr directamente:

# powershell
# cd "E:\desarrollo\Proyectos\Proyecto FullStack Logistica\back\stockpro-api"
# .\scripts\recreate-db.ps1

# Prueba con la solución rápida primero para confirmar que todo el flujo funciona, y cuéntame qué salida te da.