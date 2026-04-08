import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('G:/WorkSpace/HomePage/Hanwool/public/clipboard-logs/raw-2026-04-08T01-12-29-303Z.json', 'utf8'));
const html = raw.clipHTML || '';

const jsonM = html.match(/<!--\[data-hwpjson\]\s*(\{[\s\S]*?\})\s*-->/i);
const root = JSON.parse(jsonM[1]);

// sr 파일명을 포함하는 노드의 전체 상위 경로를 추적
// 이미지 크기는 GSHP/pic/shp 구조 내에 있을 것
const TARGET_SR = '01DCC6F4C445C9600000048C.jpg'; // slot[0]

function findPaths(obj, path, results) {
  if (!obj || typeof obj !== 'object') return;

  // 이 객체에 sr이 있고 타겟 파일명이면
  if (obj.sr === TARGET_SR || obj.bi === TARGET_SR ||
      (Array.isArray(obj.bi) && obj.bi.some(b => b && b.sr === TARGET_SR))) {
    // 이 객체 전체를 JSON으로 출력 (base64 제외)
    const filtered = JSON.parse(JSON.stringify(obj, (k, v) => {
      if (typeof v === 'string' && v.length > 200) return '[b64 len=' + v.length + ']';
      return v;
    }));
    results.push({path, obj: filtered});
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'bidt') {
      findPaths(obj[key], path + '.' + key, results);
    }
  }
}

const results = [];
findPaths(root, 'root', results);
console.log('=== sr=' + TARGET_SR + ' 노드 발견 (' + results.length + '개) ===');
results.forEach((r, i) => {
  console.log('\n[' + i + '] path=' + r.path);
  console.log(JSON.stringify(r.obj, null, 2).substring(0, 3000));
});

// 또한 HWP JSON 최상위 키 구조 확인
console.log('\n=== HWP JSON 최상위 키 ===');
console.log(Object.keys(root));

// sec/body/para 구조 탐색
function findImageShapes(obj, path, shapes) {
  if (!obj || typeof obj !== 'object') return;
  // HWP JSON의 이미지 도형은 보통 tp:'pic' 또는 gshp 유형
  if (obj.tp === 'pic' || obj.type === 'pic' || (obj.pic && obj.pic.sr)) {
    shapes.push({path, obj: JSON.parse(JSON.stringify(obj, (k,v) => {
      if (typeof v === 'string' && v.length > 200) return '[b64]';
      return v;
    }))});
  }
  // gshp (그리기 개체 영역)
  if (obj.gshp || obj.shp) {
    shapes.push({path, obj: JSON.parse(JSON.stringify(obj, (k,v) => {
      if (typeof v === 'string' && v.length > 200) return '[b64]';
      return v;
    }))});
  }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'bidt') {
      findImageShapes(obj[key], path + '.' + key, shapes);
    }
  }
}
const shapes = [];
findImageShapes(root, 'root', shapes);
console.log('\n=== pic/shp/gshp 도형 노드 (' + shapes.length + '개) ===');
shapes.slice(0, 5).forEach((s, i) => {
  console.log('\n[' + i + '] path=' + s.path);
  console.log(JSON.stringify(s.obj, null, 2).substring(0, 2000));
});
