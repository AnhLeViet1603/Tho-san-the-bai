// Edge case: nhắc sao lưu (mốc 7 ngày, xuất file / tự lưu ra file tính là đã sao lưu, "Để mai") và nhận ra lần mở đầu tiên
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass, fakeStorage, DAY } = require('../helpers/app');

// localStorage giả (Node không có sẵn) cho "Để mai"
function fakeLocalStorage(t) {
  const m = new Map();
  const ls = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  t.after(() => { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; });
  return ls;
}

async function setup(t) {
  const { T } = await boot();
  fakeLocalStorage(t);
  await T.fileSink.init({ picker: null });
  return T;
}

test('chưa có lớp nào: không nhắc', async t => {
  const T = await setup(t);
  assert.equal(T.backup.reminder(Date.now() + 100 * DAY), null);
});

test('chưa từng sao lưu: tính từ lúc tạo lớp đầu tiên, đủ 7 ngày mới nhắc', async t => {
  const T = await setup(t);
  seedClass(T);
  const now = Date.now();
  assert.equal(T.backup.reminder(now), null, 'vừa tạo lớp thì chưa nhắc');
  assert.equal(T.backup.reminder(now + 6 * DAY), null);
  assert.deepEqual(T.backup.reminder(now + 7 * DAY + 60000), { last: 0, days: 7 });
});

test('lớp trong thùng rác vẫn tính là có dữ liệu cần giữ', async t => {
  const T = await setup(t);
  const { classId } = seedClass(T);
  T.classes.archive(classId);
  assert.ok(T.backup.reminder(Date.now() + 8 * DAY));
});

test('xuất file sao lưu: hết nhắc, 7 ngày sau nhắc lại kèm ngày sao lưu gần nhất', async t => {
  const T = await setup(t);
  seedClass(T);
  const now = Date.now();
  T.settings.set('last_export_at', now + 10 * DAY); // xuất file vào ngày thứ 10
  assert.equal(T.backup.reminder(now + 10 * DAY + 1000), null);
  assert.equal(T.backup.reminder(now + 16 * DAY), null);
  assert.deepEqual(T.backup.reminder(now + 17 * DAY + 1000), { last: now + 10 * DAY, days: 7 });
});

test('đang tự lưu ra file: không nhắc; lần tự lưu gần nhất cũng tính là đã sao lưu', async t => {
  const T = await setup(t);
  t.mock.method(console, 'error', () => {});
  await T.db.init({ storage: fakeStorage() }); // tự lưu nhớ file đã chọn qua T.db.kv
  t.after(() => T.db.init({ persist: false }));
  seedClass(T);
  const file = {
    name: 'f.sqlite', perm: 'granted',
    queryPermission: async () => file.perm, requestPermission: async () => file.perm,
    createWritable: async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} })
  };
  await T.fileSink.init({ picker: async () => file });
  await T.fileSink.pick();
  assert.equal(T.backup.reminder(Date.now() + 30 * DAY), null, 'tự lưu đang chạy');

  // Quyền ghi bị thu lại: không còn tự lưu, nhưng lần ghi vừa rồi vẫn là một bản sao lưu
  file.perm = 'prompt';
  await T.fileSink.refreshPermission();
  const wrote = T.fileSink.state().lastWrite;
  assert.equal(T.backup.lastBackup(), wrote);
  assert.equal(T.backup.reminder(wrote + 6 * DAY), null);
  assert.ok(T.backup.reminder(wrote + 8 * DAY));
  await T.fileSink.init({ picker: null });
});

test('"Để mai": không nhắc trong hôm nay', async t => {
  const T = await setup(t);
  seedClass(T);
  const later = Date.now() + 8 * DAY;
  assert.ok(T.backup.reminder(later));
  T.backup.snooze();
  assert.equal(T.backup.reminder(later), null);
  localStorage.setItem('tstb.backupSnooze', '2000-01-01'); // giả như đã sang ngày khác
  assert.ok(T.backup.reminder(later));
});

test('localStorage bị chặn: vẫn nhắc bình thường, "Để mai" không làm lỗi', async t => {
  const T = await setup(t);
  seedClass(T);
  Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('bị chặn'); }, configurable: true });
  assert.doesNotThrow(() => T.backup.snooze());
  assert.ok(T.backup.reminder(Date.now() + 8 * DAY));
});

test('T.db.fresh(): đúng ở lần mở đầu tiên (hoặc khi dữ liệu trình duyệt bị xoá), sai ở các lần sau', async t => {
  const { T } = await boot();
  t.after(() => T.db.init({ persist: false }));
  const storage = fakeStorage();
  await T.db.init({ storage });
  assert.equal(T.db.fresh(), true);
  await T.db.init({ storage });
  assert.equal(T.db.fresh(), false, 'đã có dữ liệu lưu từ lần trước');
  await T.db.init({ storage: fakeStorage() });
  assert.equal(T.db.fresh(), true, 'dữ liệu trình duyệt bị xoá');
  await T.db.init({ persist: false });
  assert.equal(T.db.fresh(), false, 'chế độ không lưu bền không tính');
});
