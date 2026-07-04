const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, '..', 'db', 'rrhh.db');
const SECRET = process.env.RRHH_SECRET || 'dev_secret_change_me';

if (!fs.existsSync(DB_FILE)) {
  console.error('Database file not found. Run `npm run init-db` from backend folder.');
  process.exit(1);
}

const db = new Database(DB_FILE, { verbose: console.log });

const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(fileUpload({ createParentPath: true }));

// Health check endpoints (public)
app.get('/', (req, res) => {
  res.send('RRHH backend running');
});
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Helper: auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token missing' });
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Auth endpoints
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'user exists' });
  const hash = bcrypt.hashSync(password, 8);
  const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'user');
  const user = { id: info.lastInsertRowid, username };
  const token = jwt.sign(user, SECRET, { expiresIn: '12h' });
  res.json({ user, token });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const row = db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').get(username);
  if (!row) return res.status(401).json({ error: 'invalid credentials' });
  let ok = false;
  try { ok = bcrypt.compareSync(password, row.password_hash); } catch (e) { ok = false; }
  // Fallback: if stored hash looks like SHA-256 (hex length 64), compare and migrate to bcrypt
  if (!ok && row.password_hash && String(row.password_hash).length === 64) {
    const sha = crypto.createHash('sha256').update(password).digest('hex');
    if (sha === row.password_hash) {
      ok = true;
      try {
        const newHash = bcrypt.hashSync(password, 8);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, row.id);
        console.log('Migrated user', username, 'to bcrypt hash');
      } catch (e) { console.warn('Could not migrate hash for', username, e); }
    }
  }
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const user = { id: row.id, username: row.username, role: row.role };
  const token = jwt.sign(user, SECRET, { expiresIn: '12h' });
  res.json({ user, token });
});

// Meetings CRUD
app.get('/api/meetings', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM meetings ORDER BY datetime DESC').all();
  res.json(rows);
});

app.post('/api/meetings', authenticateToken, (req, res) => {
  const { title, datetime, description } = req.body;
  if (!title || !datetime) return res.status(400).json({ error: 'title and datetime required' });
  const info = db.prepare('INSERT INTO meetings (title, datetime, description, created_by) VALUES (?, ?, ?, ?)').run(title, datetime, description || '', req.user.id);
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/meetings/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { title, datetime, description, video_requested, video_approved } = req.body;
  db.prepare('UPDATE meetings SET title = ?, datetime = ?, description = ?, video_requested = ?, video_approved = ? WHERE id = ?')
    .run(title, datetime, description || '', video_requested ? 1 : 0, video_approved ? 1 : 0, id);
  res.json({ ok: true });
});

app.delete('/api/meetings/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Announcements
app.get('/api/announcements', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY scheduled_at DESC').all();
  res.json(rows);
});
app.post('/api/announcements', authenticateToken, (req, res) => {
  const { text, scheduled_at } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const info = db.prepare('INSERT INTO announcements (text, scheduled_at, created_by) VALUES (?, ?, ?)').run(text, scheduled_at || null, req.user.id);
  res.json({ id: info.lastInsertRowid });
});

// Messages (chat)
app.get('/api/messages', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT m.*, u.username FROM messages m LEFT JOIN users u ON u.id = m.from_user ORDER BY created_at ASC').all();
  res.json(rows);
});
app.post('/api/messages', authenticateToken, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const info = db.prepare('INSERT INTO messages (from_user, message) VALUES (?, ?)').run(req.user.id, message);
  res.json({ id: info.lastInsertRowid });
});

// Sensor positions
app.get('/api/sensors/positions', authenticateToken, (req, res) => {
  const rows = db.prepare('SELECT * FROM sensor_positions ORDER BY ts DESC LIMIT 100').all();
  res.json(rows);
});
app.post('/api/sensors/positions', authenticateToken, (req, res) => {
  const { device_id, lat, lng, accuracy, altitude, altitude_accuracy, speed, heading, ts } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof ts === 'undefined') {
    return res.status(400).json({ error: 'lat,lng,ts required (ts as integer ms)' });
  }
  const info = db.prepare('INSERT INTO sensor_positions (device_id, lat, lng, accuracy, altitude, altitude_accuracy, speed, heading, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(device_id || null, lat, lng, accuracy || null, altitude || null, altitude_accuracy || null, speed || null, heading || null, ts);
  res.json({ id: info.lastInsertRowid });
});

// File upload (documents/images)
app.post('/api/upload', authenticateToken, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) return res.status(400).json({ error: 'No files were uploaded.' });
    const upload = req.files.file;
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    const filename = Date.now() + '_' + upload.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dest = path.join(uploadsDir, filename);
    await upload.mv(dest);
    // save metadata
    const info = db.prepare('INSERT INTO documents (filename, path, uploaded_by) VALUES (?, ?, ?)').run(upload.name, dest, req.user.id);
    res.json({ id: info.lastInsertRowid, path: dest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'upload failed' });
  }
});

// Basic user listing (admin)
app.get('/api/users', authenticateToken, (req, res) => {
  // allow only admin
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  const rows = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
  res.json(rows);
});

// Documents listing
app.get('/api/documents', authenticateToken, (req, res) => {
  const q = req.query.q;
  if (q) {
    const rows = db.prepare('SELECT d.*, u.username as uploaded_by_username FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.filename LIKE ? OR d.employee LIKE ? ORDER BY uploaded_at DESC').all(`%${q}%`, `%${q}%`);
    return res.json(rows);
  }
  const rows = db.prepare('SELECT d.*, u.username as uploaded_by_username FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY uploaded_at DESC').all();
  res.json(rows);
});

// Audit logs (admin only)
app.get('/api/audits', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  const q = req.query.q;
  if (q) {
    const rows = db.prepare('SELECT a.*, u.username as user FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.action LIKE ? OR a.details LIKE ? ORDER BY created_at DESC').all(`%${q}%`, `%${q}%`);
    return res.json(rows);
  }
  const rows = db.prepare('SELECT a.*, u.username as user FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY created_at DESC').all();
  res.json(rows);
});

// All data (admin only) - returns all main tables in one payload
app.get('/api/all-data', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  try {
    const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
    const audit_logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC').all();
    const documents = db.prepare('SELECT d.*, u.username as uploaded_by_username FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY uploaded_at DESC').all();
    const meetings = db.prepare('SELECT * FROM meetings ORDER BY datetime DESC').all();
    const announcements = db.prepare('SELECT * FROM announcements ORDER BY scheduled_at DESC').all();
    const messages = db.prepare('SELECT m.*, u.username FROM messages m LEFT JOIN users u ON u.id = m.from_user ORDER BY created_at ASC').all();
    const sensor_positions = db.prepare('SELECT * FROM sensor_positions ORDER BY ts DESC LIMIT 1000').all();
    const images = db.prepare('SELECT * FROM images ORDER BY uploaded_at DESC').all();
    res.json({ users, audit_logs, documents, meetings, announcements, messages, sensor_positions, images });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to fetch all data' });
  }
});

// Serve frontend static files from project root (allows /admin.html access)
app.use(express.static(path.join(__dirname, '..')));

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.listen(PORT, () => {
  console.log(`RRHH backend listening on ${PORT}`);
});
