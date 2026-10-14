// Edge case: lưu vào IndexedDB — gom thay đổi, thử lại khi lỗi, trạng thái "chưa lưu", dừng ghi khi mất quyền
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('../helpers/app');

// Chờ các promise đang dở chạy xong (setImmediate không bị mock timers chặn)
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

// Kho lưu giả thay IndexedDB; fails = số lần ghi tiếp theo sẽ lỗi
function fakeStorage(fails = 0) {
  const s = {
    data: null, fails, writes: 0,
    get: async () => s.data,
    set: async bytes => {
      s.writes++;
      if (s.fails > 0) { s.fails--; throw new Error('QuotaExceededError'); }
      s.data = bytes;
    }
  };
  return s;
}

const addClass = (T, name) => T.classes.save({ name, icon: '🧬', color: '#5fe08a', note: '' });
const classCount = T => T.db.scalar('SELECT COUNT(*) FROM classes');

async function setup(t, fails) {
  const { T, toasts } = await boot();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'error', () => {}); // lỗi ghi giả là cố ý
  const storage = fakeStorage(fails);
  await T.db.init({ storage });
  t.after(() => T.db.init({ persist: false }));
  return { T, toasts, storage };
}

test('thay đổi được gom lại và lưu sau 300ms', async t => {
  const { T, storage } = await setup(t);
  assert.equal(T.db.status(), 'saved');
  const before = storage.writes;
  addClass(T, '10A1');
  addClass(T, '10A2');
  assert.equal(T.db.status(), 'pending');
  assert.equal(T.db.dirty(), true);
  t.mock.timers.tick(300);
  await settle();
  assert.equal(storage.writes, before + 1);
  assert.equal(T.db.status(), 'saved');
  assert.equal(T.db.dirty(), false);
});

test('lưu lỗi: giữ trạng thái chưa lưu, thử lại sau 1s rồi 3s, chỉ báo lỗi một lần', async t => {
  const { T, toasts, storage } = await setup(t, 2);
  assert.equal(T.db.status(), 'error');
  assert.equal(T.db.dirty(), true);
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(T.db.status(), 'error');
  assert.equal(storage.writes, 2);
  t.mock.timers.tick(3000);
  await settle();
  assert.equal(storage.writes, 3);
  assert.equal(T.db.status(), 'saved');
  assert.equal(T.db.dirty(), false);
  assert.equal(toasts.filter(x => x.kind === 'error').length, 1);
});

test('thay đổi trong lúc đang lỗi được lưu luôn ở lần thử lại thành công', async t => {
  const { T, storage } = await setup(t, 1);
  addClass(T, '10A1');
  assert.equal(T.db.status(), 'error', 'vẫn báo lỗi cho tới khi lưu được');
  t.mock.timers.tick(300);
  await settle();
  assert.equal(storage.writes, 1, 'không thử lại sớm hơn lịch');
  t.mock.timers.tick(700);
  await settle();
  assert.equal(T.db.status(), 'saved');
  await T.db.init({ storage });
  assert.equal(classCount(T), 1);
});

test('lỗi kéo dài: cứ 10s thử lại một lần, không dừng', async t => {
  const { T, storage } = await setup(t, 100);
  for (const ms of [1000, 3000, 10000, 10000, 10000]) {
    const n = storage.writes;
    t.mock.timers.tick(ms - 1);
    await settle();
    assert.equal(storage.writes, n, `chưa thử lại trước ${ms}ms`);
    t.mock.timers.tick(1);
    await settle();
    assert.equal(storage.writes, n + 1, `thử lại sau ${ms}ms`);
  }
  assert.equal(T.db.status(), 'error');
});

test('thay đổi xảy ra khi đang ghi thì được ghi tiếp ở lượt sau', async t => {
  const { T, storage } = await setup(t);
  let release;
  storage.set = bytes => { storage.writes++; return new Promise(r => { release = () => { storage.data = bytes; r(); }; }); };
  addClass(T, '10A1');
  t.mock.timers.tick(300);
  await settle();
  assert.equal(T.db.status(), 'saving');
  addClass(T, '10A2'); // đổi giữa chừng
  release();
  await settle();
  assert.equal(T.db.dirty(), true, 'bản vừa ghi chưa có lớp 10A2');
  t.mock.timers.tick(300);
  await settle();
  release();
  await settle();
  assert.equal(T.db.status(), 'saved');
  storage.set = async b => { storage.data = b; };
  await T.db.init({ storage });
  assert.equal(classCount(T), 2);
});

test('flush() chờ lượt ghi đang dở rồi ghi nốt phần còn lại', async t => {
  const { T, storage } = await setup(t);
  addClass(T, '10A1');
  const p1 = T.db.flush();
  addClass(T, '10A2');
  await Promise.all([p1, T.db.flush()]);
  assert.equal(T.db.dirty(), false);
  await T.db.init({ storage });
  assert.equal(classCount(T), 2);
});

test('detach: không còn chưa lưu, không ghi gì nữa', async t => {
  const { T, storage } = await setup(t);
  const before = storage.writes;
  T.db.detach();
  addClass(T, '10A1');
  assert.equal(T.db.dirty(), false);
  t.mock.timers.tick(10000);
  await settle();
  await T.db.flush();
  assert.equal(storage.writes, before);
});

test('detach khi đang chờ thử lại: huỷ lần thử lại', async t => {
  const { T, storage } = await setup(t, 5);
  T.db.detach();
  t.mock.timers.tick(10000);
  await settle();
  assert.equal(storage.writes, 1);
});

test('onStatus báo đúng chuỗi trạng thái', async t => {
  const { T } = await setup(t);
  const seen = [];
  const off = T.db.onStatus(s => seen.push(s));
  addClass(T, '10A1');
  t.mock.timers.tick(300);
  await settle();
  off();
  addClass(T, '10A2');
  assert.deepEqual(seen, ['saved', 'pending', 'saving', 'saved']);
});
