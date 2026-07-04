rrhh SQLite schema

Archivos:
- rrhh_schema.sql  -> Esquema SQL para la base de datos `rrhh`.
- init_db.py       -> Script Python que crea `rrhh.db` y realiza un seed mínimo.

Uso (desde Windows PowerShell o terminal):

1) Abrir terminal y situarse en la carpeta `proyecto1/db`.

2) Ejecutar:

```bash
python init_db.py
```

Esto creará `rrhh.db` en la misma carpeta y añadirá dos usuarios de ejemplo (demo):
- admin: usuario `car`, password `123` (hash SHA-256 para demo)
- user: usuario `user`, password `pass` (hash SHA-256 para demo)

IMPORTANTE:
- El hash SHA-256 aquí solo es para facilitar pruebas. Para producción use `bcrypt` o `argon2`.
- Para Android Studio puede importar directamente `rrhh.db` o ejecutar las mismas sentencias SQL usando Room/SQLiteOpenHelper.
- Guardar archivos grandes (PDF/imagenes) en almacenamiento y solo referenciarlos en la BD (campo `path`).
