// Test tự lưu ra file trên trình duyệt thật. Hộp chọn file và hộp hỏi quyền không tự động hoá được, nên:
// - showSaveFilePicker trả về một file THẬT trong OPFS (handle thật: lưu được vào IndexedDB, createWritable thật);
// - câu trả lời quyền được giả bằng localStorage.__perm ('prompt' | 'denied'; trống = theo trình duyệt).
// Phần quyền thật (hỏi lại sau khi khởi động lại, "Cho phép mọi lần truy cập") phải thử tay: tests/manual/fs-probe.html
// OPFS không dùng được trên file:// nên test mở ứng dụng qua một server tĩnh nhỏ trên localhost.
// Chạy:  node tests/ui/file-sink-ui.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launch, ROOT, sleep } from './driver.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const APP = `http://127.0.0.1:${server.address().port}/index.html`;
const b = await launch('filesink');
const { send, ev, waitFor, check, shot, viewport } = b;
const q = JSON.stringify;

await send('Page.enable'); // cần cho addScriptToEvaluateOnNewDocument
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('tu-luu.sqlite', { create: true });
  const P = FileSystemFileHandle.prototype;
  const query = P.queryPermission, request = P.requestPermission, writable = P.createWritable;
  const fake = () => localStorage.getItem('__perm');
  P.queryPermission = function () { return fake() ? Promise.resolve(fake()) : query.apply(this, arguments); };
  P.requestPermission = function () {
    if (!fake()) return request.apply(this, arguments);
    const answer = localStorage.getItem('__grant') || 'granted';
    if (answer === 'granted') localStorage.removeItem('__perm'); else localStorage.setItem('__perm', answer);
    return Promise.resolve(answer);
  };
  P.createWritable = function () {
    if (fake()) return Promise.reject(new DOMException('Chưa có quyền', 'NotAllowedError'));
    return writable.apply(this, arguments);
  };
