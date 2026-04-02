// 전체 페이지 CDP 스크린샷 + 텔레그램 전송
import { execFile } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9447;

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
      }, 15000);
    });
  }

  return { send, close: ()=>ws.close() };
}

async function fullPageShot(wsUrl, pageUrl, outPath) {
  const cdp = await cdpSession(wsUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: pageUrl });
    // 폰트 로드 대기
    await sleep(4000);

    // JS로 페이지 실제 높이 가져오기
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})'
    });
    const dims = JSON.parse(evalResult.result?.value || '{"w":1280,"h":6000}');
    const W = dims.w || 1280;
    const H = Math.min(dims.h || 6000, 15000);
    console.log(`Page size: ${W} x ${H}`);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1.5, mobile: false
    });
    await sleep(1000);

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 85,
      clip: { x: 0, y: 0, width: W, height: H, scale: 1.5 }
    });
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log('Saved:', outPath);
  } finally {
    cdp.close();
  }
}

function sendTelegram(filePath, caption) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ filePath, caption });
    const req = http.request({
      hostname: '127.0.0.1', port: 3004,
      path: '/api/telegram/send-file', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ console.log('TG:', res.statusCode, d.slice(0,120)); resolve(); });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── main ──
console.log('Launching Chrome...');
const chrome = execFile(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--disable-web-security',
  '--window-size=1280,900',
  'about:blank'
]);
await sleep(3000);
console.log('Chrome PID:', chrome.pid);

try {
  const targets = await httpGet(`http://127.0.0.1:${PORT}/json`);
  console.log('Targets:', targets.length);

  const ws = targets[0].webSocketDebuggerUrl;

  // siann-17
  const p17 = 'G:/WorkSpace/HomePage/Hanwool/full-siann17.jpg';
  await fullPageShot(ws, 'http://127.0.0.1:8080/siann-17/1', p17);
  await sendTelegram(p17, '[B팀 리나] siann-17 R2 전체 페이지 — 한울사랑 여의명상센터 · CSS+타이포 전용');

} catch(e) {
  console.error('Error:', e.message, e.stack?.split('\n')[1]);
} finally {
  chrome.kill();
  console.log('Chrome killed.');
}
