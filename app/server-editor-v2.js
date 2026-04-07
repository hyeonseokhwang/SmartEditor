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
const PORT = process.env.EDITOR_PORT_V2 || 9082;

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
app.get('/', (req, res) => res.render('editor-v2'));

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

    // 로컬 파일 경로 업로드 (HWP 붙여넣기 시 file:/// URL에서 추출한 temp 파일)
    const { filePath } = req.body;
    if (filePath && typeof filePath === 'string') {
      // file:/// URL 프리픽스 제거 (브라우저 file:/// → 서버 파일시스템 경로 변환)
      let cleanPath = filePath;
      if (cleanPath.startsWith('file:///')) {
        cleanPath = cleanPath.slice(8); // 'file:///' 제거
        if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1); // leading slash 제거
        cleanPath = cleanPath.replace(/\//g, '\\'); // forward slash → backslash
      }
      // 보안: temp 디렉토리만 허용
      const resolved = path.resolve(cleanPath);
      const tempDir = path.resolve(process.env.TEMP || process.env.TMP || 'C:\\Users\\hysra\\AppData\\Local\\Temp');
      if (!resolved.startsWith(tempDir)) {
        return res.status(403).json({ error: 'filePath must be in temp directory' });
      }
      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: 'File not found: ' + path.basename(resolved) });
      }
      if (hasCloudinary) {
        try {
          const r = await cloudinary.uploader.upload(resolved, {
            folder: 'Hanwool', public_id: uuidv4(), resource_type: 'auto',
          });
          console.log('[upload] filePath OK:', path.basename(resolved), '->', r.secure_url);
          return res.json({ url: r.secure_url });
        } catch (uploadErr) {
          console.error('[upload] filePath Cloudinary error:', uploadErr.message);
          return res.status(400).json({ error: uploadErr.message || 'Cloudinary upload failed' });
        }
      }
      // 로컬 fallback
      const ext = path.extname(resolved).replace('.', '') || 'jpg';
      const name = `${uuidv4()}.${ext}`;
      fs.copyFileSync(resolved, path.join(UPLOADS_DIR, name));
      return res.json({ url: `/public/uploads/${name}` });
    }

    // base64 dataUrl 업로드
    const { dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'No file or dataUrl' });
    }

    if (hasCloudinary) {
      let uploadDataUrl = dataUrl;
      // WMF/EMF 등 비표준 포맷은 Cloudinary가 거부 → PNG로 변환 시도
      const mimeMatch = dataUrl.match(/^data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1].toLowerCase() : '';
      const unsupportedFmts = ['image/x-wmf', 'image/wmf', 'image/x-emf', 'image/emf', 'image/x-bmp'];
      if (unsupportedFmts.includes(mime) || (mime && !mime.startsWith('image/'))) {
        // 지원 불가 포맷 — 스킵
        return res.status(400).json({ error: `Unsupported image format: ${mime}` });
      }
      let r;
      try {
        r = await cloudinary.uploader.upload(uploadDataUrl, {
          folder: 'Hanwool', public_id: uuidv4(), resource_type: 'image',
        });
      } catch (uploadErr) {
        console.error('[upload] Cloudinary error:', uploadErr.message || uploadErr);
        return res.status(400).json({ error: uploadErr.message || 'Cloudinary upload failed' });
      }
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

// 클립보드 분석 데이터 수신 — Lucas 직접 지시: 에이전트가 클립보드 데이터를 읽을 수 있도록
const CLIP_LOG_DIR = path.join(__dirname, '..', 'public', 'clipboard-logs');
if (!fs.existsSync(CLIP_LOG_DIR)) fs.mkdirSync(CLIP_LOG_DIR, { recursive: true });

app.post('/api/log/clipboard', express.json({ limit: '50mb' }), (req, res) => {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `clip-${ts}.json`;
    const data = {
      timestamp: new Date().toISOString(),
      ...req.body,
    };
    fs.writeFileSync(path.join(CLIP_LOG_DIR, filename), JSON.stringify(data, null, 2), 'utf8');
    console.log('[clipboard] logged:', filename, '| htmlLen:', req.body.htmlLen, '| rtfLen:', req.body.rtfLen, '| images:', req.body.fileImgCount);
    res.json({ ok: true, filename });
  } catch (err) {
    console.error('[clipboard]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/log/clipboard', (req, res) => {
  try {
    const files = fs.readdirSync(CLIP_LOG_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    if (req.query.latest) {
      if (!files.length) return res.json({ error: 'no logs' });
      const data = JSON.parse(fs.readFileSync(path.join(CLIP_LOG_DIR, files[0]), 'utf8'));
      return res.json(data);
    }
    res.json({ files, count: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 이미지 감사 API — GET /api/posts/:postId/image-audit
app.get('/api/posts/:postId/image-audit', async (req, res) => {
  try {
    const post = await pool.query('SELECT content_html FROM yeouiseonwon.posts WHERE post_id = $1', [req.params.postId]);
    if (!post.rows.length) return res.status(404).json({ error: 'Not found' });
    const html = post.rows[0].content_html || '';
    const details = [];
    const imgTagRe = /<img\b([^>]*)>/gi;
    let m;
    while ((m = imgTagRe.exec(html)) !== null) {
      const srcM = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(m[1]);
      const src = srcM ? srcM[1] : '';
      let status;
      if (!src) status = 'broken';
      else if (/^https?:\/\//i.test(src)) status = 'uploaded';
      else status = 'pending';
      const preview = src.length > 120 ? src.slice(0, 120) + '…' : src;
      details.push({ src: preview, status });
    }
    const total    = details.length;
    const uploaded = details.filter(d => d.status === 'uploaded').length;
    const pending  = details.filter(d => d.status === 'pending').length;
    const broken   = details.filter(d => d.status === 'broken').length;
    res.json({ total, uploaded, pending, broken, details });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 클립보드 디버그 로그 — 전체 데이터 메모리 저장 + 파일 백업
const CLIPBOARD_LOG_DIR = path.join(__dirname, '..', 'public', 'clipboard-logs');
fs.mkdirSync(CLIPBOARD_LOG_DIR, { recursive: true });
let lastClipboardData = null;

app.post('/api/log/clipboard', (req, res) => {
  const body = req.body;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  lastClipboardData = { ts, ...body };
  // 파일 저장 (base64 데이터 포함 전체)
  const fpath = path.join(CLIPBOARD_LOG_DIR, `clipboard-${ts}.json`);
  try { fs.writeFileSync(fpath, JSON.stringify(lastClipboardData, null, 2)); } catch(e) {}
  console.log('[SE2][clipboard]', ts, '| htmlLen:', body.htmlLen, '| rtfLen:', body.rtfLen,
    '| fileImgs:', body.fileImgCount, '| hwpJson:', body.hwpJsonImages,
    '| rtf:', body.rtfImages, '| htmlData:', body.htmlDataImages,
    '| hwpMeta:', body.hwpMeta ? `bidt:${Object.keys(body.hwpMeta.bidtKeys||{}).length} srOrder:${(body.hwpMeta.srOrder||[]).length}` : 'none');
  res.json({ ok: true, saved: fpath });
});

// 클립보드 분석 조회 — GET /api/debug/clipboard
app.get('/api/debug/clipboard', (req, res) => {
  if (!lastClipboardData) {
    // 파일에서 가장 최근 것 로드
    try {
      const files = fs.readdirSync(CLIPBOARD_LOG_DIR).filter(f => f.endsWith('.json')).sort();
      if (files.length) {
        const latest = path.join(CLIPBOARD_LOG_DIR, files[files.length - 1]);
        lastClipboardData = JSON.parse(fs.readFileSync(latest, 'utf8'));
      }
    } catch(e) {}
  }
  if (!lastClipboardData) return res.status(404).json({ error: 'No clipboard data recorded yet' });
  const d = lastClipboardData;
  const meta = d.hwpMeta || {};
  const bidtKeys = Object.keys(meta.bidtKeys || {});
  const srOrder = meta.srOrder || [];
  const missingInBidt = srOrder.filter(sr => !meta.bidtKeys || meta.bidtKeys[sr] === undefined);
  res.json({
    ts: d.ts,
    htmlLen: d.htmlLen,
    rtfLen: d.rtfLen,
    fileImgCount: d.fileImgCount,
    fileUrlNames: d.fileUrlNames || [],
    sources: {
      hwpJson: d.hwpJsonImages,
      rtf: d.rtfImages,
      htmlData: d.htmlDataImages,
      clipboardFiles: d.clipboardFiles,
    },
    hwpMeta: {
      bidtKeyCount: bidtKeys.length,
      srOrderCount: srOrder.length,
      matched: meta.matched,
      missingInBidt,
      bidtKeys,
      srOrder,
    },
    analysis: {
      shortfall: (d.fileImgCount || 0) - (d.hwpJsonImages || 0),
      reason: missingInBidt.length > 0
        ? `HWP JSON bidt에 ${missingInBidt.length}개 키 없음 → file:/// 만 존재`
        : (d.fileImgCount || 0) > (d.hwpJsonImages || 0)
          ? 'HWP JSON 이미지 수 < file:/// 태그 수 — 대량 복사 한계'
          : 'OK',
    }
  });
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