` });

const go = async route => { await ev(`location.hash = '#/${route}'`); await sleep(350); };
const click = sel => ev(`document.querySelector(${q(sel)}).click()`);
const text = sel => ev(`(document.querySelector(${q(sel)}) || {}).innerText || ''`);
const ready = "!document.getElementById('app').hidden";
const sinkStatus = () => ev('TSTB.fileSink.state().status');
const toasts = () => text('#toasts');
const addClass = name => ev(`(TSTB.classes.save({ name: ${q(name)}, icon: '🧬', color: '#5fe08a', note: '' }), true)`);
// Tên các lớp trong file OPFS đã ghi
const classesInFile = () => ev(`(async () => {
  const f = await (await (await navigator.storage.getDirectory()).getFileHandle('tu-luu.sqlite')).getFile();
  if (!f.size) return [];
  const SQL = await initSqlJs();
  const d = new SQL.Database(new Uint8Array(await f.arrayBuffer()));
  const r = d.exec('SELECT name FROM classes ORDER BY id');
  d.close();
  return r.length ? r[0].values.map(v => v[0]) : [];
})()`);
const fileBtnVisible = () => ev("!document.getElementById('fileState').hidden");
const openData = async () => { await go('cai-dat'); await click('[data-tab="data"]'); await sleep(250); };

await send('Page.navigate', { url: APP });
check('ứng dụng mở được', await waitFor(ready));

console.log('▸ Bật tự lưu');
await openData();
check('chưa bật: có nút chọn file và hướng dẫn OneDrive / USB', /Chọn file để tự lưu/.test(await text('#fileSinkBox')) && /OneDrive/.test(await text('#fileSinkBox')));
check('thanh bên không hiện gì khi chưa bật', !(await fileBtnVisible()));
await addClass('Lop-1');
await click('[data-act="sink-pick"]');
await waitFor("TSTB.fileSink.state().status === 'ok' && TSTB.fileSink.state().lastWrite", 3000);
check('chọn file xong: đang tự lưu, ghi ngay', /Đang tự lưu vào tu-luu\.sqlite/.test(await text('#fileSinkBox')), await text('#fileSinkBox'));
check('file trên ổ có dữ liệu hiện tại', (await classesInFile()).includes('Lop-1'));
await shot('dang-tu-luu');

console.log('▸ Ghi khi có thay đổi');
await addClass('Lop-2');
await ev('TSTB.db.flush()');
check('chưa tới 30s thì chưa ghi', !(await classesInFile()).includes('Lop-2'));
await ev("document.dispatchEvent(new Event('visibilitychange'))"); // trang không thật sự ẩn: gọi trực tiếp như khi ẩn
await ev('TSTB.db.flush().then(() => TSTB.fileSink.flush())');
check('ẩn trang / chuyển tab: ghi ngay', (await classesInFile()).includes('Lop-2'));
await click('[data-act="sink-now"]');
await sleep(300);
check('nút "Ghi ngay" báo đã ghi', /Đã ghi ra file/.test(await toasts()));

console.log('▸ Mở lại trình duyệt, quyền về "hỏi lại"');
await ev("localStorage.setItem('__perm', 'prompt')");
await send('Page.reload');
await sleep(300);
await waitFor(ready);
await waitFor("TSTB.fileSink.state().status !== 'off' && TSTB.fileSink.state().status !== 'unsupported'", 3000);
check('nhớ file đã chọn, trạng thái chờ quyền', await sinkStatus() === 'needs-permission');
check('thanh bên hiện nút "Bấm để tiếp tục tự lưu"', await fileBtnVisible() && /tiếp tục tự lưu/.test(await text('#fileState')));
await addClass('Lop-3');
await ev('TSTB.db.flush()');
await shot('cho-quyen');

await viewport(390, 760);
await sleep(200);
check('màn hẹp: nút nằm sát đáy, không che thanh điều hướng', await ev(`(() => {
  const r = document.getElementById('fileState').getBoundingClientRect();
  const nav = document.getElementById('nav').getBoundingClientRect();
  return getComputedStyle(document.getElementById('fileState')).display !== 'none' && r.bottom > innerHeight - 40 && r.top > nav.bottom; })()`));
await shot('cho-quyen-man-hep');
await viewport(1280, 800);

await click('#fileState');
await waitFor("TSTB.fileSink.state().status === 'ok'", 3000);
await sleep(300);
check('bấm nút: được quyền, ghi luôn phần còn thiếu', (await classesInFile()).includes('Lop-3'));
check('nút ở thanh bên biến mất', !(await fileBtnVisible()));

console.log('▸ Từ chối quyền');
await ev("localStorage.setItem('__perm', 'prompt'); localStorage.setItem('__grant', 'denied')");
await ev('TSTB.fileSink.refreshPermission()');
await openData();
check('Cài đặt hiện cảnh báo tạm dừng + nút tiếp tục', /tạm dừng/.test(await text('#fileSinkBox')) && /Tiếp tục tự lưu/.test(await text('#fileSinkBox')));
await click('[data-act="sink-resume"]');
await sleep(300);
check('không cho phép: vẫn chờ, không lỗi', await sinkStatus() === 'needs-permission');
await ev("localStorage.removeItem('__perm'); localStorage.removeItem('__grant')");
await ev('TSTB.fileSink.refreshPermission()');
await sleep(200);
check('mục Cài đặt tự cập nhật khi trạng thái đổi', /Đang tự lưu/.test(await text('#fileSinkBox')));

console.log('▸ Tắt');
await click('[data-act="sink-off"]');
await sleep(200);
await ev("[...document.querySelectorAll('.modal-wrap:last-of-type footer .btn')].pop().click()");
await sleep(300);
check('tắt: về trạng thái chưa bật', await sinkStatus() === 'off' && /Chọn file để tự lưu/.test(await text('#fileSinkBox')));
await send('Page.reload');
await sleep(300);
await waitFor(ready);
await sleep(300);
check('mở lại vẫn tắt', await sinkStatus() === 'off');

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
server.close();
b.finish();
