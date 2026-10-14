// Test lưu dữ liệu trên trình duyệt thật: chỉ báo trạng thái, IndexedDB lỗi rồi tự thử lại, hỏi lại khi đóng tab.
// Chạy:  node tests/ui/save-ui.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, sleep } from './driver.mjs';

const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const b = await launch('save');
const { send, ev, waitFor, check, shot, viewport } = b;

const ready = "!document.getElementById('app').hidden";
const state = "document.getElementById('saveState').dataset.state";
const label = "document.getElementById('saveState').innerText";
const addClass = name => ev(`(window.TSTB.classes.save({ name: ${JSON.stringify(name)}, icon: '🧬', color: '#5fe08a', note: '' }), true)`);
const hasClass = name => ev(`window.TSTB.db.scalar('SELECT COUNT(*) FROM classes WHERE name = ?', [${JSON.stringify(name)}])`);
// Bắn sự kiện beforeunload giả để xem ứng dụng có xin trình duyệt hỏi lại không
const asksOnLeave = () => ev(`(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()`);
const breakIdb = () => ev(`(() => { window.__put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException('Giả lập đầy bộ nhớ', 'QuotaExceededError'); }; return true; })()`);
const fixIdb = () => ev('(IDBObjectStore.prototype.put = window.__put, true)');

await send('Page.navigate', { url: APP });
check('ứng dụng mở được', await waitFor(ready));

console.log('▸ Lưu bình thường');
check('chỉ báo "Đã lưu" sau khi mở', await waitFor(`${state} === 'saved'`), await ev(label));
await addClass('Lop-1');
check('ngay sau khi đổi: đang lưu', await ev(`${state} !== 'saved'`));
check('đang có thay đổi chưa lưu thì xin hỏi lại khi đóng tab', await asksOnLeave());
check('sau 300ms đã lưu', await waitFor(`${state} === 'saved'`, 2000));
check('đã lưu hết thì đóng tab không hỏi', !(await asksOnLeave()));

console.log('▸ IndexedDB lỗi');
await breakIdb();
await addClass('Lop-2');
check('chỉ báo đỏ "Chưa lưu được"', await waitFor(`${state} === 'error'`, 2000), await ev(label));
check('có toast báo lỗi', /Không lưu được dữ liệu/.test(await ev("document.getElementById('toasts').innerText")));
await viewport(1280, 800);
await sleep(200);
check('màn rộng: chỉ báo lỗi nằm trong thanh bên', await ev(
  "document.querySelector('.side').contains(document.getElementById('saveState')) && getComputedStyle(document.getElementById('saveState')).position !== 'fixed'"));
await shot('loi-luu');
await sleep(1500); // qua lần thử lại 1s, vẫn lỗi
check('vẫn giữ chỉ báo lỗi sau lần thử lại thất bại', await ev(`${state} === 'error'`));
check('chỉ hiện đúng một toast lỗi', await ev("document.querySelectorAll('.toast.error').length") <= 1);
check('đang lỗi thì đóng tab phải hỏi lại', await asksOnLeave());

await viewport(390, 760);
await sleep(200);
check('màn hẹp: chỉ báo lỗi vẫn hiện', await ev("getComputedStyle(document.getElementById('saveState')).display !== 'none'"));
check('màn hẹp: chỉ báo lỗi nằm sát đáy màn hình, không che thanh điều hướng', await ev(`(() => {
  const r = document.getElementById('saveState').getBoundingClientRect();
  const nav = document.getElementById('nav').getBoundingClientRect();
  return r.bottom > innerHeight - 40 && r.top > nav.bottom; })()`));
await shot('loi-luu-man-hep');
await viewport(1280, 800);

console.log('▸ Hết lỗi');
await fixIdb();
check('tự lưu được ở lần thử lại kế tiếp (tối đa 10s)', await waitFor(`${state} === 'saved'`, 12000), await ev(label));
check('màn hẹp: chỉ báo ẩn khi đã lưu', await (async () => {
  await viewport(390, 760); await sleep(200);
  const hidden = await ev("getComputedStyle(document.getElementById('saveState')).display === 'none'");
  await viewport(1280, 800);
  return hidden;
})());

await send('Page.reload');
await sleep(300);
check('tải lại trang mở được', await waitFor(ready));
check('lớp tạo lúc đang lỗi vẫn còn sau khi tải lại', await hasClass('Lop-2') === 1);
check('lớp tạo trước đó vẫn còn', await hasClass('Lop-1') === 1);

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
