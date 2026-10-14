// Test giao diện bằng trình duyệt thật (Edge/Chrome headless) qua DevTools Protocol.
// Chạy:  node tests/ui/run-ui.mjs
// Dùng hồ sơ trình duyệt tạm nên không đụng tới dữ liệu thật của ứng dụng.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tstb-ui-'));
const SHOTS = path.join(TMP, 'screenshots');
fs.mkdirSync(SHOTS);
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
const exe = process.env.BROWSER_PATH || BROWSERS.find(p => fs.existsSync(p));
if (!exe) { console.error('Không tìm thấy Edge/Chrome. Đặt biến BROWSER_PATH.'); process.exit(2); }

// ---------- File mẫu để upload ----------
const XLSX = createRequire(import.meta.url)(path.join(ROOT, 'vendor', 'xlsx.full.min.js'));
const xlsxPath = path.join(TMP, 'lop.xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['STT', 'Họ tên'], [1, 'Nguyễn An'], [2, 'Trần Bình'], [3, ''], [4, 'Lê Chi'], [5, 'Phạm Dũng'], [6, 'Đỗ Em']
]), 'DS');
fs.writeFileSync(xlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
const pngPath = path.join(TMP, 'card.png');
fs.writeFileSync(pngPath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8Dwn4EIwDiqkL4KAbERCAGq3FzGAAAAAElFTkSuQmCC', 'base64'));

// ---------- Kết nối trình duyệt ----------
const browser = spawn(exe, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(TMP, 'profile')}`, 'about:blank'], { stdio: 'ignore' });
let tabs;
for (let i = 0; i < 100 && !tabs; i++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let seq = 0;
const pending = new Map();
const pageErrors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') {
    pageErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  }
};
const send = (method, params = {}) => new Promise(r => { pending.set(++seq, d => r(d.result || {})); ws.send(JSON.stringify({ id: seq, method, params })); });

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const q = s => JSON.stringify(s);
const click = sel => ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) throw new Error('Không thấy ' + ${q(sel)}); e.click(); })()`);
const fill = (sel, value) => ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) throw new Error('Không thấy ' + ${q(sel)});
  e.value = ${q(String(value))}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const count = sel => ev(`document.querySelectorAll(${q(sel)}).length`);
const text = sel => ev(`(document.querySelector(${q(sel)}) || {}).innerText || ''`);
const go = async route => { await ev(`location.hash = '#/${route}'`); await sleep(350); };
const modalOk = () => ev(`[...document.querySelectorAll('.modal-wrap:last-of-type footer .btn')].pop().click()`);
const closeModal = () => click('.modal-wrap:last-of-type [data-x]');
async function upload(sel, file) {
  const r = await send('Runtime.evaluate', { expression: `document.querySelector(${q(sel)})` });
  await send('DOM.setFileInputFiles', { objectId: r.result.objectId, files: [file] });
}
async function waitFor(expression, ms = 6000) {
  for (let t = 0; t < ms; t += 100) { if (await ev(expression)) return true; await sleep(100); }
  return false;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
}

// ---------- Khung test ----------
const results = [];
let section = '';
function check(name, ok, detail) {
  results.push({ section, name, ok: !!ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || detail === undefined ? '' : '  → ' + JSON.stringify(detail)}`);
}
async function group(name, fn) {
  section = name;
  console.log('\n' + name);
  try { await fn(); } catch (err) { check('không lỗi khi chạy kịch bản', false, err.message); await shot('loi-' + results.length); }
}

await send('Runtime.enable');
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP });
await waitFor("document.getElementById('app') && !document.getElementById('app').hidden", 20000);

// ============================================================
await group('1. Khởi động', async () => {
  check('ứng dụng mở được qua file://', await ev("!document.getElementById('app').hidden"));
  check('footer ghi số phiên bản', /^Thợ Săn Thẻ Bài v\d+\.\d+\.\d+$/.test((await text('.side-ver')).trim()), await text('.side-ver'));
  check('trạng thái trống ở Khu rừng', /Khu rừng còn trống/.test(await text('.view')));
  check('thanh điều hướng có 5 mục, không còn tab Chia nhóm', await count('#nav a') === 5 && !/Chia nhóm/.test(await text('#nav')));
  for (const r of ['tiet', 'the-bai', 'thong-ke']) {
    await go(r);
    check(`#/${r} không lỗi khi chưa có lớp`, !/Có lỗi khi hiển thị/.test(await text('.view')), await text('.view'));
  }
});

