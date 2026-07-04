#!/usr/bin/env python3
"""Init script para crear `db/rrhh.db` usando `rrhh_schema.sql`.
Genera también usuarios de ejemplo (admin 'car' y user 'user') con bcrypt para demo.

Comportamiento:
- Si está disponible el paquete `bcrypt` en Python, usa bcrypt para hashear.
- Si no está disponible, hará un fallback con SHA-256 y mostrará una advertencia.

NOTA: Para producción use `bcrypt` o `argon2` y nunca almacene contraseñas en texto plano.
"""
import os
import sqlite3
import hashlib
import sys

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'rrhh.db')
SCHEMA_PATH = os.path.join(BASE_DIR, 'rrhh_schema.sql')


try:
    import bcrypt
    BCRYPT_AVAILABLE = True
except Exception:
    BCRYPT_AVAILABLE = False


def hash_pwd(pw: str) -> str:
    if BCRYPT_AVAILABLE:
        # bcrypt returns bytes - decode to store as TEXT
        return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    else:
        # Fallback - not recommended for production
        return hashlib.sha256(pw.encode('utf-8')).hexdigest()


def init_db(db_path=DB_PATH, schema_path=SCHEMA_PATH):
    if not os.path.exists(schema_path):
        print('Schema file not found:', schema_path)
        return
    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA foreign_keys = ON;')
    with open(schema_path, 'r', encoding='utf-8') as f:
        sql = f.read()
    conn.executescript(sql)

    # Seed demo users (insert or update to ensure bcrypt hashes applied)
    cur = conn.cursor()

    seeds = [
        ('car', '123', 'admin'),
        ('user', 'pass', 'user')
    ]

    for username, password, role in seeds:
        pwd_hash = hash_pwd(password)
        # If user exists, update password_hash and role; else insert
        cur.execute('SELECT id FROM users WHERE username = ?', (username,))
        row = cur.fetchone()
        try:
            if row:
                cur.execute('UPDATE users SET password_hash = ?, role = ? WHERE username = ?', (pwd_hash, role, username))
                print(f'Updated user: {username}')
            else:
                cur.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', (username, pwd_hash, role))
                print(f'Inserted user: {username}')
            conn.commit()
        except Exception as e:
            print('Warning: could not seed user', username, e)

    conn.close()
    print(f'Initialized SQLite DB at {db_path}')


if __name__ == '__main__':
    if not BCRYPT_AVAILABLE:
        print('\nWarning: Python package `bcrypt` not found. The script will use SHA-256 as a fallback.')
        print('To install bcrypt, run: pip install bcrypt\n')
    init_db()
