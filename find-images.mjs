import pg from 'G:/Lucas-Initiative/command-center/node_modules/pg/lib/index.js';
const { Pool } = pg;
const pool = new Pool({host:'localhost',port:5432,database:'hanul_thought',user:'postgres',password:'postgres'});

const res = await pool.query("SELECT image_urls FROM yeouiseonwon.posts WHERE image_urls IS NOT NULL AND jsonb_array_length(image_urls) > 0 LIMIT 400");

const usedFnames = ['20220607','20220624','20220626','20220702','20220708','20220709','20220701','20220707','1656217586620','0001.jpg','0002.jpg','190954386','195242797','1000017861','1000017872','1000017658','1000017'];
const blackFnames = ['%EB%AA%85%EC%83%81','%EC%8A%A4%EC%BA%94','%EC%9D%98%EB%A1%9C%EC%9B%80','%EB%AA%85%EC%83%81','%EC%B2%9C%EC%9C%A0','%EA%B8%80%EC%94%A8'];

const found = [];
for (const row of res.rows) {
  const urls = Array.isArray(row.image_urls) ? row.image_urls : [];
  for (const u of urls) {
    if (!u || found.length >= 6) continue;
    const fname = String(u).split('/').pop().split('?')[0];
    const isBlack = blackFnames.some(b => fname.includes(b));
    const isUsed = usedFnames.some(u2 => fname.includes(u2));
    const isWhite = /^(KakaoTalk_|Screenshot_|IMG_|[0-9])/.test(fname);
    if (!isBlack && !isUsed && isWhite) {
      found.push(u);
      usedFnames.push(fname.slice(0, 22));
    }
  }
}

found.forEach(u => console.log(u));
await pool.end();
