// Edge case: bản chụp tự động — hằng ngày, trước khi nhập / xoá / khôi phục, giới hạn số bản, kiểm tra file nhập
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, fakeStorage, DAY } = require('../helpers/app');

const addClass = (T, name) => T.classes.save({ name, icon: '🧬', color: '#5fe08a', note: '' });
const names = T => T.db.query('SELECT name FROM classes ORDER BY id').map(r => r.name);
const reasons = async T => (await T.db.listSnapshots()).map(s => s.reason);

async function setup(t, storage = fakeStorage()) {
  const { T, toasts } = await boot();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-15T08:00:00+07:00') });
  t.mock.method(console, 'error', () => {});
  await T.db.init({ storage });
  t.after(() => T.db.init({ persist: false }));
  return { T, toasts, storage };
}

// File .sqlite của một DB khác (dùng chính ứng dụng để tạo rồi đổi tuỳ ý)
async function fileWith(T, edit) {
  const SQL = await globalThis.initSqlJs();
  const d = new SQL.Database(T.db.exportBytes());
  edit(d);
  const bytes = d.export();
  d.close();
  return bytes;
}

test('mở ứng dụng tạo bản chụp hằng ngày, mở lại trong ngày thì không chụp thêm', async t => {
  const { T, storage } = await setup(t);
  assert.deepEqual(await reasons(T), ['daily']);
  t.mock.timers.tick(DAY - 1000);
  await T.db.init({ storage });
  assert.deepEqual(await reasons(T), ['daily']);
  t.mock.timers.tick(1000);
  await T.db.init({ storage });
  assert.deepEqual(await reasons(T), ['daily', 'daily']);
});

test('nhập file: chụp dữ liệu cũ trước, khôi phục được đúng dữ liệu cũ', async t => {
  const { T } = await setup(t);
  addClass(T, 'Lop-Cu');
  const file = await fileWith(T, d => d.run("UPDATE classes SET name = 'Lop-Moi'"));
  t.mock.timers.tick(1000);
  await T.db.importBytes(file);
  assert.deepEqual(names(T), ['Lop-Moi']);
  const snap = (await T.db.listSnapshots()).find(s => s.reason === 'before-import');
  assert.ok(snap, 'có bản chụp trước khi nhập');

  t.mock.timers.tick(1000);
  await T.db.restoreSnapshot(snap.key);
  assert.deepEqual(names(T), ['Lop-Cu']);
  assert.equal((await reasons(T))[0], 'before-restore', 'khôi phục cũng chụp lại trước');
});

test('xoá toàn bộ: chụp trước, khôi phục được', async t => {
  const { T } = await setup(t);
  addClass(T, 'Lop-1');
  t.mock.timers.tick(1000);
  await T.db.reset();
  assert.deepEqual(names(T), []);
  const snap = (await T.db.listSnapshots()).find(s => s.reason === 'before-reset');
  await T.db.restoreSnapshot(snap.key);
  assert.deepEqual(names(T), ['Lop-1']);
});

test('khôi phục xong vẫn lưu được và mở lại vẫn còn', async t => {
  const { T, storage } = await setup(t);
  addClass(T, 'Lop-1');
  await T.db.reset();
  const snap = (await T.db.listSnapshots()).find(s => s.reason === 'before-reset');
  await T.db.restoreSnapshot(snap.key);
  await T.db.flush();
  await T.db.init({ storage });
  assert.deepEqual(names(T), ['Lop-1']);
});

test(`chỉ giữ ${5} bản chụp mới nhất`, async t => {
  const { T } = await setup(t);
  for (let i = 0; i < 7; i++) {
    t.mock.timers.tick(1000);
    addClass(T, 'L' + i);
    await T.db.reset();
  }
  const snaps = await T.db.listSnapshots();
  assert.equal(snaps.length, T.db.SNAP_MAX);
  assert.ok(snaps.every((s, i) => i === 0 || snaps[i - 1].at >= s.at), 'mới nhất trước');
  assert.ok(!snaps.some(s => s.reason === 'daily'), 'bản daily cũ nhất đã bị bỏ');
  await T.db.restoreSnapshot(snaps[0].key);
  assert.deepEqual(names(T), ['L6']);
});

test('không chụp được (đầy bộ nhớ) thì không cho nhập file / xoá toàn bộ', async t => {
  const storage = fakeStorage();
  const { T } = await setup(t, storage);
  addClass(T, 'Lop-1');
  const file = await fileWith(T, d => d.run('DELETE FROM classes'));
  const set = storage.set;
  storage.set = async (key, v) => { if (key.startsWith('snap:')) throw new Error('QuotaExceededError'); return set(key, v); };
  await assert.rejects(T.db.importBytes(file), /Không tạo được bản chụp an toàn/);
  await assert.rejects(T.db.reset(), /Không tạo được bản chụp an toàn/);
  assert.deepEqual(names(T), ['Lop-1'], 'dữ liệu giữ nguyên');
  addClass(T, 'Lop-2'); // DB vẫn dùng được sau khi bị từ chối
  assert.deepEqual(names(T), ['Lop-1', 'Lop-2']);
});

test('lỗi chụp hằng ngày không chặn việc mở ứng dụng', async t => {
  const storage = fakeStorage();
  storage.keys = async () => { throw new Error('hỏng'); };
  const { T } = await setup(t, storage);
  addClass(T, 'Lop-1');
  assert.deepEqual(names(T), ['Lop-1']);
});

test('file không phải của ứng dụng bị từ chối, không tạo bản chụp', async t => {
  const { T } = await setup(t);
  await assert.rejects(T.db.importBytes(new Uint8Array([1, 2, 3, 4])), /không phải dữ liệu/);
  const empty = await fileWith(T, d => d.run('DROP TABLE classes'));
  await assert.rejects(T.db.importBytes(empty), /không phải dữ liệu/);
  assert.deepEqual(await reasons(T), ['daily']);
});

test('file từ phiên bản mới hơn bị từ chối', async t => {
  const { T } = await setup(t);
  addClass(T, 'Lop-1');
  const byPragma = await fileWith(T, d => d.run('PRAGMA user_version = 99'));
  await assert.rejects(T.db.importBytes(byPragma), /phiên bản mới hơn/);
  const bySetting = await fileWith(T, d => d.run("UPDATE settings SET value = '99' WHERE key = 'schema_version'"));
  await assert.rejects(T.db.importBytes(bySetting), /phiên bản mới hơn/);
  assert.deepEqual(names(T), ['Lop-1']);
});

test('file cùng phiên bản hoặc cũ hơn (chưa có schema_version) nhập được', async t => {
  const { T } = await setup(t);
  addClass(T, 'Lop-1');
  const old = await fileWith(T, d => d.run("DELETE FROM settings WHERE key = 'schema_version'"));
  await T.db.importBytes(old);
  assert.deepEqual(names(T), ['Lop-1']);
});

test('chế độ không lưu bền (test, tab đã mất quyền ghi): không có bản chụp, nhập vẫn chạy', async () => {
  const { T } = await boot();
  assert.deepEqual(await T.db.listSnapshots(), []);
  addClass(T, 'Lop-1');
  const file = T.db.exportBytes();
  await T.db.reset();
  await T.db.importBytes(file);
  assert.deepEqual(names(T), ['Lop-1']);
});
