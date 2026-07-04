import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'rrhh.db')
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
for row in cur.execute("SELECT id, username, password_hash, role, created_at FROM users ORDER BY id"):
    print(row)
conn.close()
