import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('G:/WorkSpace/HomePage/Hanwool/public/clipboard-logs/raw-2026-04-08T01-12-29-303Z.json', 'utf8'));
const html = raw.clipHTML || '';

const jsonM = html.match(/<!--\[data-hwpjson\]\s*(\{[\s\S]*?\})\s*-->/i);
const root = JSON.parse(jsonM[1]);

// root.cs 구조 탐색 - 이미지 크기 정보 찾기
const cs = root.cs;
if (!cs) { console.log('root.cs 없음'); process.exit(0); }

console.log('=== root.cs 키 수:', Object.keys(cs).length);

// img 필드를 가진 cs 항목 찾기
const imgNodes = [];
for (const id in cs) {
  const entry = cs[id];
  if (!entry || typeof entry !== 'object') continue;

  // rc 안에 img가 있는 경우
  if (entry.rc && entry.rc.img) {
    imgNodes.push({id, rc: entry.rc, full: entry});
  }
  // 직접 img가 있는 경우
  if (entry.img) {
    imgNodes.push({id, img: entry.img, full: entry});
  }
}

console.log('=== img 포함 cs 항목 (' + imgNodes.length + '개) ===');
imgNodes.forEach((n, i) => {
  const filtered = JSON.parse(JSON.stringify(n.full, (k, v) => {
    if (typeof v === 'string' && v.length > 200) return '[b64]';
    return v;
  }));
  console.log('\n[' + i + '] id=' + n.id);
  console.log(JSON.stringify(filtered, null, 2).substring(0, 2000));
});

// root.cs 에서 img.bi 값을 순서대로 추출
console.log('\n=== cs 내 img.bi 순서 (전체) ===');
let idx = 0;
for (const id in cs) {
  const entry = cs[id];
  if (entry && entry.rc && entry.rc.img && entry.rc.img.bi) {
    console.log('[' + idx + '] id=' + id + ' bi=' + entry.rc.img.bi + ' rc keys:', Object.keys(entry.rc));
    // rc의 크기 정보 탐색
    const rc = entry.rc;
    console.log('    rc.w=' + rc.w + ' rc.h=' + rc.h + ' rc.wi=' + rc.wi + ' rc.hi=' + rc.hi + ' rc.sz=' + rc.sz);
    // full entry에서 크기 찾기
    const ent = entry;
    console.log('    ent.w=' + ent.w + ' ent.h=' + ent.h + ' ent.wi=' + ent.wi + ' ent.wp=' + ent.wp + ' ent.hp=' + ent.hp);
    idx++;
  }
}

// 다른 접근: root.cs 전체에서 w/h 숫자 필드 가진 이미지 관련 항목 찾기
console.log('\n=== 크기 관련 필드 탐색 ===');
function findSizeFields(obj, path) {
  if (!obj || typeof obj !== 'object') return;
  // img 관련이면서 w/h가 있으면 출력
  const hasImg = JSON.stringify(obj).includes('"img"') || JSON.stringify(obj).includes('"bi"');
  const hasSize = obj.w !== undefined || obj.h !== undefined || obj.wi !== undefined || obj.wp !== undefined;
  if (hasImg && hasSize && path.length < 100) {
    const filtered = {};
    for (const k in obj) {
      const v = obj[k];
      if (typeof v !== 'object' || v === null) filtered[k] = v;
    }
    // bi 추출
    let biVal = null;
    if (obj.rc && obj.rc.img) biVal = obj.rc.img.bi;
    if (obj.img) biVal = obj.img.bi || obj.img.sr;
    if (biVal) console.log(path + ' bi=' + biVal + ' w=' + obj.w + ' h=' + obj.h + ' wi=' + obj.wi + ' hi=' + obj.hi);
  }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'bidt' && key !== 'bi') {
      findSizeFields(obj[key], path + '.' + key);
    }
  }
}
findSizeFields(root.cs, 'cs');
