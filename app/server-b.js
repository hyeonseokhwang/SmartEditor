import express from 'express';
import path from 'path';
import multer from 'multer';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import https from 'https';
import http from 'http';
import pg from 'pg';
import OpenAI from 'openai';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
dotenv.config({ path: 'G:\\Lucas-Initiative\\.env', override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT_B || 8081;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');
app.set('view cache', false);

// ── DB: hanul_thought ──────────────────────────────────────────
const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'hanul_thought',
  user: 'postgres',
  password: 'postgres',
});

// ── OpenAI (lazy init) ─────────────────────────────────────────
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

// ── Cloudinary ─────────────────────────────────────────────────
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
}

let upload;
if (hasCloudinary) {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async () => ({
      folder: 'Hanwool',
      public_id: uuidv4(),
      resource_type: 'image',
      overwrite: false,
    }),
  });
  upload = multer({ storage });
} else {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(__dirname, '..', 'public', 'uploads');
      try { if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true }); } catch {}
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '.png');
      cb(null, `${uuidv4()}${ext}`);
    },
  });
  upload = multer({ storage });
}

// ════════════════════════════════════════════════════════════════
//  PAGES
// ════════════════════════════════════════════════════════════════

// / → B팀(siann-17) 메인
app.get('/', (req, res) => {
  const theme = parseInt(req.query.theme) || 1;
  res.render('siann-17', { themeId: theme, layoutId: 17, showNav: false });
});

// /archive → 아카이브 페이지
app.get('/archive', (req, res) => res.render('archive'));

// /chat → AI 챗봇 페이지
app.get('/chat', (req, res) => res.render('chat'));

// /editor → Toast UI 스마트에디터
app.get('/editor', (req, res) => res.render('editor'));

// ════════════════════════════════════════════════════════════════
//  ARCHIVE API
// ════════════════════════════════════════════════════════════════

