RRHH Backend (Node/Express)

Rápido inicio:

1) Abrir terminal en `proyecto1/backend`.

2) Instalar dependencias:

```bash
npm install
```

3) Inicializar base de datos (ejecuta `init_db.py` en `../db`):

```bash
npm run init-db
```

4) Iniciar servidor:

```bash
npm start
```

Endpoints principales (ejemplos):
- `POST /api/auth/register` {username,password}
- `POST /api/auth/login` {username,password} -> devuelve `token`
- `GET /api/meetings` (Authorization: Bearer <token>)
- `POST /api/meetings` (Authorization)
- `POST /api/upload` (Authorization, form-data key `file`)
- `GET /api/sensors/positions` (Authorization)

Notas:
- Cambia la variable de entorno `RRHH_SECRET` para producción.
- Passwords almacenados con `bcryptjs`.
- Para migrar a Android Studio usa el archivo `db/rrhh.db` o re-implemente el esquema con Room.
