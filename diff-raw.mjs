import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('G:/WorkSpace/HomePage/Hanwool/public/clipboard-logs/raw-2026-04-08T01-12-29-303Z.json', 'utf8'));
console.log('=== 메타 ===');
console.log('clipHTMLLen:', raw.clipHTMLLen);
console.log('clipRTFLen:', raw.clipRTFLen);
console.log('imageCount:', raw.imageCount);
console.log('fileUrlCount:', raw.fileUrlCount);

const html = raw.clipHTML || '';

// 1. file:/// img 태그 순서 + width/height 포함
const fileUrls = [];
const imgRe = /<img([^>]+)>/gi;
let m;
while ((m = imgRe.exec(html)) !== null) {
  const attrs = m[1];
  const srcM = attrs.match(/src=["']?(file:\/\/\/[^"' >]+)/i);
  if (!srcM) continue;
  const full = srcM[1];
  const fn = full.split('/').pop();
  const wM = attrs.match(/width=["']?(\d+)/i);
  const hM = attrs.match(/height=["']?(\d+)/i);
  const styleM = attrs.match(/style=["']([^"']+)/i);
  fileUrls.push({slot: fileUrls.length, fn, full, width: wM?wM[1]:null, height: hM?hM[1]:null, style: styleM?styleM[1]:null});
}
console.log('\n=== HTML file:/// img 순서 (' + fileUrls.length + '개) + 메타 ===');
fileUrls.forEach(f => console.log(`slot[${f.slot}]: ${f.fn} | w=${f.width} h=${f.height} | style=${f.style}`));

// 2. HWP JSON 파싱 - bidt + srOrder + 각 bi 노드의 메타
const jsonM = html.match(/<!--\[data-hwpjson\]\s*(\{[\s\S]*?\})\s*-->/i);
if (!jsonM) { console.log('\nHWP JSON 없음'); process.exit(0); }
const root = JSON.parse(jsonM[1]);
const bidt = {};
const srOrderMeta = [];

function collect(obj, path) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.bidt && typeof obj.bidt === 'object') {
    for (const k in obj.bidt) {
      if (typeof obj.bidt[k] === 'string' && obj.bidt[k].length > 50) bidt[k] = obj.bidt[k].length;
    }
  }
  if (typeof obj.bi === 'string') {
    srOrderMeta.push({sr: obj.bi, ctx: 'bi-string', w: obj.w, h: obj.h, wx: obj.wx, hx: obj.hx, dpi: obj.dpi, sz: obj.sz});
  }
  if (Array.isArray(obj.bi)) {
    for (const b of obj.bi) {
      if (b && typeof b.sr === 'string') {
        srOrderMeta.push({sr: b.sr, ctx: 'bi-array', w: b.w, h: b.h, wx: b.wx, hx: b.hx, dpi: b.dpi, sz: b.sz});
      }
    }
  }
  for (const key in obj) if (Object.prototype.hasOwnProperty.call(obj, key)) collect(obj[key], path + '.' + key);
}
collect(root, 'root');

console.log('\n=== bidt 고유 키 (' + Object.keys(bidt).length + '개) ===');
Object.keys(bidt).forEach((k,i) => console.log(`[${i}] ${k} (len=${bidt[k]})`));

console.log('\n=== srOrder DFS 전체 (' + srOrderMeta.length + '개) + 메타 ===');
srOrderMeta.forEach((s,i) => {
  const inBidt = bidt[s.sr] ? 'IN_BIDT' : 'NOT_IN_BIDT';
  console.log(`[${i}] sr=${s.sr} ${inBidt} | w=${s.w} h=${s.h} wx=${s.wx} hx=${s.hx} dpi=${s.dpi} sz=${s.sz}`);
});

// 3. dedup 후 slot 매핑
const seen = {};
const mapped = [];
for (const meta of srOrderMeta) {
  if (seen[meta.sr]) continue;
  if (bidt[meta.sr]) { seen[meta.sr] = true; mapped.push(meta); }
}
console.log('\n=== dedup 후 slot 매핑 (' + mapped.length + '개) vs HTML (' + fileUrls.length + '개) ===');
for (let i = 0; i < Math.max(fileUrls.length, mapped.length); i++) {
  const hs = fileUrls[i];
  const ds = mapped[i];
  const ok = hs && ds ? 'OK' : '★누락★';
  console.log(`slot[${i}]: HTML=${hs?hs.fn:'(없음)'} w=${hs?hs.width:'-'} h=${hs?hs.height:'-'} | data=${ds?ds.sr:'(없음)'} w=${ds?ds.w:'-'} h=${ds?ds.h:'-'} wx=${ds?ds.wx:'-'} hx=${ds?ds.hx:'-'} ${ok}`);
}
