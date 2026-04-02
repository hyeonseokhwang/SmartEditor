import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Cloudinary ──
const hasCloudinary = process.env.CLOUDINARY_URL || (
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  console.log('[upload] Cloudinary 모드 활성화');
} else {
  console.log('[upload] 로컬 저장 모드 (Cloudinary 키 없음)');
}

// ── Multer 설정 (Cloudinary or 로컬) ──
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let upload;
if (hasCloudinary) {
  const cloudStorage = new CloudinaryStorage({
    cloudinary,
    params: async () => ({
      folder: 'Hanwool',
      public_id: uuidv4(),
      resource_type: 'image',
      overwrite: false,
    }),
  });
  upload = multer({ storage: cloudStorage, limits: { fileSize: 20 * 1024 * 1024 } });
} else {
  const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${uuidv4()}${ext}`);
    },
  });
  upload = multer({ storage: diskStorage, limits: { fileSize: 20 * 1024 * 1024 } });
}

const app = express();
const PORT = process.env.EDITOR_PORT || 8082;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');
app.set('view cache', false);

const pool = new pg.Pool({
  host: 'localhost', port: 5432,
  database: 'hanul_thought',
  user: 'postgres', password: 'postgres',
});

// 에디터 메인
app.get('/', (req, res) => res.render('editor'));

// 게시글 조회 (에디터용)
app.get('/api/posts', async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const board  = req.query.board  || null;
    const search = req.query.search || null;

    const where = []; const params = []; let idx = 1;
    if (board)  { where.push(`board = $${idx++}`); params.push(board); }
    if (search) { where.push(`(title ILIKE $${idx} OR content ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = parseInt((await pool.query(`SELECT COUNT(*) FROM yeouiseonwon.posts ${wc}`, params)).rows[0].count);
    const rows  = (await pool.query(
      `SELECT id, post_id, board, title, author, LEFT(content,200) preview, created_at
       FROM yeouiseonwon.posts ${wc} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    )).rows;
    res.json({ posts: rows, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/posts/:postId', async (req, res) => {
  try {
    const post = await pool.query('SELECT * FROM yeouiseonwon.posts WHERE post_id = $1', [req.params.postId]);
    if (!post.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(post.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/posts/:postId', async (req, res) => {
  try {
    const { content_html, title } = req.body;
    if (!content_html) return res.status(400).json({ error: 'content_html required' });
    const text = content_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    await pool.query(
      `UPDATE yeouiseonwon.posts SET content_html=$2, content=$3, title=COALESCE(NULLIF($4,''),title), crawled_at=NOW() WHERE post_id=$1`,
      [req.params.postId, content_html, text, title || '']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/boards', async (req, res) => {
  try {
    const r = await pool.query('SELECT board, COUNT(*) count FROM yeouiseonwon.posts GROUP BY board ORDER BY count DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 이미지 업로드 (multer 파일 또는 base64 dataUrl) — Cloudinary or 로컬 fallback
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    // multer 파일 업로드
    if (req.file) {
      if (hasCloudinary) {
        const url = req.file.path || req.file.secure_url;
        return res.json({ url });
      }
      return res.json({ url: `/public/uploads/${req.file.filename}` });
    }

    // base64 dataUrl 업로드
    const { dataUrl } = req.body;
    if (!dataUrl) return res.status(400).json({ error: 'No file or dataUrl' });

    if (hasCloudinary) {
      const r = await cloudinary.uploader.upload(dataUrl, {
        folder: 'Hanwool', public_id: uuidv4(), resource_type: 'image',
      });
      return res.json({ url: r.secure_url });
    }

    // 로컬 fallback
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) return res.status(400).json({ error: 'Invalid data URL' });
    const ext = (match[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    const name = `${uuidv4()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(match[2], 'base64'));
    return res.json({ url: `/public/uploads/${name}` });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// 클립보드 디버그 로그
app.post('/api/log/clipboard', (req, res) => {
  console.log('[SE2][clipboard]', JSON.stringify(req.body).slice(0, 200));
  res.json({ ok: true });
});

// 최종 저장 로그
app.post('/api/log/final', (req, res) => {
  console.log('[SE2][final]', JSON.stringify(req.body).slice(0, 200));
  res.json({ verdict: 'pass' });
});

app.listen(PORT, () => {
  console.log(`[hanul-editor] 에디터 서버 포트 :${PORT}`);
  console.log(`  / → editor.ejs`);
});
