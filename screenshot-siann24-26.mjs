// 시안 24~26 전체 페이지 스크린샷 + 미팅방 보고
import { execFile } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9448;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url.replace('localhost','127.0.0.1'), r => {
      let d=''; r.on('data',c=>d+=c);
      r.on('end',()=>{ try{res(JSON.parse(d));}catch{res(d);} });
    }).on('error', rej);
  });
}

async function cdpSession(wsRaw) {
  const wsUrl = wsRaw.replace('localhost','127.0.0.1');
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 1;
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
    setTimeout(()=>rej(new Error('ws open timeout')), 8000);
  });
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const {resolve,reject} = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
    }
  });
  function send(method, params={}) {
    return new Promise((resolve, reject) => {
      const myId = id++;
      pending.set(myId, {resolve, reject});
      ws.send(JSON.stringify({id: myId, method, params}));
      setTimeout(()=>{
        if(pending.has(myId)){pending.delete(myId);reject(new Error(`timeout: ${method}`));}
      }, 40000);
    });
  }
  return { send, close: ()=>ws.close() };
}

async function fullPageShot(wsUrl, pageUrl, outPath) {
  const cdp = await cdpSession(wsUrl);
  try {
    await cdp.send('Page.enable');
    // 1280px 폭으로 초기 설정
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1.5, mobile: false
    });
    await cdp.send('Page.navigate', { url: pageUrl });
    await sleep(5000); // 이미지+폰트 로드 대기

    // 페이지 전체 높이
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})'
    });
    const dims = JSON.parse(evalResult.result?.value || '{"w":1280,"h":8000}');
    const W = Math.max(dims.w || 1280, 1280);
    const H = Math.min(dims.h || 8000, 18000);
    console.log(`  [${pageUrl}] ${W}x${H}`);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1.5, mobile: false
    });
    await sleep(800);

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 80,
      captureBeyondViewport: true
    });
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log('  저장:', outPath, `(${(fs.statSync(outPath).size/1024).toFixed(0)}KB)`);
  } finally {
    cdp.close();
  }
}

function sendToMeeting(content, filePath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      speaker: 'hanul-aide',
      content,
      targets: ['lucas'],
      ...(filePath ? { attachments: [{ type: 'image', path: filePath }] } : {})
    });
    const req = http.request({
      hostname: '127.0.0.1', port: 9000,
      path: '/api/meetings/mtg-1774809729669/speak', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ console.log('  미팅:', res.statusCode); resolve(); });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function sendTelegram(filePath, caption) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ filePath, caption });
    const req = http.request({
      hostname: '127.0.0.1', port: 3004,
      path: '/api/telegram/send-file', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ console.log('  TG:', res.statusCode); resolve(); });
    });
    req.on('error', e => { console.log('  TG err:', e.message); resolve(); });
    req.write(body); req.end();
  });
}

// ── main ──
console.log('Chrome 시작...');
const chrome = execFile(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--disable-web-security', '--window-size=1280,900',
  'about:blank'
]);
await sleep(3000);
console.log('Chrome PID:', chrome.pid);

const BASE = 'G:/WorkSpace/HomePage/Hanwool';
const SIANN_URLS = [
  { n: 24, desc: '다크 사이드내비 + 스플릿 히어로', url: 'http://127.0.0.1:8080/siann-24/1' },
  { n: 25, desc: '매거진/잡지 그리드형', url: 'http://127.0.0.1:8080/siann-25/1' },
  { n: 26, desc: '풀스크린 3분할 배경 + 원형 철학 그리드', url: 'http://127.0.0.1:8080/siann-26/1' },
];

try {
  const targets = await httpGet(`http://127.0.0.1:${PORT}/json`);
  const ws = targets[0].webSocketDebuggerUrl;

  for (const s of SIANN_URLS) {
    const outPath = `${BASE}/check-siann${s.n}.jpg`;
    console.log(`\n[시안-${s.n}] ${s.desc}`);
    await fullPageShot(ws, s.url, outPath);
    await sendTelegram(outPath, `[한울보조관] 시안-${s.n}: ${s.desc}\n레이아웃 완전히 다름 — 여의명상센터 실제 이미지 사용`);
    await sleep(500);
  }

  await sendToMeeting(`**시안 24·25·26 스크린샷 완료 — 텔레그램 전송**\n\n- **시안-24**: 다크 배경 + 좌측 세로 내비 + 좌우 스플릿 히어로 + 4열 사진 띠\n- **시안-25**: 밝은 매거진/잡지 그리드형 + 3단 피처 카드\n- **시안-26**: 풀스크린 3분할 배경 이미지 + 4개 원형 철학 카드\n\n모두 실제 여의명상센터 사진 사용, 색깔만 바뀐 게 아닌 완전히 다른 레이아웃\n\n미리보기: http://211.104.37.65:8080/siann-24/1 · /siann-25/1 · /siann-26/1`);

} catch(e) {
  console.error('Error:', e.message);
} finally {
  chrome.kill();
  console.log('\nChrome 종료');
}