await group('2. Cài đặt: lớp học', async () => {
  await go('cai-dat');
  await click('[data-act="add"]');
  await modalOk(); // tên trống
  check('không lưu được lớp khi bỏ trống tên', await count('.modal-wrap') === 1);
  await fill('.modal [name="name"]', '10A1 <b>x</b>');
  await ev("document.querySelectorAll('.modal .emoji-grid button')[4].click()");
  check('bấm emoji điền vào ô icon', await ev("document.querySelector('.modal [name=icon]').value") === '🧬');
  await modalOk();
  await sleep(200);
  check('lớp xuất hiện trong bảng', /10A1/.test(await text('#setBody table')));
  check('tên lớp chứa HTML được hiển thị dạng chữ, không chèn thẻ', await count('#setBody table td b b') === 0);
  check('thanh bên hiện lớp đang chọn', /10A1/.test(await text('#sideClass')));

  await click('[data-act="add"]');
  await fill('.modal [name="name"]', '11B2');
  await modalOk();
  await sleep(200);
  await click('#setBody tbody tr:nth-child(2) [data-act="up"]');
  await sleep(200);
  check('đổi thứ tự lớp bằng nút ↑', /11B2/.test(await text('#setBody tbody tr:nth-child(1)')));
  await click('#setBody tbody tr:nth-child(1) [data-act="del"]');
  check('xoá lớp phải xác nhận', await count('.confirm-msg') === 1);
  await modalOk();
  await sleep(200);
  check('lớp bị xoá sau khi xác nhận', await count('#setBody tbody tr') === 1);
});

await group('3. Cài đặt: học sinh + Import Excel', async () => {
  await click('[data-tab="students"]');
  await sleep(200);
  await fill('#addStudent input', '  Nguyễn   An ');
  await ev("document.querySelector('#addStudent').requestSubmit()");
  await sleep(200);
  check('thêm học sinh bằng form, tên được gọn khoảng trắng', await text('#setBody tbody tr td:nth-child(2)') === 'Nguyễn An');

  await click('[data-act="import"]');
  await upload('.modal [data-f="file"]', xlsxPath);
  await waitFor("/học sinh sẽ được thêm|Không tìm thấy/.test(document.querySelector('.modal .preview').innerText)");
  check('cột A (mặc định) đọc ra cột STT', /6 học sinh/.test(await text('.modal .preview')), await text('.modal .preview'));
  await fill('.modal [data-f="col"]', '1');
  check('cột nhập sai báo lỗi', /Cột không hợp lệ/.test(await text('.modal .preview')));
  await fill('.modal [data-f="col"]', 'b');
  const preview = await text('.modal .preview');
  check('đổi sang cột B: 4 tên mới, bỏ qua 1 tên trùng và ô trống', /4 học sinh/.test(preview) && /bỏ qua 1 tên trùng/.test(preview), preview);
  await modalOk();
  await sleep(300);
  check('import xong lớp có 5 học sinh', await count('#setBody tbody tr') === 5);

  await click('#setBody tbody tr:nth-child(5) [data-act="toggle"]');
  await sleep(200);
  check('ẩn học sinh: dòng mờ đi', await count('#setBody tbody tr.off') === 1);
  await go('tiet');
  check('học sinh đã ẩn không hiện ở Tiết học', await count('.stu') === 4);
  await go('cai-dat');
  await click('#setBody tbody tr:nth-child(5) [data-act="toggle"]');
  await sleep(200);
});

