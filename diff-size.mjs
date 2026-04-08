import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('G:/WorkSpace/HomePage/Hanwool/public/clipboard-logs/raw-2026-04-08T01-12-29-303Z.json', 'utf8'));
const html = raw.clipHTML || '';

// HTML file:/// img 태그 순서 + HTML에서 추출한 width/height
const htmlSlots = [];
const imgRe = /<img([^>]+)>/gi;
let m;
while ((m = imgRe.exec(html)) !== null) {
  const attrs = m[1];
  const srcM = attrs.match(/src=["']?(file:\/\/\/[^"' >]+)/i);
  if (!srcM) continue;
  const fn = srcM[1].split('/').pop();
  const wM = attrs.match(/width=["']?(\d+)/i);
  const hM = attrs.match(/height=["']?(\d+)/i);
  htmlSlots.push({slot: htmlSlots.length, fn, wPx: wM?parseInt(wM[1]):null, hPx: hM?parseInt(hM[1]):null});
}

// HWP JSON 파싱
const jsonM = html.match(/<!--\[data-hwpjson\]\s*(\{[\s\S]*?\})\s*-->/i);
const root = JSON.parse(jsonM[1]);

// bidt: sr → data length
const bidt = {};
for (const k in root.bidt || {}) {
  if (typeof root.bidt[k] === 'string' && root.bidt[k].length > 50) bidt[k] = root.bidt[k].length;
}

// srOrder (dedup)
const srOrder = [];
const seen = {};
function collectSr(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.bidt) {} // skip
  if (typeof obj.bi === 'string') {
    if (!seen[obj.bi] && bidt[obj.bi]) { seen[obj.bi] = true; srOrder.push(obj.bi); }
  }
  if (Array.isArray(obj.bi)) {
    for (const b of obj.bi) {
      if (b && typeof b.sr === 'string' && !seen[b.sr] && bidt[b.sr]) {
        seen[b.sr] = true; srOrder.push(b.sr);
      }
    }
  }
  for (const key in obj) if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'bidt') collectSr(obj[key]);
}
collectSr(root);

// root.cs에서 sr별 크기 메타 추출
// cs 항목 → rc.img.bi → swi(너비), she(높이) in HWPUNIT
// HWPUNIT → px: 1 HWPUNIT = 1/7200 inch, 96dpi 기준 → *96/7200 = *2/150
const cs = root.cs || {};
const srMeta = {}; // sr → {swiPx, shePx, iwPx, ihPx, scText}

for (const id in cs) {
  const entry = cs[id];
  if (!entry || !entry.rc || !entry.rc.img) continue;
  const sr = entry.rc.img.bi;
  if (!sr) continue;
  const hwpuToPx = v => v ? Math.round(v * 96 / 7200) : null;
  srMeta[sr] = {
    swiHwp: entry.swi, sheHwp: entry.she,
    swiPx: hwpuToPx(entry.swi), shePx: hwpuToPx(entry.she),
    iwHwp: entry.rc.iw, ihHwp: entry.rc.ih,
    iwPx: hwpuToPx(entry.rc.iw), ihPx: hwpuToPx(entry.rc.ih),
    scText: entry.sc || ''
  };
}

console.log('=== HTML img vs HWP 크기 비교 ===');
console.log('단위: HTML=px(img attr), swi/she=HWP 표시크기(HWPUNIT→px), iw/ih=원본이미지크기(HWPUNIT→px)');
console.log('');

for (let i = 0; i < Math.max(htmlSlots.length, srOrder.length); i++) {
  const hs = htmlSlots[i];
  const sr = srOrder[i];
  const meta = sr ? srMeta[sr] : null;

  const htmlW = hs ? hs.wPx : '-';
  const htmlH = hs ? hs.hPx : '-';
  const swiPx = meta ? meta.swiPx : '-';
  const shePx = meta ? meta.shePx : '-';
  const iwPx = meta ? meta.iwPx : '-';
  const ihPx = meta ? meta.ihPx : '-';

  const diff = (hs && meta) ? (hs.wPx !== meta.swiPx || hs.hPx !== meta.shePx ? '★크기불일치★' : 'OK') : '?';

  console.log(`slot[${i}]:`);
  console.log(`  HTML:    fn=${hs?hs.fn:'-'} w=${htmlW}px h=${htmlH}px`);
  console.log(`  HWP-표시: sr=${sr||'-'} w=${swiPx}px h=${shePx}px`);
  console.log(`  HWP-원본: iw=${iwPx}px ih=${ihPx}px`);
  if (meta && meta.scText) {
    const scLines = meta.scText.replace(/\r/g,'').split('\n').filter(l=>l.trim());
    console.log(`  HWP-sc:  ${scLines.join(' | ')}`);
  }
  console.log(`  → ${diff}`);
  console.log('');
}
