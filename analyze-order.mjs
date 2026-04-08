import fs from 'fs';

const html = fs.readFileSync('G:/WorkSpace/HomePage/Hanwool/clipboard-html.txt', 'utf8');

// Extract img src order from HTML
const imgRe = /<img\b[^>]*\bsrc\s*=\s*["']?(file:\/\/\/[^"'\s>]+)/gi;
let m;
const imgOrder = [];
while ((m = imgRe.exec(html)) !== null) {
  const fname = m[1].split('/').pop();
  imgOrder.push(fname);
}
console.log('HTML img src order (' + imgOrder.length + '):');
imgOrder.forEach((f, i) => console.log('  img[' + i + ']: ' + f));

// Extract HWP JSON bi order
const hjm = html.match(/<!--\[data-hwpjson\]\s*(\{[\s\S]*?\})\s*-->/i);
if (hjm) {
  const root = JSON.parse(hjm[1]);
  const biOrder = [];
  function collect(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.bi === 'string') biOrder.push(obj.bi);
    if (Array.isArray(obj.bi)) {
      for (const it of obj.bi) {
        if (it && typeof it.sr === 'string') biOrder.push(it.sr);
      }
    }
    for (const k of Object.keys(obj)) collect(obj[k]);
  }
  collect(root);
  console.log('\nHWP JSON bi order (' + biOrder.length + '):');
  biOrder.forEach((b, i) => console.log('  bi[' + i + ']: ' + b));

  // Check if bi order matches img order
  console.log('\n=== Mapping Check ===');
  const bidtKeys = [...new Set(biOrder)];
  console.log('Unique bidt keys:', bidtKeys.length);
  console.log('Unique img files:', [...new Set(imgOrder)].length);

  // Match by position
  console.log('\n=== Position Mapping ===');
  for (let i = 0; i < Math.max(imgOrder.length, biOrder.length); i++) {
    const img = imgOrder[i] || '(none)';
    const bi = biOrder[i] || '(none)';
    console.log(`  [${i}] img: ${img} <-> bi: ${bi}`);
  }
}