app.get('/api/boards', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT board, COUNT(*) as count FROM yeouiseonwon.posts GROUP BY board ORDER BY count DESC'
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/posts', async (req, res) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const board  = req.query.board  || null;
    const search = req.query.search || null;

    const where = []; const params = []; let idx = 1;
    if (board)  { where.push(`p.board = $${idx++}`); params.push(board); }
    if (search) { where.push(`(p.title ILIKE $${idx} OR p.content ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = parseInt((await pool.query(`SELECT COUNT(*) FROM yeouiseonwon.posts ${wc}`, params)).rows[0].count);
    const rows  = (await pool.query(
      `SELECT p.id, p.post_id, p.board, p.title, p.author,
              LEFT(p.content, 200) as preview, p.created_at, p.image_urls,
              COALESCE(c.cnt, 0) as comment_count
       FROM yeouiseonwon.posts p
       LEFT JOIN (SELECT post_id, COUNT(*) cnt FROM yeouiseonwon.comments GROUP BY post_id) c ON c.post_id = p.post_id
       ${wc} ORDER BY p.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    )).rows;
    res.json({ posts: rows, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/posts/:postId', async (req, res) => {
  try {
    const post = await pool.query('SELECT * FROM yeouiseonwon.posts WHERE post_id = $1', [req.params.postId]);
    if (!post.rows.length) return res.status(404).json({ error: 'Not found' });
    const comments = await pool.query(
      'SELECT * FROM yeouiseonwon.comments WHERE post_id = $1 ORDER BY created_at ASC',
      [req.params.postId]
    );
    res.json({ ...post.rows[0], comments: comments.rows });
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

app.get('/api/stats', async (req, res) => {
  try {
    const [posts, wc, cmt, dr] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM yeouiseonwon.posts'),
      pool.query("SELECT COUNT(*) FROM yeouiseonwon.posts WHERE content IS NOT NULL AND content != ''"),
      pool.query('SELECT COUNT(*) FROM yeouiseonwon.comments'),
      pool.query('SELECT MIN(created_at) oldest, MAX(created_at) newest FROM yeouiseonwon.posts'),
    ]);
    res.json({
      totalPosts: parseInt(posts.rows[0].count),
      postsWithContent: parseInt(wc.rows[0].count),
      totalComments: parseInt(cmt.rows[0].count),
      oldestPost: dr.rows[0].oldest,
      newestPost: dr.rows[0].newest,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
//  AI CHATBOT API
// ════════════════════════════════════════════════════════════════

app.post('/api/chat', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });

    const openai = getOpenAI();

    // 1) 임베딩
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    });
    const vecStr = '[' + embRes.data[0].embedding.join(',') + ']';

    // 2) 키워드 추출 — 단어 단위 접미사 제거 (개별 글자 제거 금지)
    const suffixRe = /(이란말|이란요|이에요|입니까|합니까|인가요|어떻게|이란\?|이란|란게|란말|이죠|이냐|이며|이고|이지|이다|이에|에서|으로|이요|가요|까요|이가|이는|이를|은요|는요|을까|무엇|어떤|란)$/;
    const keywords = question
      .replace(/[?？！!.,。、]/g, '')
      .split(/\s+/)
      .map(w => w.replace(suffixRe, '').trim())
      .filter(w => /[가-힣]{2,}/.test(w))
      .sort((a,b) => b.length - a.length)
      .slice(0, 3);
    const mainKeyword = keywords[0] || question.replace(/[?？！!.,。、\s]/g,'').slice(0, 6);

    // 3) pgvector + posts 하이브리드 검색
    const postWhere = keywords.length > 1
      ? keywords.map((_,i) => `content ILIKE $${i+1}`).join(' OR ')
      : `content ILIKE $1`;
    const postParams = keywords.length > 1
      ? keywords.map(k => `%${k.replace(/[%_]/g,'\\$&')}%`)
      : [`%${mainKeyword.replace(/[%_]/g,'\\$&')}%`];

    const [chunks, postResults] = await Promise.all([
      pool.query(
        `SELECT chunk_text, book_name, 1-(embedding <=> $1::vector) AS similarity
         FROM yeouiseonwon.book_chunks
         ORDER BY embedding <=> $1::vector LIMIT 10`,
        [vecStr]
      ),
      pool.query(
        `SELECT title, LEFT(content, 800) AS excerpt, board, created_at
         FROM yeouiseonwon.posts
         WHERE (${postWhere}) AND content IS NOT NULL AND content != ''
         ORDER BY created_at DESC LIMIT 5`,
        postParams
      ).catch(() => ({ rows: [] })),
    ]);

    // 유사도 0.25 이상 청크 우선, 미달 시 상위 5개 유지
    const goodChunks = chunks.rows.filter(r => r.similarity >= 0.25);
    const useChunks  = goodChunks.length >= 2 ? goodChunks : chunks.rows.slice(0, 5);

    const chunkCtx = useChunks.map((r,i) => `[경전${i+1}] (${r.book_name})\n${r.chunk_text}`).join('\n\n');
    const postCtx  = postResults.rows.length
      ? '\n\n[카페 게시글]\n' + postResults.rows.map((r,i) =>
          `[게시글${i+1}] (${r.board} · ${r.title})\n${r.excerpt}`
        ).join('\n\n')
      : '';

    const context = chunkCtx + postCtx;

    // 4) GPT 답변
    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: [
            '당신은 여의선원 한울사상 전문 안내자입니다.',
            '아래 원문 자료(경전 구절·카페 게시글)를 최대한 활용하여 구체적이고 친절하게 답변하세요.',
            '자료에 관련 내용이 있으면 원문을 직접 인용하며 설명하세요.',
            '자료에 전혀 없는 내용일 때만 "자료에서 확인하기 어렵습니다"라고 하세요.',
            '동학·시천주·한울님·인내천·천도교는 한울사상과 별개이니 언급하지 마세요.',
            '답변 끝에 출처(경전N / 게시글N)를 밝혀주세요.',
          ].join(' '),
        },
        { role: 'user', content: `참고 자료:\n${context}\n\n질문: ${question}` },
      ],
      max_tokens: 1000,
    });

    pool.query(
      'INSERT INTO yeouiseonwon.chat_questions (question, answered) VALUES ($1, TRUE)',
      [question]
    ).catch(() => {});

    const answer = chat.choices[0].message.content;
    res.json({ answer, sources: useChunks.map(r => ({ book: r.book_name, similarity: r.similarity })) });
  } catch (e) {
    console.error('[chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  IMAGE PROXY & UPLOAD
// ════════════════════════════════════════════════════════════════

app.get('/api/img-proxy', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('missing url');
  const allowed = ['postfiles.pstatic.net', 'cafeptthumb-phinf.pstatic.net', 'cafeptthumb.pstatic.net', 'blogfiles.pstatic.net', 'pstatic.net'];
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return res.status(400).send('invalid url'); }
  if (!allowed.some(d => parsedUrl.hostname.endsWith(d))) return res.status(403).send('domain not allowed');
  const client2 = parsedUrl.protocol === 'https:' ? https : http;
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    headers: { 'Referer': 'https://cafe.naver.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  };
  client2.get(options, (imgRes) => {
    res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    imgRes.pipe(res);
  }).on('error', (e) => res.status(502).send(e.message));
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (req.file && req.file.path && !hasCloudinary) {
      return res.json({ url: `/public/uploads/${path.basename(req.file.path)}` });
    }
    if (req.file && req.file.path && hasCloudinary) {
      return res.json({ url: req.file.path || req.file.secure_url });
    }
    const { dataUrl } = req.body;
    if (!dataUrl) return res.status(400).json({ error: 'No dataUrl' });
    if (hasCloudinary) {
      const r = await cloudinary.uploader.upload(dataUrl, { folder: 'Hanwool', public_id: uuidv4(), resource_type: 'image' });
      return res.json({ url: r.secure_url });
    } else {
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (!match) return res.status(400).json({ error: 'Invalid data URL' });
      const ext = match[1].split('/')[1] || 'png';
      const name = `${uuidv4()}.${ext}`;
      const dest = path.join(__dirname, '..', 'public', 'uploads');
      const fsp = await import('fs/promises');
      await fsp.mkdir(dest, { recursive: true });
      await fsp.writeFile(path.join(dest, name), Buffer.from(match[2], 'base64'));
      return res.json({ url: `/public/uploads/${name}` });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`한울사상 B안 서버 http://0.0.0.0:${PORT}`);
  console.log('  /        — B팀 홈페이지 (siann-17)');
  console.log('  /archive — 아카이브');
  console.log('  /chat    — AI 챗봇');
  console.log('  /editor  — 스마트에디터');
});