await group('4. Tiết học: cộng điểm cá nhân', async () => {
  await go('tiet');
  check('5 ô học sinh', await count('.stu') === 5);
  await click('.stu [data-act="speak"]');
  await sleep(200);
  check('bấm Phát biểu cộng 1 ATP', await text('.stu .stu-atp b') === '1');
  check('có thông báo nhỏ gọn', await count('.toast') >= 1);

  await fill('.toolbar .search', 'trần');
  check('tìm kiếm lọc còn 1 học sinh', await count('.stu:not([hidden])') === 1);
  await click('[data-act="all"]');
  await sleep(200);
  check('"Chọn tất cả" chỉ chọn học sinh đang hiện', await count('.stu.sel') === 1);
  check('ô tìm kiếm giữ nguyên sau khi vẽ lại', await ev("document.querySelector('.toolbar .search').value") === 'trần');
  await fill('.toolbar .search', '');
  await click('[data-act="all"]');
  await sleep(200);
  await click('[data-bulk="score_9_plus"]');
  await sleep(200);
  check('cộng hàng loạt cho 5 em', await ev("[...document.querySelectorAll('.stu .stu-atp b')].map(b => b.textContent).join()") === '4,3,3,3,3');
  await click('[data-act="none"]');
  await sleep(150);
  await click('[data-bulk="speak"]');
  await sleep(150);
  check('cộng hàng loạt khi chưa chọn ai: không ghi gì', await ev("[...document.querySelectorAll('.stu .stu-atp b')].map(b => b.textContent).join()") === '4,3,3,3,3');

  await click('[data-head="undo"]');
  await sleep(200);
  check('Hoàn tác bỏ cả lượt cộng hàng loạt', await ev("[...document.querySelectorAll('.stu .stu-atp b')].map(b => b.textContent).join()") === '1,0,0,0,0');
  await click('[data-head="history"]');
  check('Lịch sử có 1 dòng', await count('.modal tbody tr') === 1);
  await click('.modal [data-del]');
  await sleep(200);
  check('xoá trong Lịch sử: hết dòng', await count('.modal tbody tr') === 0);
  await closeModal();
  await sleep(200);
  check('ATP về 0 sau khi xoá', await text('.stu .stu-atp b') === '0');

  await click('.stu [data-act="manual"]');
  await fill('.modal [name="amount"]', '-2');
  await modalOk();
  await sleep(200);
  check('trừ điểm thủ công ra số âm', await text('.stu .stu-atp b') === '-2');
  await click('[data-head="undo"]');
  await sleep(200);

  // Gõ số rồi nhấn Enter bằng bàn phím thật, không bấm nút Ghi nhận
  await click('.stu [data-act="manual"]');
  await ev("(() => { const i = document.querySelector('.modal [name=\"amount\"]'); i.focus(); i.value = '3'; })()");
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', text: String.fromCharCode(13) }, enter));
  await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, enter));
  await sleep(300);
  check('nhấn Enter trong hộp Cộng / trừ ATP: ghi nhận và đóng hộp thoại',
    await count('.modal-wrap') === 0 && await text('.stu .stu-atp b') === '3', await text('.stu .stu-atp b'));
  await click('[data-head="undo"]');
  await sleep(200);
});

