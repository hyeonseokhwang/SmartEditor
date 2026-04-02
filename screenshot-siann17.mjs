// siann-17 전체 페이지 스크린샷 → 텔레그램 전송
// Node.js 22 내장 WebSocket 사용
import { execFile } from 'child_process';
import http from 'http';
import fs from 'fs';

const PORT = 9446;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } });
    }).on('error', rej);
  });
}

function cdpCmd(wsUrl, commands) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const results = {};
    let idx = 0;

    ws.addEventListener('open', async () => {
      for (const [id, method, params] of commands) {
        ws.send(JSON.stringify({ id, method, params: params || {} }));
        await sleep(100);
      }
    });

    const received = new Set();
    ws.addEventListener('message', e => {
      const msg = JSON.parse(e.data);
      if (msg.id) { results[msg.id] = msg.result; received.add(msg.id); }
      if (received.size >= commands.length) { ws.close(); resolve(results); }
    });

    ws.addEventListener('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, 30000);
  });
}

async function screenshotPage(targetWs, url) {
  // navigate
  await cdpCmd(targetWs, [
    [1, 'Page.enable'],
    [2, 'Page.navigate', { url }]
  ]);
  await sleep(3500);

  // get full height
  const metrics = await cdpCmd(targetWs, [[3, 'Page.getLayoutMetrics']]);
  const h = Math.min(Math.ceil(metrics[3]?.cssContentSize?.height || 5000), 12000);

  await cdpCmd(targetWs, [
    [4, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: h, deviceScaleFactor: 1, mobile: false }]
  ]);
  await sleep(800);

  const shot = await cdpCmd(targetWs, [
    [5, 'Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1280, height: h, scale: 1 } }]
  ]);
  return shot[5]?.data;
}

function sendToTelegram(filePath, caption) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ filePath, caption });
    const req = http.request({
      hostname: '127.0.0.1', port: 3004,
      path: '/api/telegram/send-file', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { console.log('TG response:', res.statusCode, d.slice(0, 120)); resolve(res.statusCode); });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── Main ──
console.log('Launching Chrome...');
const chrome = execFile(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--window-size=1280,900', 'about:blank'
], { detached: false });

await sleep(2500);
console.log('Chrome PID:', chrome.pid);

try {
  const targets = await httpGet(`http://127.0.0.1:${PORT}/json`);
  console.log('Targets:', targets.length);
  if (!targets.length) throw new Error('No CDP targets');

  const wsUrl = targets[0].webSocketDebuggerUrl.replace('localhost', '127.0.0.1');
  console.log('WS:', wsUrl);

  console.log('Capturing siann-17/1...');
  const imgData = await screenshotPage(wsUrl, 'http://127.0.0.1:8080/siann-17/1');
  if (!imgData) throw new Error('No screenshot data');

  const savePath = 'G:/WorkSpace/HomePage/Hanwool/ss-siann17.jpg';
  fs.writeFileSync(savePath, Buffer.from(imgData, 'base64'));
  console.log('Saved:', savePath, Buffer.byteLength(Buffer.from(imgData, 'base64')), 'bytes');

  await sendToTelegram(savePath, '[B팀 리나] siann-17 R2 — 한울사랑 여의명상센터 · 이미지 없이 CSS+타이포 전용 시안');
  console.log('Done.');

} catch(e) {
  console.error('Error:', e.message);
} finally {
  chrome.kill();
  console.log('Chrome killed.');
}
