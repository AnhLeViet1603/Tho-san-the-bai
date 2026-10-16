// Edge case: chỉ một tab được ghi, nhường quyền ghi, cướp lock khi tab kia treo
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('../helpers/app');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const abortError = msg => Object.assign(new Error(msg), { name: 'AbortError' });

// LockManager giả: một lock duy nhất, hỗ trợ ifAvailable, hàng đợi, signal và steal như trình duyệt
function fakeLocks() {
  let holder = null;
  const queue = [];
  function grant(entry) {
    holder = entry;
    Promise.resolve().then(() => entry.cb({ name: entry.name })).then(
      v => { done(entry); entry.resolve(v); },
      e => { done(entry); entry.reject(e); });
  }
  function done(entry) {
    if (holder !== entry) return;
    holder = null;
    const next = queue.shift();
    if (next) grant(next);
  }
  return {
    request(name, opts, cb) {
      return new Promise((resolve, reject) => {
        const entry = { name, cb, resolve, reject };
        if (opts.steal) {
          if (holder) { const old = holder; holder = null; old.reject(abortError('stolen')); }
          return grant(entry);
        }
        if (!holder) return grant(entry);
        if (opts.ifAvailable) return Promise.resolve(cb(null)).then(resolve, reject);
        queue.push(entry);
        if (opts.signal) {
          opts.signal.addEventListener('abort', () => {
            const i = queue.indexOf(entry);
            if (i >= 0) { queue.splice(i, 1); reject(abortError('aborted')); }
          });
        }
      });
    }
  };
}

// Đóng mọi tab sau mỗi test (kể cả khi assert lỗi), nếu không BroadcastChannel giữ tiến trình chạy mãi.
// stealAfter mặc định đủ dài để máy chậm không cướp lock sai lúc; test cướp lock tự đặt ngắn.
async function setup(t) {
  const { T } = await boot();
  const locks = fakeLocks();
  const tabs = [];
  const tab = env => {
    const lock = T.tabLock.create({ locks, Channel: BroadcastChannel, stealAfter: 2000, ...env });
    tabs.push(lock);
    return lock;
  };
  t.after(() => tabs.forEach(x => x.close()));
  return { tab };
}

test('tab đầu tiên giành được quyền ghi, tab thứ hai thì không', async t => {
  const { tab } = await setup(t);
  const a = tab();
  const b = tab();
  assert.equal(await a.acquire(), true);
  assert.equal(await b.acquire(), false);
  assert.equal(a.owns(), true);
  assert.equal(b.owns(), false);
});

test('xin nhường quyền ghi: tab cũ lưu nốt rồi mới nhả lock', async t => {
  const { tab } = await setup(t);
  const a = tab();
  const b = tab();
  const steps = [];
  await a.acquire(async info => { await tick(10); steps.push(['a mất quyền', info.stolen]); });
  await b.acquire();
  await b.takeover(() => {});
  steps.push(['b nhận quyền']);
  assert.deepEqual(steps, [['a mất quyền', false], ['b nhận quyền']]);
  assert.equal(a.owns(), false);
  assert.equal(b.owns(), true);
});

test('tab cũ không phản hồi thì bị cướp lock sau thời gian chờ', async t => {
  const { tab } = await setup(t);
  const a = tab({ Channel: null }); // không nghe được lời xin nhường
  const b = tab({ stealAfter: 50 });
  const lost = [];
  await a.acquire(info => lost.push(info.stolen));
  await b.takeover(() => {});
  await tick();
  assert.equal(b.owns(), true);
  assert.equal(a.owns(), false);
  assert.deepEqual(lost, [true]);
});

test('nhường qua lại nhiều lần không làm kẹt lock', async t => {
  const { tab } = await setup(t);
  const a = tab();
  const b = tab();
  await a.acquire(() => {});
  await b.takeover(() => {});
  await a.takeover(() => {});
  assert.equal(a.owns(), true);
  assert.equal(b.owns(), false);
});

test('trình duyệt không có Web Locks thì vẫn cho ghi', async t => {
  const { tab } = await setup(t);
  const a = tab({ locks: null });
  assert.equal(await a.acquire(), true);
  await a.takeover();
});

test('detach: thay đổi sau khi mất quyền ghi không được lưu', async () => {
  const { T } = await boot();
  T.db.detach();
  await T.db.flush(); // không ném lỗi, không ghi gì
  assert.ok(T.db.scalar('SELECT 1'));
});
