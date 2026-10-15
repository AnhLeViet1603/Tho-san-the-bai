// Edge case: thời điểm ghi ATP bằng mili giây (created_ms) — nâng cấp dữ liệu cũ, tổng không đổi, ranh giới năm học
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass, freeze, stampEvents } = require('../helpers/app');

const YEAR = ['2026-09-05', '2027-05-31'];

test('lượt cộng mới ghi created_ms đúng bằng thời điểm bấm', async t => {
  freeze(t, '2026-10-12T10:00:00.123+07:00');
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.atp.award([ids[0]], lesson.id, 'speak');
  assert.equal(T.db.scalar('SELECT created_ms FROM atp_events'), Date.parse('2026-10-12T10:00:00.123+07:00'));
});

test('nâng cấp: created_ms được lấy lại từ created_at, tổng ATP năm học không đổi', async () => {
  const { T } = await boot();
  T.schoolYear.set(...YEAR);
  const { classId, ids, lesson } = seedClass(T);
  T.atp.award(ids, lesson.id, 'manual', { amount: 3 });
  T.atp.award([ids[0]], lesson.id, 'manual', { amount: 4 });
  T.atp.award([ids[1]], lesson.id, 'manual', { amount: 5 });
  // Rải thời điểm ghi: trước năm học, đầu năm, giữa năm, cuối năm, sau năm học
  const stamps = ['2026-09-04 16:59:59', '2026-09-04 17:00:00', '2026-12-01 03:00:00', '2027-05-31 16:59:59', '2027-05-31 17:00:00'];
  T.db.query('SELECT id FROM atp_events ORDER BY id').forEach((r, i) => stampEvents(T, stamps[i % stamps.length], `id = ${r.id}`));
  const before = T.atp.totalsByClass(classId);
  const beforeStudent = ids.map(id => T.atp.totalFor(id));

  // Giả DB bản trước Phase 7: chưa có created_ms
  T.db.run('UPDATE atp_events SET created_ms = NULL');
  T.db.run('PRAGMA user_version = 2');
  await T.db.importBytes(T.db.exportBytes());

  assert.equal(T.db.scalar('SELECT COUNT(*) FROM atp_events WHERE created_ms IS NULL'), 0);
  T.db.query('SELECT created_at, created_ms FROM atp_events').forEach(r =>
    assert.equal(r.created_ms, Date.parse(r.created_at.replace(' ', 'T') + 'Z')));
  assert.deepEqual(T.atp.totalsByClass(classId), before);
  assert.deepEqual(ids.map(id => T.atp.totalFor(id)), beforeStudent);
  assert.ok(Object.values(before).some(v => v > 0), 'có dữ liệu để so');
});

test('ranh giới năm học tính tới từng mili giây theo giờ Việt Nam', async t => {
  const { T } = await boot();
  T.schoolYear.set(...YEAR);
  const { ids, lesson } = seedClass(T);
  const at = iso => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) });
    T.atp.award([ids[0]], lesson.id, 'manual', { amount: 1 });
    t.mock.timers.reset();
  };
  at('2026-09-04T23:59:59.999+07:00'); // trước năm học
  at('2026-09-05T00:00:00.000+07:00'); // giây đầu tiên
  at('2027-05-31T23:59:59.999+07:00'); // mili giây cuối cùng
  at('2027-06-01T00:00:00.000+07:00'); // đã sang năm sau
  freeze(t, '2026-12-01T10:00:00+07:00');
  assert.equal(T.atp.totalFor(ids[0]), 2);
  assert.equal(T.atp.totalsByClass(T.store.state.classId)[ids[0]], 2);
  assert.equal(T.evolutions.balances().find(b => b.id === ids[0]).total, 2);
  assert.equal(T.classes.list()[0].atp_total, 2);
});

test('Thống kê "năm học này" dùng cùng ranh giới với tổng ATP', async t => {
  const { T } = await boot();
  T.schoolYear.set(...YEAR);
  const { ids, lesson } = seedClass(T);
  [['2026-09-04T23:59:59.999+07:00', 10], ['2026-09-05T00:00:00.000+07:00', 1], ['2027-06-01T00:00:00.000+07:00', 100]]
    .forEach(([iso, n]) => {
      t.mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) });
      T.atp.award([ids[0]], lesson.id, 'manual', { amount: n });
      t.mock.timers.reset();
    });
  freeze(t, '2026-12-01T10:00:00+07:00');
  assert.equal(T.stats.summary({ scope: 'school' }).total, 1);
  assert.equal(T.stats.summary({}).total, 111, 'toàn thời gian vẫn đủ');
});
