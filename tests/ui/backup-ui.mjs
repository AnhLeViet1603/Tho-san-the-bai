// Test hộp chào lần đầu (nhập file sao lưu) và khung nhắc sao lưu trên trình duyệt thật.
// Chạy:  node tests/ui/backup-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, sleep } from './driver.mjs';

const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const DAY = 86400000;
const q = JSON.stringify;
const ready = "!document.getElementById('app').hidden";

const b = await launch('backup');
const { send, ev, waitFor, check, shot } = b;
const click = sel => ev(`document.querySelector(${q(sel)}).click()`);
const text = sel => ev(`(document.querySelector(${q(sel)}) || {}).innerText || ''`);
const go = async route => { await ev(`location.hash = '#/${route}'`); await sleep(350); };
await send('Page.enable');

console.log('▸ Có dữ liệu rồi xuất file sao lưu');
await send('Page.navigate', { url: APP });
check('ứng dụng mở được', await waitFor(ready));
await waitFor("!!document.querySelector('.welcome-modal')", 3000);
await click('.welcome-modal [data-x]');
const b64 = await ev(`(() => {
  const T = TSTB;
  const cid = T.classes.save({ name: 'Lop-Quan-Trong', icon: '🧬', color: '#5fe08a', note: '' });
  T.students.bulkAdd(cid, ['An', 'Bình']);
  const bytes = T.db.exportBytes();
  let s = ''; bytes.forEach(x => { s += String.fromCharCode(x); });
  return btoa(s);
})()`);
await ev('TSTB.db.flush()');
const backup = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tstb-backup-')), 'sao-luu.sqlite');
fs.writeFileSync(backup, Buffer.from(b64, 'base64'));
check('xuất được file sao lưu', fs.statSync(backup).size > 0);

console.log('▸ Dữ liệu trình duyệt bị xoá → hộp chào → nhập file sao lưu');
await send('Storage.clearDataForOrigin', { origin: await ev('location.origin'), storageTypes: 'all' });
await send('Page.reload');
check('mở lại sau khi xoá dữ liệu trang: hiện hộp chào', await waitFor(ready) && await waitFor("!!document.querySelector('.welcome-modal')", 3000));
check('dữ liệu trong trình duyệt đã mất', await ev('TSTB.classes.list().length') === 0);
// Chặn hộp chọn file của hệ điều hành, đưa file sao lưu vào thẳng ô input
await send('Page.setInterceptFileChooserDialog', { enabled: true });
const chooser = b.once('Page.fileChooserOpened');
// Hộp chọn file chỉ mở khi người dùng bấm thật (element.click() từ JS không đủ) → bấm chuột qua DevTools Protocol
const pos = await ev(`(() => { const r = [...document.querySelectorAll('.welcome-modal footer .btn')]
  .find(x => /Nhập file/.test(x.innerText)).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
for (const type of ['mousePressed', 'mouseReleased']) {
  await send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
}
const opened = await Promise.race([chooser, sleep(5000).then(() => null)]);
check('bấm "Nhập file sao lưu" mở hộp chọn file', !!opened);
if (!opened) { check('không có lỗi JS', !b.pageErrors.length, b.pageErrors); b.finish(); }
await send('DOM.setFileInputFiles', { files: [backup], backendNodeId: opened.backendNodeId });
check('nhập xong: hộp chào đóng', await waitFor("!document.querySelector('.welcome-modal')", 5000));
check('dữ liệu trở lại đầy đủ', await waitFor("TSTB.classes.list().some(c => c.name === 'Lop-Quan-Trong')", 3000) &&
  await ev('TSTB.students.list(TSTB.classes.list()[0].id).length') === 2);
check('nhật ký ghi lần nhập', /Nhập file sao-luu\.sqlite/.test(await ev('TSTB.audit.list(1)[0].summary')));
await send('Page.setInterceptFileChooserDialog', { enabled: false });

console.log('▸ Nhắc sao lưu');
// Giả như lớp được tạo từ 8 ngày trước và chưa từng sao lưu
await ev(`TSTB.db.run("UPDATE classes SET created_at = datetime('now', '-8 days')"); TSTB.db.run("DELETE FROM settings WHERE key = 'last_export_at'")`);
await go('cai-dat');
await go('rung');
check('Khu rừng: hiện khung nhắc 8 ngày chưa sao lưu', /8 ngày mà chưa sao lưu/.test(await text('.backup-reminder')), await text('.backup-reminder'));
await shot('nhac-sao-luu');
await click('[data-backup="snooze"]');
await sleep(250);
check('"Để mai": khung nhắc biến mất', !(await ev("!!document.querySelector('.backup-reminder')")));
await ev("localStorage.removeItem('tstb.backupSnooze')"); // giả như sang hôm sau
await go('cai-dat');
await go('rung');
check('hôm sau: nhắc lại', await ev("!!document.querySelector('.backup-reminder')"));
await go('cai-dat');
await click('[data-tab="data"]');
await sleep(250);
check('Cài đặt → Dữ liệu › Sao lưu cũng hiện khung nhắc', await ev("!!document.querySelector('#setBody .backup-reminder')"));
await click('#setBody [data-backup="export"]');
await sleep(300);
check('"Xuất ngay": hết nhắc ở Cài đặt', !(await ev("!!document.querySelector('.backup-reminder')")));
await go('rung');
check('…và ở Khu rừng', !(await ev("!!document.querySelector('.backup-reminder')")));
check('đã ghi mốc sao lưu', Date.now() - await ev("TSTB.backup.lastBackup()") < DAY);
await go('cai-dat');
await click('[data-tab="data"]');
await ev(`TSTB.db.run("DELETE FROM settings WHERE key = 'last_export_at'")`);
await go('rung');
await click('[data-backup="auto"]');
await sleep(300);
check('"Bật tự lưu ra file" mở thẳng Cài đặt → Dữ liệu › Sao lưu', /Tự lưu ra file/.test(await text('#setBody')) &&
  await ev("document.querySelector('[data-sub=\"data:backup\"]').classList.contains('on')"));

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
