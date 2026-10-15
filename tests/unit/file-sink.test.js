// Edge case: tự lưu ra file — gom 30s, quyền ghi bị thu hồi / xin lại, file mất, lỗi không đụng IndexedDB, tab mất quyền ghi
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, fakeStorage } = require('../helpers/app');

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const domErr = (name, msg = name) => Object.assign(new Error(msg), { name });

// File giả: perm = quyền hiện tại; grant = trả lời khi được xin quyền; fail = lỗi ném ra khi ghi
function fakeFile(name = 'tho-san-the-bai.sqlite') {
  const f = {
    name, perm: 'granted', grant: 'granted', fail: null, data: null, writes: 0, requests: 0,
    queryPermission: async () => f.perm,
    requestPermission: async () => { f.requests++; f.perm = f.grant; return f.perm; },
    createWritable: async () => {
      if (f.perm !== 'granted') throw domErr('NotAllowedError');
      if (f.fail) throw f.fail;
      let buf = null;
      return { write: async b => { buf = b; }, close: async () => { f.data = buf; f.writes++; }, abort: async () => {} };
    }
  };
  return f;
}

const addClass = (T, name) => T.classes.save({ name, icon: '🧬', color: '#5fe08a', note: '' });
// Đọc lớp trong bytes đã ghi ra file
async function classesIn(bytes) {
  const SQL = await globalThis.initSqlJs();
  const d = new SQL.Database(bytes);
  const st = d.prepare('SELECT name FROM classes ORDER BY id');
  const out = [];
  while (st.step()) out.push(st.get()[0]);
  st.free();
  d.close();
  return out;
}

async function setup(t, opts = {}) {
  const { T, toasts } = await boot();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'error', () => {});
  const storage = opts.storage || fakeStorage();
  await T.db.init({ storage });
  const file = opts.file || fakeFile();
  const picker = 'picker' in opts ? opts.picker : async () => file;
  await T.fileSink.init({ picker });
  t.after(async () => { await T.fileSink.init({ picker: null }); await T.db.init({ persist: false }); });
  // Đồng hồ giả chạy timer ngay trong tick(), còn hẹn ghi file chỉ được đặt SAU khi IndexedDB lưu xong (bất đồng bộ):
  // phải tick riêng 300ms (lưu IndexedDB) rồi mới tick 30s (ghi file)
  const tick = async ms => { t.mock.timers.tick(ms); await settle(); };
  return { T, toasts, storage, file, tick };
}

test('trình duyệt không có API: trạng thái "unsupported", ứng dụng chạy như cũ', async t => {
  const { T, tick } = await setup(t, { picker: null });
  assert.equal(T.fileSink.state().status, 'unsupported');
  addClass(T, '10A1');
  await tick(31000);
  assert.equal(T.db.status(), 'saved');
});

test('chưa chọn file: "off"; chọn file thì ghi ngay toàn bộ dữ liệu', async t => {
  const { T, file } = await setup(t);
  assert.equal(T.fileSink.state().status, 'off');
  addClass(T, '10A1');
  assert.equal(await T.fileSink.pick(), true);
  assert.equal(T.fileSink.state().status, 'ok');
  assert.equal(T.fileSink.state().name, 'tho-san-the-bai.sqlite');
  assert.deepEqual(await classesIn(file.data), ['10A1']);
  assert.ok(T.fileSink.state().lastWrite);
});

test('người dùng huỷ hộp chọn file: không đổi gì', async t => {
  const { T } = await setup(t, { picker: async () => { throw domErr('AbortError'); } });
  assert.equal(await T.fileSink.pick(), false);
  assert.equal(T.fileSink.state().status, 'off');
});

test('thay đổi được gom: nhiều lần lưu trong 30s chỉ ghi file một lần, sau 30s', async t => {
  const { T, file, tick } = await setup(t);
  await T.fileSink.pick();
  const base = file.writes;
  addClass(T, 'A');
  await tick(300);
  addClass(T, 'B');
  await tick(300);
  assert.equal(file.writes, base, 'chưa tới 30s');
  await tick(T.fileSink.GATHER);
  assert.equal(file.writes, base + 1);
  assert.deepEqual(await classesIn(file.data), ['A', 'B']);
  await tick(T.fileSink.GATHER * 2);
  assert.equal(file.writes, base + 1, 'không có gì mới thì không ghi lại');
});

test('flush() (khi ẩn trang / chuyển tab) ghi ngay, không chờ 30s', async t => {
  const { T, file, tick } = await setup(t);
  await T.fileSink.pick();
  addClass(T, 'A');
  await tick(300);
  await T.fileSink.flush();
  assert.deepEqual(await classesIn(file.data), ['A']);
});

test('mở lại ứng dụng: nhớ file đã chọn; quyền còn thì tiếp tục ghi, mất quyền thì chờ người dùng bấm', async t => {
  const storage = fakeStorage();
  const file = fakeFile();
  const { T, tick } = await setup(t, { storage, file });
  await T.fileSink.pick();

  // Mở lại khi quyền vẫn còn ("Cho phép mọi lần truy cập")
  await T.db.init({ storage });
  await T.fileSink.init({ picker: async () => file });
  assert.equal(T.fileSink.state().status, 'ok');
  assert.equal(T.fileSink.state().name, file.name);

  // Mở lại sau khi khởi động lại trình duyệt, quyền về "prompt"
  file.perm = 'prompt';
  await T.db.init({ storage });
  await T.fileSink.init({ picker: async () => file });
  assert.equal(T.fileSink.state().status, 'needs-permission');
  addClass(T, 'Lop-Moi');
  await tick(300);
  await tick(T.fileSink.GATHER);
  assert.equal(file.requests, 0, 'không tự hỏi quyền (phải có cú bấm)');
  assert.ok(!(await classesIn(file.data)).includes('Lop-Moi'), 'chưa ghi khi chưa có quyền');

  assert.equal(await T.fileSink.resume(), true);
  assert.equal(T.fileSink.state().status, 'ok');
  assert.ok((await classesIn(file.data)).includes('Lop-Moi'), 'được quyền thì ghi ngay phần còn thiếu');
});

