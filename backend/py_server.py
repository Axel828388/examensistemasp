#!/usr/bin/env python3
"""Servidor HTTP mínimo en Python para pruebas locales sin dependencias externas.
Provee endpoints:
- GET /api/ping
- GET/POST /api/meetings
- GET/POST /api/sensors/positions
- GET / (pagina de prueba)

Usa el `rrhh.db` en ../db/rrhh.db
"""
import os
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.parse
import datetime
import base64
import cgi

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, '..', 'db', 'rrhh.db')

if not os.path.exists(DB_PATH):
    raise SystemExit('Database not found at ' + DB_PATH + ' - run ../db/init_db.py first')

conn = sqlite3.connect(DB_PATH, check_same_thread=False)
conn.row_factory = sqlite3.Row

class Handler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-type', content_type)
        self.end_headers()

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0) or 0)
        if length:
            raw = self.rfile.read(length)
            try:
                return json.loads(raw.decode('utf-8'))
            except Exception:
                return None
        return None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == '/' or path == '/index.html':
            self._set_headers(200, 'text/html; charset=utf-8')
            html = """
            <!doctype html>
            <html><head><meta charset="utf-8"><title>RRHH Backend Test</title></head>
            <body>
            <h2>RRHH Backend - Test Page</h2>
            <div id="out">Probando...</div>
            <button onclick="ping()">Ping</button>
            <script>
            async function ping(){
              const r = await fetch('/api/ping');
              const j = await r.json();
              document.getElementById('out').textContent = JSON.stringify(j);
            }
            </script>
            </body></html>
            """
            self.wfile.write(html.encode('utf-8'))
            return
        if path == '/api/ping':
            self._set_headers()
            self.wfile.write(json.dumps({'ok': True, 'time': datetime.datetime.utcnow().isoformat()}).encode('utf-8'))
            return
        if path == '/api/meetings':
            cur = conn.execute('SELECT * FROM meetings ORDER BY datetime DESC')
            rows = [dict(r) for r in cur.fetchall()]
            self._set_headers()
            self.wfile.write(json.dumps(rows).encode('utf-8'))
            return
        if path == '/api/sensors/positions':
            cur = conn.execute('SELECT * FROM sensor_positions ORDER BY ts DESC LIMIT 100')
            rows = [dict(r) for r in cur.fetchall()]
            self._set_headers()
            self.wfile.write(json.dumps(rows).encode('utf-8'))
            return
        self.send_error(404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        content_type = self.headers.get('Content-Type', '')
        data = None
        if content_type and 'application/json' in content_type:
            data = self._read_json()

        # Meetings
        if path == '/api/meetings':
            if not data:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'invalid json'}) .encode('utf-8'))
                return
            title = data.get('title')
            datetime_ = data.get('datetime')
            description = data.get('description', '')
            if not title or not datetime_:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'title and datetime required'}).encode('utf-8'))
                return
            cur = conn.execute('INSERT INTO meetings (title, datetime, description) VALUES (?, ?, ?)', (title, datetime_, description))
            conn.commit()
            self._set_headers(201)
            self.wfile.write(json.dumps({'id': cur.lastrowid}).encode('utf-8'))
            return

        # Sensor positions
        if path == '/api/sensors/positions':
            if not data:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'invalid json'}).encode('utf-8'))
                return
            lat = data.get('lat')
            lng = data.get('lng')
            ts = data.get('ts')
            if lat is None or lng is None or ts is None:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'lat,lng,ts required'}).encode('utf-8'))
                return
            cur = conn.execute('INSERT INTO sensor_positions (device_id, lat, lng, accuracy, altitude, altitude_accuracy, speed, heading, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', (
                data.get('device_id'), lat, lng, data.get('accuracy'), data.get('altitude'), data.get('altitude_accuracy'), data.get('speed'), data.get('heading'), ts
            ))
            conn.commit()
            self._set_headers(201)
            self.wfile.write(json.dumps({'id': cur.lastrowid}).encode('utf-8'))
            return

        # Uploads (support multipart/form-data and JSON base64)
        if path == '/api/upload':
            if content_type and 'multipart/form-data' in content_type:
                try:
                    fs = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD':'POST', 'CONTENT_TYPE': content_type, 'CONTENT_LENGTH': self.headers.get('Content-Length')})
                    if 'file' not in fs:
                        self._set_headers(400)
                        self.wfile.write(json.dumps({'error': 'file field required'}).encode('utf-8'))
                        return
                    fileitem = fs['file']
                    filename = fileitem.filename
                    file_data = fileitem.file.read()
                    uploads_dir = os.path.join(BASE_DIR, 'uploads')
                    os.makedirs(uploads_dir, exist_ok=True)
                    safe_name = filename.replace('..', '').replace('/', '_').replace('\\', '_')
                    dest_name = f"{int(datetime.datetime.utcnow().timestamp()*1000)}_{safe_name}"
                    dest = os.path.join(uploads_dir, dest_name)
                    with open(dest, 'wb') as f:
                        f.write(file_data)
                    cur = conn.execute('INSERT INTO documents (filename, path, uploaded_by) VALUES (?, ?, ?)', (filename, dest, None))
                    conn.commit()
                    self._set_headers(201)
                    self.wfile.write(json.dumps({'id': cur.lastrowid, 'path': dest}).encode('utf-8'))
                except Exception as e:
                    self._set_headers(500)
                    self.wfile.write(json.dumps({'error': 'upload failed', 'message': str(e)}).encode('utf-8'))
                return
            # JSON fallback
            if not data:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'invalid json'}).encode('utf-8'))
                return
            filename = data.get('filename')
            content_b64 = data.get('content')
            if not filename or not content_b64:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'filename and content required'}).encode('utf-8'))
                return
            uploads_dir = os.path.join(BASE_DIR, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            safe_name = filename.replace('..', '').replace('/', '_').replace('\\', '_')
            dest_name = f"{int(datetime.datetime.utcnow().timestamp()*1000)}_{safe_name}"
            dest = os.path.join(uploads_dir, dest_name)
            try:
                blob = base64.b64decode(content_b64)
                with open(dest, 'wb') as f:
                    f.write(blob)
                cur = conn.execute('INSERT INTO documents (filename, path, uploaded_by) VALUES (?, ?, ?)', (filename, dest, None))
                conn.commit()
                self._set_headers(201)
                self.wfile.write(json.dumps({'id': cur.lastrowid, 'path': dest}).encode('utf-8'))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': 'upload failed', 'message': str(e)}).encode('utf-8'))
            return
        self.send_error(404)

def run(server_class=HTTPServer, handler_class=Handler, port=3000):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f'Starting test HTTP server on port {port}...')
    httpd.serve_forever()

if __name__ == '__main__':
    run()