await group('5. Tiến hoá: lật thẻ', async () => {
  await go('cai-dat');
  await click('[data-tab="atp"]');
  await sleep(200);
  await fill('#atpForm [name="evolve_threshold"]', '6');
  await ev("document.querySelector('#atpForm').requestSubmit()");
  await go('tiet');
  await click('.stu [data-act="score_9_plus"]');
  await sleep(200);
  check('3 ATP: chưa mở màn lật thẻ', await count('.evo-row') === 0);
  await click('.stu [data-act="score_9_plus"]');
  await sleep(700);
  check('6 ATP: màn lật thẻ tự mở với 3 thẻ úp', await count('.evo .flip') === 3);
  check('mặt trước thẻ chưa lộ (chưa lật)', await count('.flip.picked') === 0);
  await shot('05-lat-the-up');
  await click('.evo-later');
  check('"Để sau" đóng màn lật mà không mất lượt', await count('.evo-row') === 0 && await count('.stu .evo-btn') === 1);

  await click('.stu .evo-btn');
  await sleep(700);
  await ev("document.querySelectorAll('.flip')[1].click(); document.querySelectorAll('.flip')[0].click()");
  check('chỉ lật được 1 thẻ dù bấm 2 thẻ', await count('.flip.picked') === 1 && await ev("TSTB.db.scalar('SELECT COUNT(*) FROM student_cards')") === 1);
  await sleep(1500);
  const box = await ev(`(() => { const r = document.querySelector('.flip.picked').getBoundingClientRect();
    return { cx: r.left + r.width / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom }; })()`);
  check('thẻ được chọn nằm giữa màn hình và phóng to', Math.abs(box.cx - 720) < 4 && box.h > 420, box);
  check('thẻ phóng to không tràn ra ngoài màn hình', box.top >= 0 && box.bottom <= 900, box);
  check('hiện tên thẻ, đặc quyền và ghi chú hạn dùng', await ev("!document.querySelector('.evo-result').hidden")
    && /Hạn \d+ ngày · dùng được từ tuần sau/.test(await text('.evo-note')), await text('.evo-result'));
  const overlap = await ev(`(() => { const a = document.querySelector('.flip.picked').getBoundingClientRect();
    const b = document.querySelector('.evo-result h2').getBoundingClientRect(); return b.top - a.bottom; })()`);
  check('phần chữ kết quả không đè lên thẻ', overlap >= 0, overlap);
  await shot('05-lat-the-ket-qua');
  await click('.evo-result [data-close]');
  await sleep(200);
  check('sau khi nhận: ô học sinh hiện 🃏 1 và hết nút lật', /1/.test(await text('.stu .evo-own')) && await count('.stu .evo-btn') === 0);
});

await group('6. Bảng thẻ của học sinh', async () => {
  await click('.stu [data-act="board"]');
  check('bảng thẻ hiện 1 lá đang bị khoá (tuần vừa nhận)', await count('.card-pick.locked') === 1);
  await click('.card-pick');
  await sleep(200);
  check('bấm thẻ đang khoá: không dùng, không hỏi xác nhận', await count('.confirm-msg') === 0 && await count('.card-pick') === 1);
  await shot('06-bang-the-khoa');
  await closeModal();
  await sleep(200);

  const week = await ev("TSTB.store.state.week");
  await fill('[data-pick="week"]', week === 5 ? 4 : week + 1);
  await sleep(250);
  await click('.stu [data-act="board"]');
  check('sang tuần khác: thẻ mở khoá', await count('.card-pick.locked') === 0 && await count('.card-pick') === 1);
  await click('.card-pick');
  await sleep(200);
  check('bấm thẻ: hỏi xác nhận trước khi dùng', await count('.confirm-msg') === 1);
  await ev("[...document.querySelectorAll('.modal-wrap')].pop().querySelector('footer .btn.ghost').click()");
  await sleep(150);
  check('bấm Huỷ: thẻ vẫn còn', await count('.card-pick') === 1);
  await click('.card-pick');
  await sleep(200);
  await ev("[...document.querySelectorAll('.modal-wrap')].pop().querySelector('footer .btn:last-child').click()");
  await sleep(250);
  check('xác nhận dùng: thẻ biến mất khỏi bảng', await count('.card-pick') === 0 && /chưa giữ thẻ/.test(await text('.modal')));
  await closeModal();
  await sleep(200);
  check('ô học sinh về 🃏 0', /0/.test(await text('.stu .evo-own')));
});

