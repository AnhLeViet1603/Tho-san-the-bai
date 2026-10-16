// Test mở ứng dụng ở hai tab: chỉ một tab được ghi, nhường quyền ghi không mất dữ liệu.
// Chạy:  node tests/ui/tab-lock-ui.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, sleep } from './driver.mjs';

const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const a = await launch('tablock');
const { check, port } = a;

// Mở thêm một tab và trả về hàm ev() chạy JS trong tab đó
async function openTab(url) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise(r => { pending.set(++seq, d => r(d.result || {})); ws.send(JSON.stringify({ id: seq, method, params })); });
  async function ev(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function waitFor(expression, ms = 8000) {
    for (let t = 0; t < ms; t += 100) { if (await ev(expression)) return true; await sleep(100); }
    return false;
  }
  return { ev, waitFor, close: () => ws.close() };
}

const ready = "!!document.getElementById('app') && !document.getElementById('app').hidden && !document.querySelector('.tab-block')";
const blocked = "!!document.querySelector('.tab-block')";
const className = name => `(window.TSTB.db.scalar('SELECT COUNT(*) FROM classes WHERE name = ?', [${JSON.stringify(name)}]) || 0)`;
const addClass = name => `(window.TSTB.classes.save({ name: ${JSON.stringify(name)}, icon: '🧬', color: '#5fe08a', note: '' }), true)`;

console.log('▸ Hai tab');
await a.send('Page.navigate', { url: APP });
check('tab 1 mở được ứng dụng', await a.waitFor(ready));
await a.ev(addClass('Lop-Tab1'));

const b = await openTab(APP);
check('tab 2 thấy màn chặn "đang mở ở tab khác"', await b.waitFor(blocked));
check('tab 2 chưa khởi động ứng dụng', await b.ev("document.getElementById('app').hidden"));
check('tab 1 vẫn dùng bình thường', await a.ev(ready));

console.log('▸ Chuyển sang tab 2');
await b.ev("document.querySelector('.tab-block button').click()");
check('tab 2 nhận quyền ghi và mở ứng dụng', await b.waitFor(ready));
check('tab 2 thấy lớp vừa tạo ở tab 1 (tab 1 đã lưu nốt trước khi nhường)', await b.ev(className('Lop-Tab1')) === 1);
check('tab 1 bị chặn', await a.waitFor(blocked));
await a.shot('tab-1-bi-chan');

await b.ev(addClass('Lop-Tab2'));
await a.ev(addClass('Lop-Ma')); // tab 1 đã dừng ghi: thay đổi này không được lưu
await sleep(800);

console.log('▸ Chuyển lại tab 1');
await a.ev("document.querySelector('.tab-block button').click()"); // tải lại trang
check('tab 1 tải lại thì bị chặn vì tab 2 đang giữ', await a.waitFor(blocked));
await a.ev("document.querySelector('.tab-block button').click()");
check('tab 1 nhận lại quyền ghi', await a.waitFor(ready));
check('tab 1 có lớp tạo ở tab 2', await a.ev(className('Lop-Tab2')) === 1);
check('thay đổi ở tab đã mất quyền không ghi đè dữ liệu', await a.ev(className('Lop-Ma')) === 0);
check('tab 2 bị chặn', await b.waitFor(blocked));

check('không có lỗi JS ở tab 1', !a.pageErrors.length, a.pageErrors);
b.close();
a.finish();
