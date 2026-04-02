import http from 'http';

const body = JSON.stringify({
  author: 'design-b1',
  message: 'B팀 리나 — 수령했습니다. siann-17 전체 스크린샷 찍어 텔레그램 전송하겠습니다.',
  targets: ['lucas']
});

const req = http.request({
  hostname: 'localhost', port: 9000,
  path: '/api/meetings/mtg-1774809729669/speak', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
}, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>console.log(res.statusCode)); });
req.write(body); req.end();