await group('7. Chế độ Nhóm trong Tiết học', async () => {
  await click('[data-mode="group"]');
  await sleep(200);
  check('bảng nhóm hiện ngay trong tab Tiết học', await count('.board .group.pool') === 1 && /#\/tiet/.test(await ev('location.hash')));
  await fill('#groupCount', '2');
  await click('[data-act="create"]');
  await sleep(200);
  check('tạo 2 nhóm', await count('.board .group:not(.pool)') === 2);
  await click('[data-act="shuffle"]');
  await sleep(200);
  check('chia ngẫu nhiên: không còn ai ngoài nhóm', await count('.group.pool .chip') === 0 && await count('.group:not(.pool) .chip') === 5);

  await ev(`(() => { const chip = document.querySelector('.group:not(.pool) .chip'); const pool = document.querySelector('.group.pool');
    const dt = new DataTransfer();
    chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    pool.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    pool.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
  await sleep(200);
  check('kéo thả đưa 1 học sinh về "Chưa có nhóm"', await count('.group.pool .chip') === 1);
  await click('[data-act="shuffle"]');
  await sleep(200);

  // Cộng cho cả hai nhóm đủ mốc: nhiều em cùng đạt
  for (const i of [1, 2]) {
    await click(`.board .group:not(.pool):nth-of-type(${i + 1}) [data-give="manual"]`);
    await fill('.modal [name="amount"]', '6');
    await modalOk();
    await sleep(250);
  }
  check('cộng điểm nhóm đủ mốc: KHÔNG mở màn lật thẻ', await count('.evo-row') === 0);
  // Đo từng thông báo (không đo khung chứa) để bắt được cả trường hợp thông báo bị phủ kín màn hình
  const toast = await ev(`(() => { const rects = [...document.querySelectorAll('.toast')].map(t => t.getBoundingClientRect());
    return { n: rects.length, w: Math.round(Math.max(...rects.map(r => r.width))), h: Math.round(Math.max(...rects.map(r => r.height))),
      area: Math.round(rects.reduce((a, r) => a + r.width * r.height, 0) / (innerWidth * innerHeight) * 100),
      corner: rects.every(r => r.left > innerWidth / 2 && r.top > innerHeight / 2),
      texts: [...document.querySelectorAll('.toast')].map(t => t.innerText) }; })()`);
  check('thông báo nhóm gọn ở góc dưới phải: tối đa 3 cái, rộng ≤ 360px, cao ≤ 120px, chiếm < 6% màn hình',
    toast.n >= 1 && toast.n <= 3 && toast.w <= 360 && toast.h <= 120 && toast.area < 6 && toast.corner, toast);
  check('thông báo nhắc về chế độ Cá nhân để lật thẻ', toast.texts.some(t => /Cá nhân/.test(t)), toast.texts);
  await shot('07-nhom-thong-bao');
  check('học sinh đủ mốc được tô nổi trong nhóm', await count('.chip.ready') >= 4);
  await ev("document.querySelector('.chip.ready').click()");
  await sleep(200);
  check('bấm tên trong nhóm không mở màn lật thẻ', await count('.evo-row') === 0);
  check('điểm nhóm hiển thị 6', /6/.test(await text('.group:not(.pool) header .atp')));

  await click('[data-mode="solo"]');
  await sleep(200);
  check('về Cá nhân: có nút lật thẻ cho từng em', await count('.stu .evo-btn') >= 4);
});

await group('8. Tab Thẻ tiến hoá', async () => {
  await go('the-bai');
  check('hiện bộ 5 thẻ kèm hạn dùng', await count('.pcard-grid .pcard') === 5 && /Hạn 30 ngày/.test(await text('.pcard-grid')));
  check('bảng học sinh của lớp', await count('table.pick tbody tr') === 5);
  check('lịch sử có 1 thẻ đã dùng', await count('[data-act="unuse"]') === 1);
  await click('[data-act="unuse"]');
  await sleep(200);
  check('Hoàn tác: thẻ quay lại học sinh', await count('[data-act="unuse"]') === 0 && await count('table.pick .chip') === 1);
  await click('table.pick tbody tr td');
  check('bấm vào học sinh mở bảng thẻ của em đó', await count('.modal .card-pick') === 1);
  await closeModal();
});

await group('8b. Giáo viên sửa thẻ của học sinh', async () => {
  const formOk = () => ev("[...document.querySelectorAll('.modal-wrap')].pop().querySelector('footer .btn:last-child').click()");
  await click('table.pick tbody tr td');
  check('mỗi lá có nút Sửa và Xoá', await count('.card-pick [data-tool="edit"]') === 1 && await count('.card-pick [data-tool="remove"]') === 1);
  const oldName = await text('.card-pick .pcard-info b');

  await click('.card-pick [data-tool="edit"]');
  await sleep(200);
  check('bấm Sửa: mở form, không hỏi dùng thẻ',
    await count('select[name="card"]') === 1 && await count('input[name="expires"][type="date"]') === 1 && await count('.confirm-msg') === 0);
  check('danh sách loại thẻ: thẻ hiện tại + các thẻ chưa giữ', await count('select[name="card"] option') === 5);
  await fill('input[name="expires"]', '2099-12-31');
  await formOk();
  await sleep(250);
  check('sửa hạn: bảng thẻ hiện ngày mới', /31\/12\/2099/.test(await text('.card-pick')), await text('.card-pick'));

  await click('.card-pick [data-tool="edit"]');
  await sleep(200);
  await ev("(() => { const s = document.querySelector('select[name=\"card\"]'); s.value = s.options[1].value; })()");
  await formOk();
  await sleep(250);
  const newName = await text('.card-pick .pcard-info b');
  check('đổi thẻ: lá bài thành loại khác, hạn tính lại theo thẻ mới',
    newName && newName !== oldName && !/2099/.test(await text('.card-pick')), newName);
  await shot('08b-sua-the');

  await click('.card-pick [data-tool="edit"]');
  await sleep(200);
  await fill('input[name="expires"]', '');
  await formOk();
  await sleep(250);
  check('bỏ trống ngày: thẻ không hết hạn', /Không hết hạn/.test(await text('.card-pick')));

  await click('.card-pick [data-tool="remove"]');
  await sleep(200);
  await fill('select[name="mode"]', 'discard');
  await formOk();
  await sleep(250);
  check('xoá thẻ: biến mất khỏi bảng', await count('.card-pick') === 0);
  await closeModal();
  await sleep(250);
  check('lịch sử ghi “Giáo viên xoá” kèm nút Hoàn tác',
    /Giáo viên xoá/.test(await text('#view')) && await count('[data-act="unuse"]') === 1);
  await click('[data-act="unuse"]');
  await sleep(200);
  check('Hoàn tác: thẻ quay lại học sinh', await count('[data-act="unuse"]') === 0 && await count('table.pick .chip') === 1);
});

await group('9. Thống kê', async () => {
  await go('thong-ke');
  await sleep(400);
  check('7 khung biểu đồ', await count('.chart-box') === 7);
  check('có biểu đồ được vẽ', await count('.chart-box canvas') >= 5, await count('.chart-box canvas'));
  const total = await text('.kpi b');
  await fill('[data-f="type"]', 'speak');
  await sleep(300);
  check('lọc theo loại làm đổi tổng ATP', await text('.kpi b') !== total, [total, await text('.kpi b')]);
  await fill('[data-f="type"]', 'manual');
  await sleep(300);
  await click('[data-sort="name"]');
  await sleep(300);
  check('sắp xếp bảng xếp hạng theo tên', await ev(`(() => { const n = [...document.querySelectorAll('table.sortable tbody tr td:nth-child(2)')].map(t => t.innerText);
    return n.length > 1 && n.join() === n.slice().sort((a, b) => a.localeCompare(b, 'vi')).join(); })()`));
  await click('#resetFilter');
  await sleep(300);
  check('Xoá bộ lọc đưa về mặc định', await ev("document.querySelector('[data-f=type]').value") === '');
  await shot('09-thong-ke');
});

await group('10. Cài đặt: thẻ, năm học', async () => {
  await go('cai-dat');
  await click('[data-tab="cards"]');
  await sleep(200);
  await fill('#expiryForm [name="days"]', '7');
  await ev("document.querySelector('#expiryForm').requestSubmit()");
  await sleep(200);
  check('đặt hạn dùng 7 ngày cho mọi thẻ', (await text('#setBody .pcard-grid')).match(/Hạn 7 ngày/g)?.length === 5);

  await click('#setBody [data-act="add"]');
  check('thẻ mới lấy hạn mặc định vừa đặt', await ev("document.querySelector('.modal [name=expire_days]').value") === '7');
  await fill('.modal [name="name"]', 'Thẻ Ảnh');
  await fill('.modal [name="description"]', '+1 điểm kiểm tra');
  await upload('.modal [data-img] input[type=file]', pngPath);
  check('upload ảnh hiện xem trước', await waitFor("!!document.querySelector('.modal .img-prev img')"));
  await modalOk();
  await sleep(300);
  check('thẻ mới hiển thị bằng ảnh đã upload', await count('#setBody .pcard-art img') === 1 && await count('#setBody .pcard') === 6);

  await click('[data-tab="atp"]');
  await sleep(200);
  const before = await ev('JSON.stringify(TSTB.schoolYear.get())');
  await fill('#atpForm [name="school_start"]', '2027-09-05');
  await ev("document.querySelector('#atpForm').requestSubmit()");
  await sleep(200);
  check('ngày bắt đầu sau ngày kết thúc bị từ chối', await ev('JSON.stringify(TSTB.schoolYear.get())') === before);
});

await group('11. Lưu bền + giao diện hẹp', async () => {
  await ev('TSTB.db.flush()');
  await send('Page.reload');
  await waitFor("document.getElementById('app') && !document.getElementById('app').hidden", 20000);
  await go('tiet');
  check('tải lại trang: dữ liệu còn nguyên', await count('.stu') === 5 && await ev("TSTB.cards.list().length") === 6);

  await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  for (const r of ['tiet', 'thong-ke', 'cai-dat']) {
    await go(r);
    const over = await ev('document.documentElement.scrollWidth - innerWidth');
    check(`#/${r} không tràn ngang ở màn hình 600px`, over <= 0, over);
  }
  await go('tiet');
  await shot('11-man-hep');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
});

await group('12. Xoá toàn bộ dữ liệu', async () => {
  await go('cai-dat');
  await click('[data-tab="data"]');
  await sleep(200);
  await click('[data-act="reset"]');
  await sleep(150);
  await modalOk();
  await sleep(200);
  check('phải xác nhận 2 lần', await count('.confirm-msg') === 1 && await ev('TSTB.classes.list().length') === 1);
  await modalOk();
  await sleep(500);
  check('sau 2 lần xác nhận: dữ liệu sạch, thẻ mẫu trở lại', await ev('TSTB.classes.list().length') === 0 && await ev('TSTB.cards.list().length') === 5);
});

section = 'Chung';
console.log('\nChung');
check('không có lỗi JavaScript nào trong suốt quá trình', pageErrors.length === 0, pageErrors);

// ---------- Tổng kết ----------
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt. Ảnh chụp: ${SHOTS}`);
failed.forEach(f => console.log(`  ✗ [${f.section}] ${f.name}`));
ws.close();
browser.kill();
process.exit(failed.length ? 1 : 0);
