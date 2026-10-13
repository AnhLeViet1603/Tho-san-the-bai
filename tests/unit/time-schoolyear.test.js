// Edge case: ngày giờ UTC+7 và ranh giới năm học
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass, freeze, stampEvents } = require('../helpers/app');

test('today() đổi ngày đúng lúc 00:00 UTC+7, không theo múi giờ máy', async t => {
  const { T } = await boot();
  freeze(t, '2026-10-12T16:59:59Z'); // 23:59:59 ngày 12 theo UTC+7
  assert.equal(T.time.today(), '2026-10-12');
  t.mock.timers.setTime(Date.parse('2026-10-12T17:00:00Z')); // 00:00 ngày 13 theo UTC+7
  assert.equal(T.time.today(), '2026-10-13');
});

test('parts() qua giao thừa: 31/12 17:00 UTC đã là 01/01 năm sau', async t => {
  const { T } = await boot();
  freeze(t, '2026-12-31T17:00:00Z');
  assert.deepEqual(T.time.parts(), { year: 2027, month: 1, day: 1 });
});

test('addYears xử lý 29/02 và giữ nguyên các ngày thường', async () => {
  const { T } = await boot();
  assert.equal(T.time.addYears('2024-02-29', 1), '2025-02-28');
  assert.equal(T.time.addYears('2024-02-29', 4), '2028-02-29');
  assert.equal(T.time.addYears('2026-09-05', 1), '2027-09-05');
  assert.equal(T.time.addYears('2026-12-31', 1), '2027-12-31');
});

test('dayStart / toSql / fmtDate quy đổi đúng', async () => {
  const { T } = await boot();
  assert.equal(T.time.toSql(T.time.dayStart('2026-09-05')), '2026-09-04 17:00:00');
  assert.equal(T.time.fmtDate('2026-09-05'), '05/09/2026');
  assert.equal(T.time.fmt(Date.parse('2026-09-04T17:00:00Z')), '05/09/2026');
  const a = T.time.dayIndex(Date.parse('2026-10-12T16:59:59Z'));
  const b = T.time.dayIndex(Date.parse('2026-10-12T17:00:00Z'));
  assert.equal(b - a, 1);
});

test('ensure() đặt mặc định theo nửa năm: trước tháng 6 thuộc năm học đã bắt đầu năm trước', async t => {
  const { T } = await boot();
  T.db.run("DELETE FROM settings WHERE key IN ('school_start', 'school_end')");
  freeze(t, '2026-03-10T03:00:00Z');
  assert.equal(T.schoolYear.ensure(), false);
  assert.deepEqual(T.schoolYear.get(), { start: '2025-09-05', end: '2026-05-31' });
});

test('ensure() đặt mặc định từ tháng 6 trở đi thuộc năm học sắp tới', async t => {
  const { T } = await boot();
  T.db.run("DELETE FROM settings WHERE key IN ('school_start', 'school_end')");
  freeze(t, '2026-06-01T03:00:00Z');
  T.schoolYear.ensure();
  assert.deepEqual(T.schoolYear.get(), { start: '2026-09-05', end: '2027-05-31' });
});

test('không chuyển năm học trong chính ngày kết thúc, chuyển vào ngày hôm sau', async t => {
  const { T } = await boot();
  T.schoolYear.set('2025-09-05', '2026-05-31');
  freeze(t, '2026-05-31T16:59:59Z'); // 23:59:59 ngày 31/05 UTC+7
  assert.equal(T.schoolYear.ensure(), false);
  assert.equal(T.schoolYear.get().end, '2026-05-31');

  t.mock.timers.setTime(Date.parse('2026-05-31T17:00:00Z')); // 00:00 ngày 01/06 UTC+7
  assert.equal(T.schoolYear.ensure(), true);
  assert.deepEqual(T.schoolYear.get(), { start: '2026-09-05', end: '2027-05-31' });
  assert.equal(T.schoolYear.ensure(), false, 'lần gọi sau không chuyển tiếp');
});

test('bỏ lỡ nhiều năm vẫn nhảy thẳng tới năm học chứa hôm nay', async t => {
  const { T } = await boot();
  T.schoolYear.set('2020-09-05', '2021-05-31');
  freeze(t, '2026-10-12T03:00:00Z');
  assert.equal(T.schoolYear.ensure(), true);
  assert.deepEqual(T.schoolYear.get(), { start: '2026-09-05', end: '2027-05-31' });
});

test('range().label: cùng năm chỉ hiện một năm, khác năm hiện dạng 2026–2027', async () => {
  const { T } = await boot();
  T.schoolYear.set('2026-01-10', '2026-12-20');
  assert.equal(T.schoolYear.range().label, '2026');
  T.schoolYear.set('2026-09-05', '2027-05-31');
  assert.equal(T.schoolYear.range().label, '2026–2027');
});

test('ATP tính đúng tới từng giây ở ranh giới đầu và cuối năm học', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.schoolYear.set('2026-09-05', '2027-05-31');
  T.atp.award([ids[0]], lesson.id, 'manual', { amount: 5 });

  stampEvents(T, '2026-09-04 16:59:59'); // 04/09 23:59:59 UTC+7: trước năm học
  assert.equal(T.atp.totalFor(ids[0]), 0);
  stampEvents(T, '2026-09-04 17:00:00'); // 05/09 00:00:00 UTC+7: giây đầu tiên
  assert.equal(T.atp.totalFor(ids[0]), 5);
  stampEvents(T, '2027-05-31 16:59:59'); // 31/05 23:59:59 UTC+7: giây cuối cùng
  assert.equal(T.atp.totalFor(ids[0]), 5);
  stampEvents(T, '2027-05-31 17:00:00'); // 01/06 00:00:00 UTC+7: đã hết năm học
  assert.equal(T.atp.totalFor(ids[0]), 0);
});

test('sang năm học mới: ATP về 0 nhưng dữ liệu cũ vẫn còn trong thống kê toàn thời gian', async () => {
  const { T } = await boot();
  const { classId, ids, lesson } = seedClass(T);
  T.schoolYear.set('2025-09-05', '2026-05-31');
  T.atp.award(ids, lesson.id, 'manual', { amount: 7 });
  stampEvents(T, '2026-01-15 03:00:00');
  assert.equal(T.atp.totalsByClass(classId)[ids[0]], 7);

  T.schoolYear.set('2026-09-05', '2027-05-31');
  assert.deepEqual(T.atp.totalsByClass(classId), {});
  assert.equal(T.classes.list()[0].atp_total, 0);
  assert.equal(T.stats.summary({ scope: 'school' }).total, 0);
  assert.equal(T.stats.summary({}).total, 21);
});