test('người dùng không cho phép khi được hỏi: vẫn chờ, không lỗi', async t => {
  const { T, file } = await setup(t);
  await T.fileSink.pick();
  file.perm = 'prompt';
  file.grant = 'denied';
  await T.fileSink.refreshPermission();
  assert.equal(await T.fileSink.resume(), false);
  assert.equal(T.fileSink.state().status, 'needs-permission');
});

test('quyền bị thu hồi giữa chừng: chuyển sang chờ quyền, xin lại thì ghi tiếp', async t => {
  const { T, file, tick } = await setup(t);
  await T.fileSink.pick();
  file.perm = 'denied';
  addClass(T, 'A');
  await tick(300);
  await tick(T.fileSink.GATHER);
  assert.equal(T.fileSink.state().status, 'needs-permission');
  file.grant = 'granted';
  await T.fileSink.resume();
  assert.deepEqual(await classesIn(file.data), ['A']);
});

test('file bị xoá / đổi tên: báo lỗi rõ ràng, IndexedDB vẫn lưu bình thường', async t => {
  const { T, file, tick } = await setup(t);
  await T.fileSink.pick();
  file.fail = domErr('NotFoundError');
  addClass(T, 'A');
  await tick(300);
  await tick(T.fileSink.GATHER);
  assert.equal(T.fileSink.state().status, 'error');
  assert.match(T.fileSink.state().error, /chọn lại file/);
  assert.equal(T.db.status(), 'saved', 'lỗi file không ảnh hưởng việc lưu chính');

  // Chọn lại file khác → ghi đủ, kể cả thay đổi lúc lỗi
  const other = fakeFile('moi.sqlite');
  await T.fileSink.init({ picker: async () => other });
  await T.fileSink.pick();
  assert.deepEqual(await classesIn(other.data), ['A']);
});

test('lỗi ghi bất kỳ (ổ đầy…): báo lỗi, lần ghi sau được thì về "ok"', async t => {
  const { T, file, tick } = await setup(t);
  await T.fileSink.pick();
  file.fail = new Error('Ổ đĩa đầy');
  addClass(T, 'A');
  await tick(300);
  await tick(T.fileSink.GATHER);
  assert.equal(T.fileSink.state().status, 'error');
  file.fail = null;
  await T.fileSink.pick(); // "Chọn lại file" (cùng file)
  assert.equal(T.fileSink.state().status, 'ok');
  assert.deepEqual(await classesIn(file.data), ['A']);
});

test('tab mất quyền ghi (detach): không ghi file nữa', async t => {
  const { T, file, tick } = await setup(t);
  await T.fileSink.pick();
  const n = file.writes;
  T.db.detach();
  addClass(T, 'A');
  await tick(300);
  await tick(T.fileSink.GATHER);
  await T.fileSink.flush(true);
  assert.equal(file.writes, n);
});

test('tắt tự lưu: quên file, không ghi nữa; mở lại vẫn tắt', async t => {
  const storage = fakeStorage();
  const file = fakeFile();
  const { T, tick } = await setup(t, { storage, file });
  await T.fileSink.pick();
  const n = file.writes;
  await T.fileSink.disable();
  assert.equal(T.fileSink.state().status, 'off');
  addClass(T, 'A');
  await tick(300);
  await tick(T.fileSink.GATHER);
  assert.equal(file.writes, n);
  await T.fileSink.init({ picker: async () => file });
  assert.equal(T.fileSink.state().status, 'off');
});

test('file tự lưu nhập lại được sau khi dữ liệu trình duyệt bị xoá', async t => {
  const { T, file, tick } = await setup(t);
  await T.fileSink.pick();
  addClass(T, 'Lop-Quan-Trong');
  await tick(300);
  await T.fileSink.flush();
  // Dữ liệu trình duyệt bị xoá: kho mới tinh
  await T.db.init({ storage: fakeStorage() });
  assert.equal(T.classes.list().length, 0);
  await T.db.importBytes(file.data);
  assert.deepEqual(T.classes.list().map(c => c.name), ['Lop-Quan-Trong']);
});

test('onChange báo trạng thái cho thanh bên', async t => {
  const { T, file } = await setup(t);
  const seen = [];
  const off = T.fileSink.onChange(s => seen.push(s.status));
  await T.fileSink.pick();
  file.perm = 'prompt';
  await T.fileSink.refreshPermission();
  off();
  assert.deepEqual(seen, ['off', 'ok', 'ok', 'needs-permission']);
});

test('listener tự huỷ đăng ký giữa lúc phát sự kiện không làm listener sau bị bỏ sót', async t => {
  const { T, file } = await setup(t);
  await T.fileSink.pick();
  const seen = [];
  let offA = null;
  offA = T.fileSink.onChange(() => { if (offA) offA(); });
  T.fileSink.onChange(s => seen.push(s.status));
  file.perm = 'prompt';
  await T.fileSink.refreshPermission();
  assert.deepEqual(seen, ['ok', 'needs-permission']);
});
