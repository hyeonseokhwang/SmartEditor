import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('G:/WorkSpace/HomePage/Hanwool/public/clipboard-logs/raw-2026-04-08T01-12-29-303Z.json', 'utf8'));
const html = raw.clipHTML || '';

const jsonM = html.match(/<!--\[data-hwpjson\]\s*(\{[\s\S]*?\})\s*-->/i);
if (!jsonM) { console.log('HWP JSON 없음'); process.exit(0); }
const root = JSON.parse(jsonM[1]);

// bi.sr 노드를 찾을 때 부모 컨텍스트도 함께 캡처
const biNodes = [];

function collect(obj, path, parent) {
  if (!obj || typeof obj !== 'object') return;

  // bi가 string인 경우 — 부모 obj에 크기 정보 있을 것
  if (typeof obj.bi === 'string') {
    biNodes.push({
      sr: obj.bi,
      type: 'bi-string',
      selfKeys: Object.keys(obj).filter(k => k !== 'bi' && k !== 'bidt'),
      self: obj,
      path
    });
  }

  // bi가 array인 경우
  if (Array.isArray(obj.bi)) {
    for (const b of obj.bi) {
      if (b && typeof b.sr === 'string') {
        biNodes.push({
          sr: b.sr,
          type: 'bi-array',
          selfKeys: Object.keys(b),
          self: b,
          parentKeys: Object.keys(obj).filter(k => k !== 'bi' && k !== 'bidt'),
          parent: obj,
          path
        });
      }
    }
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'bidt') {
      collect(obj[key], path + '.' + key, obj);
    }
  }
}
collect(root, 'root', null);

console.log('=== bi 노드 전체 구조 (' + biNodes.length + '개) ===');
biNodes.forEach((n, i) => {
  // base64가 아닌 필드만 출력
  const selfFiltered = {};
  for (const k of n.selfKeys) {
    const v = n.self[k];
    if (typeof v !== 'string' || v.length < 200) selfFiltered[k] = v;
    else selfFiltered[k] = '[base64 len=' + v.length + ']';
  }
  console.log(`\n[${i}] sr=${n.sr} type=${n.type} path=${n.path}`);
  console.log('  self:', JSON.stringify(selfFiltered));
  if (n.parent) {
    const parentFiltered = {};
    for (const k of n.parentKeys) {
      const v = n.parent[k];
      if (typeof v !== 'string' || v.length < 200) parentFiltered[k] = v;
      else parentFiltered[k] = '[base64 len=' + v.length + ']';
    }
    console.log('  parent:', JSON.stringify(parentFiltered));
  }
});
