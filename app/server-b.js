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

    // 2) 키워드 추출 — 단어 단위 접미사 제거 + 질문용 불용어 제거
    const suffixRe = /(이란|란|이란요|이에요|입니까|합니까|인가요|이죠|이냐|이며|이고|이지|이다|이에|에서|으로|이요|가요|까요|이가|이는|이를|은요|는요|을까|이란말|란게|란말)$/;
    const stopWords = new Set(['무엇','어떤','어떻게','알려','주세요','설명','대해','관련','좀','어디','여기','저기','뭔가','무슨','왜','언제','누구','어디서','어떤','어떠']);
    const koreanRe = /[\uAC00-\uD7AF]{2,}/;
    const keywords = question
      .replace(/[?？！!.,。、]/g, '')
      .split(/\s+/)
      .map(w => w.replace(suffixRe, '').trim())
      .filter(w => w.length >= 2 && koreanRe.test(w) && !stopWords.has(w))
      .sort((a,b) => b.length - a.length)
      .slice(0, 3);
    const mainKeyword = keywords[0] || question.replace(/[?？！!.,。、\s]/g,'').slice(0, 6);

    // 3) 3중 하이브리드 검색: 경전 pgvector + 게시글 pgvector + 게시글 키워드
    const postKeywordWhere = keywords.length > 1
      ? keywords.map((_,i) => `(content ILIKE $${i+1} OR title ILIKE $${i+1})`).join(' OR ')
      : `(content ILIKE $1 OR title ILIKE $1)`;
    const postKeywordParams = keywords.length > 1
      ? keywords.map(k => `%${k.replace(/[%_]/g,'\\$&')}%`)
      : [`%${mainKeyword.replace(/[%_]/g,'\\$&')}%`];

    const [chunks, postsByVec, postsByKw] = await Promise.all([
      pool.query(
        `SELECT chunk_text, book_name, 1-(embedding <=> $1::vector) AS similarity
         FROM yeouiseonwon.book_chunks
         ORDER BY embedding <=> $1::vector LIMIT 8`,
        [vecStr]
      ),
      pool.query(
        `SELECT title, LEFT(content, 1000) AS excerpt, board, created_at,
                1-(embedding <=> $1::vector) AS similarity
         FROM yeouiseonwon.posts
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector LIMIT 8`,
        [vecStr]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT title, LEFT(content, 1000) AS excerpt, board, created_at
         FROM yeouiseonwon.posts
         WHERE (${postKeywordWhere}) AND content IS NOT NULL AND content != ''
         ORDER BY created_at DESC LIMIT 8`,
        postKeywordParams
      ).catch(() => ({ rows: [] })),
    ]);

    const goodChunks = chunks.rows.filter(r => r.similarity >= 0.30);
    const useChunks  = goodChunks.length >= 2 ? goodChunks : chunks.rows.slice(0, 5);

    const seenTitles = new Set();
    const allPosts = [];
    for (const r of postsByVec.rows) {
      if (r.similarity >= 0.35 && !seenTitles.has(r.title)) {
        seenTitles.add(r.title);
        allPosts.push({ ...r, source: 'vec' });
      }
    }
    for (const r of postsByKw.rows) {
      if (!seenTitles.has(r.title)) {
        seenTitles.add(r.title);
        allPosts.push({ ...r, source: 'kw' });
      }
    }
    const usePosts = allPosts.slice(0, 8);

    const chunkCtx = useChunks.map((r,i) => `[경전${i+1}] (${r.book_name})\n${r.chunk_text}`).join('\n\n');
    const postCtx  = usePosts.length
      ? '\n\n[카페 게시글 — 큰스승님 법문 및 수행 기록]\n' + usePosts.map((r,i) =>
          `[게시글${i+1}] (${r.board} · ${r.title})\n${r.excerpt}`
        ).join('\n\n')
      : '';

    const context = chunkCtx + postCtx;

    // 4) GPT 답변 — 원문 기반 정확한 답변 (gpt-4o 고품질)
    const chat = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: [
            '당신은 여의선원(여의명상센터) 한울사상 전문 안내자입니다.',
            '한울사상은 김준원 큰스승님이 창시한 독자적인 영성 사상 체계로,',
            '여의선원과 여의명상센터를 통해 가르쳐지고 있습니다.',
            '',
            '## 한울사상 핵심 개념:\n',
            '- 한울사상: 한올들이 어울려 한울이 된다는 사상. 개체(한올)가 전체(한울)와 조화를 이루는 우주관.',
            '- 수도(修道): 닦아가는 길. 시도→수도→제도의 단계적 수행 체계.',
            '- 생명장(生命場): 생명체의 몸氣(몸을 운영하는 기운)와 영기(靈氣:영혼의 기운)와 지기(地氣:터전과 환경의 기운)의 조합이 이루어내는 氣의 장(場).',
            '- 제도(濟度): 영격을 높이는 것. 삶은 궁극적으로 영적진화를 통해 영격을 높이는데 목적이 있음.',
            '- 우주영제도: 개체의 영을 우주영으로 높이기 위한 제도법.',
            '- 각성(覺醒): 유○론적 각성법. 우주 궁극의 실체를 ○으로 보는 우주관에서 개체 인식이 깨어남.',
            '- 성멸(性滅): 사람의 성(性)을 소멸하는 수행. 성멸제도·성멸오통으로 이어짐.',
            '- 성멸제도(性滅濟度): 사람 성·사람 정을 소멸하여 영격을 높이는 제도.',
            '- 성멸오통(性滅五通): 성(性)에 묶이지 않고 초월하여 전체와 통하는 다섯 가지 통달.',
            '- 큰스승님: 한울 김준원 큰스승님. 한울사상 창시자. 집중수도와 법문을 통해 직접 지도. 한울기 82년 탄강일(음력 9.19) 기념.',
            '- 무견(無見) 김상국 법사: 큰스승님으로부터 유○론적 각성법 수행법을 지도받아 여의수행법을 체계화. 「한울말씀강론」 저자.',
            '- 법사(法師): 여의선원에서 큰스승님의 가르침을 전하고 수행을 지도하는 직위. 도정법사·명제법사·도봉법사 등이 있음. 집중수도 사회·기도문 봉독·점검 역할.',
            '- 한울계시록: 큰스승님의 계시를 기록한 경전. 절(節) 단위로 구성.',
            '- 집중수도: 큰스승님 직접 지도 하에 진행하는 집중 수행 과정. 1박2일 정기 운영.',
            '- 영성여행: 수도자들이 특별한 장소(천안 아우내 쉼터, 남한산성, 이천 성지 등)에서 진행하는 영적 수행.',
            '- 기운(氣): 한울사상에서 모든 현상의 근원. 몸氣·영氣·지氣로 나뉨.',
            '- 염(念) 조정: 명상을 통해 생각과 의식을 조절하는 수행법.',
            '- 자동동작: 수행 중 공(空)의 세계에 들어가면 몸이 저절로 움직이는 현상.',
            '- 세상氣조종: 수도자가 세상의 기운을 조절하는 수행.',
            '- 수도자 1인은 세상자 만인이요 중생자 억: 수도자 한 명의 영적 역량이 만인을 구제할 수 있다는 큰스승님 말씀.',
            '',
            '## 경전: 한울말씀강론(김상국 저), O의실체, 한울수행법, 한울수도법, 한울명상록(김준원 저), 한울계시록\n',
            '',
            '## 답변 규칙:\n',
            '1. 제공된 원문 자료([경전N], [게시글N])를 최우선으로 활용하여 답변하세요.',
            '2. 원문을 직접 인용(따옴표)하며 구체적으로 설명하세요.',
            '3. 동학·시천주·인내천·천도교로 환원하지 마세요. 한울사상 고유 체계로만 설명하세요.',
            '4. 자료가 부족하더라도 위의 핵심 개념 지식을 바탕으로 반드시 답변을 제공하세요.',
            '5. 답변 끝에 출처([경전N] 또는 [게시글N])를 밝히세요. 자료 없이 답변 시 "(한울사상 핵심 개념 기반)"을 표기하세요.',
            '6. 친절하고 깊이 있게, 수행자가 실제 도움받을 수 있는 수준으로 답변하세요.',
          ].join('\n'),
        },
        { role: 'user', content: `## 참고 자료\n${context}\n\n## 질문\n${question}` },
      ],
      max_tokens: 1800,
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
