// Edge case: lượt lật, mỗi loại thẻ một lá, khoá trong tuần nhận, hạn dùng, hoàn tác
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass, freeze, DAY } = require('../helpers/app');

const WEEK = { year: 2026, month: 10, week: 2 };

test('pending: đúng mốc được 1 lượt, thiếu 1 ATP thì 0, trừ đi số lượt đã lật', async () => {
  const { T } = await boot();
  T.settings.set('evolve_threshold', 50);
  assert.equal(T.evolutions.pending(49, 0), 0);
  assert.equal(T.evolutions.pending(50, 0), 1);
  assert.equal(T.evolutions.pending(99, 0), 1);
  assert.equal(T.evolutions.pending(150, 1), 2);
  assert.equal(T.evolutions.pending(150, 3), 0);
  assert.equal(T.evolutions.pending(150, undefined), 3, 'chưa lật lần nào');
});

test('mốc tiến hoá và số thẻ úp bị nhập 0, âm hoặc chữ được ép về tối thiểu hợp lệ', async () => {
  const { T } = await boot();
  for (const bad of ['0', '-5']) {
    T.settings.set('evolve_threshold', bad);
    assert.equal(T.evolutions.threshold(), 1, `threshold=${bad}`);
    T.settings.set('evolve_choices', bad);
    assert.equal(T.evolutions.choices(), 1, `choices=${bad}`);
  }
  T.settings.set('evolve_threshold', 'abc');
  T.settings.set('evolve_choices', 'abc');
  assert.equal(T.evolutions.threshold(), 50);
  assert.equal(T.evolutions.choices(), 3);
  assert.ok(Number.isFinite(T.evolutions.pending(10, 0)));
});

test('mỗi loại thẻ chỉ giữ 1 lá: nhận lần hai bị từ chối', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  const card = T.cards.list()[0];
  assert.equal(T.evolutions.grant(ids[0], card, WEEK), true);
  assert.equal(T.evolutions.grant(ids[0], card, WEEK), false);
  assert.equal(T.evolutions.heldBy(ids[0]).length, 1);
  assert.equal(T.evolutions.grant(ids[1], card, WEEK), true, 'học sinh khác vẫn nhận được thẻ đó');
});

test('thẻ úp chỉ lấy từ loại chưa giữ; dùng xong thì loại đó xuất hiện lại', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  const deck = T.cards.list();
  T.evolutions.grant(ids[0], deck[0], WEEK);
  assert.ok(!T.evolutions.available(ids[0]).some(c => c.id === deck[0].id));
  assert.equal(T.evolutions.available(ids[0]).length, deck.length - 1);

  T.evolutions.use(T.evolutions.heldBy(ids[0])[0].grant_id, null);
  assert.equal(T.evolutions.available(ids[0]).length, deck.length);
  assert.equal(T.evolutions.grant(ids[0], deck[0], WEEK), true);
});

test('giữ đủ mọi loại thẻ: không còn thẻ nào để lật', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  T.cards.list().forEach(c => T.evolutions.grant(ids[0], c, WEEK));
  assert.deepEqual(T.evolutions.available(ids[0]), []);
});

test('bộ thẻ trống: không có gì để lật và không lỗi', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  T.cards.list().forEach(c => T.cards.remove(c.id));
  assert.deepEqual(T.evolutions.available(ids[0]), []);
  assert.deepEqual(T.evolutions.heldBy(ids[0]), []);
});

test('sameWeek: chỉ khoá khi trùng cả năm, tháng và tuần', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  T.evolutions.grant(ids[0], T.cards.list()[0], WEEK);
  const row = T.evolutions.heldBy(ids[0])[0];
  assert.equal(T.evolutions.sameWeek(row, { year: 2026, month: 10, week: 2 }), true);
  assert.equal(T.evolutions.sameWeek(row, { year: 2026, month: 10, week: 3 }), false);
  assert.equal(T.evolutions.sameWeek(row, { year: 2026, month: 11, week: 2 }), false, 'cùng số tuần nhưng khác tháng');
  assert.equal(T.evolutions.sameWeek(row, { year: 2027, month: 10, week: 2 }), false, 'cùng tháng/tuần nhưng khác năm');
});

test('hạn dùng tính tới cuối ngày thứ N theo UTC+7, kể cả khi nhận sát nửa đêm', async t => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  const card = Object.assign({}, T.cards.list()[0], { expire_days: 1 });
  freeze(t, '2026-10-12T16:59:00Z'); // 23:59 ngày 12/10 UTC+7
  T.evolutions.grant(ids[0], card, WEEK);
  const row = T.evolutions.heldBy(ids[0])[0];
  assert.equal(T.time.toSql(row.expires_at), '2026-10-13 16:59:59', 'hết ngày 13/10 UTC+7');
  assert.equal(T.evolutions.daysLeft(row), 1);
});

test('expire_days = 0: thẻ không có hạn và không bao giờ bị tự xoá', async t => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  T.evolutions.grant(ids[0], Object.assign({}, T.cards.list()[0], { expire_days: 0 }), WEEK);
  const row = T.evolutions.heldBy(ids[0])[0];
  assert.equal(row.expires_at, null);
  assert.equal(T.evolutions.daysLeft(row), null);
  assert.match(T.evolutions.expiryText(row), /Không hết hạn/);

  freeze(t, '2099-01-01T00:00:00Z');
  T.evolutions.purge();
  assert.equal(T.evolutions.heldBy(ids[0]).length, 1);
});

test('tự xoá đúng thời điểm: còn tới mili-giây cuối của ngày hết hạn, mất ngay sau đó', async t => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  freeze(t, '2026-10-12T03:00:00Z');
  T.evolutions.grant(ids[0], Object.assign({}, T.cards.list()[0], { expire_days: 2 }), WEEK);
  const expires = T.evolutions.heldBy(ids[0])[0].expires_at;

  t.mock.timers.setTime(expires);
  T.evolutions.purge();
  assert.equal(T.evolutions.heldBy(ids[0]).length, 1);
  assert.equal(T.evolutions.daysLeft(T.evolutions.heldBy(ids[0])[0]), 0);
  assert.match(T.evolutions.expiryText(T.evolutions.heldBy(ids[0])[0]), /Hết hạn hôm nay/);

  t.mock.timers.setTime(expires + 1);
  T.evolutions.purge();
  assert.equal(T.evolutions.heldBy(ids[0]).length, 0);
  assert.equal(T.db.scalar('SELECT status FROM student_cards'), 'expired');
});

test('thẻ hết hạn không trả lại lượt lật nhưng nhường chỗ cho loại thẻ đó', async t => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  const card = T.cards.list()[0];
  T.evolutions.grant(ids[0], card, WEEK);
  assert.equal(T.evolutions.flips(ids[0]), 1);

  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 40 * DAY });
  T.evolutions.purge();
  assert.equal(T.evolutions.heldBy(ids[0]).length, 0);
  assert.equal(T.evolutions.flips(ids[0]), 1, 'lượt lật đã tiêu không quay lại');
  assert.ok(T.evolutions.available(ids[0]).some(c => c.id === card.id));
});

test('thẻ đã dùng không bị đổi thành "hết hạn" khi quá ngày', async t => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  T.evolutions.grant(ids[0], T.cards.list()[0], WEEK);
  T.evolutions.use(T.evolutions.heldBy(ids[0])[0].grant_id, null);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 400 * DAY });
  T.evolutions.purge();
  assert.equal(T.db.scalar('SELECT status FROM student_cards'), 'used');
});

test('dùng thẻ hai lần liên tiếp chỉ ghi nhận một lần', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  T.evolutions.grant(ids[0], T.cards.list()[0], WEEK);
  const grantId = T.evolutions.heldBy(ids[0])[0].grant_id;
  T.evolutions.use(grantId, null);
  const usedAt = T.db.scalar('SELECT used_at FROM student_cards WHERE id = ?', [grantId]);
  T.evolutions.use(grantId, null);
  assert.equal(T.db.scalar('SELECT used_at FROM student_cards WHERE id = ?', [grantId]), usedAt);
  assert.equal(T.db.scalar("SELECT COUNT(*) FROM student_cards WHERE status = 'used'"), 1);
});

test('hoàn tác dùng thẻ: được khi chưa có lá cùng loại, bị chặn khi đã lật lại loại đó', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  const card = T.cards.list()[0];
  T.evolutions.grant(ids[0], card, WEEK);
  const first = T.evolutions.heldBy(ids[0])[0].grant_id;
  T.evolutions.use(first, null);
  assert.equal(T.evolutions.unuse(first), true);
  assert.equal(T.evolutions.heldBy(ids[0]).length, 1);

  T.evolutions.use(first, null);
  T.evolutions.grant(ids[0], card, WEEK); // lật lại đúng loại thẻ đó
  assert.equal(T.evolutions.unuse(first), false);
  assert.equal(T.evolutions.heldBy(ids[0]).length, 1, 'không thể có 2 lá cùng loại');
  assert.equal(T.evolutions.unuse(999999), false, 'mã không tồn tại');
});

test('sang năm học mới: lượt lật tính lại từ 0 nhưng thẻ đang giữ vẫn còn', async () => {
  const { T } = await boot();
  const { classId, ids } = seedClass(T);
  T.evolutions.grant(ids[0], Object.assign({}, T.cards.list()[0], { expire_days: 0 }), WEEK);
  assert.equal(T.evolutions.flips(ids[0]), 1);

  const next = T.time.dayStart(T.time.today()) + 5 * DAY; // năm học mới bắt đầu sau hôm nay
  const p = T.time.parts(next);
  T.schoolYear.set(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`, `${p.year + 1}-12-31`);
  assert.equal(T.evolutions.flips(ids[0]), 0);
  assert.deepEqual(T.evolutions.flipsByClass(classId), {});
  assert.equal(T.evolutions.heldBy(ids[0]).length, 1);
});

test('xoá một loại thẻ: mất cả lá đang giữ lẫn lịch sử, thẻ loại khác không ảnh hưởng', async () => {
  const { T } = await boot();
  const { classId, ids } = seedClass(T);
  const [a, b] = T.cards.list();
  T.evolutions.grant(ids[0], a, WEEK);
  T.evolutions.grant(ids[0], b, WEEK);
  T.evolutions.grant(ids[1], a, WEEK);
  T.evolutions.use(T.evolutions.heldBy(ids[1])[0].grant_id, null);
  assert.equal(T.cards.holders(a.id), 1, 'chỉ đếm lá đang giữ');

  T.cards.remove(a.id);
  assert.deepEqual(T.evolutions.heldBy(ids[0]).map(c => c.id), [b.id]);
  assert.deepEqual(T.evolutions.history(classId, 30), []);
});

test('thu hồi một lượt lật trả lại lượt cho học sinh', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  T.evolutions.grant(ids[0], T.cards.list()[0], WEEK);
  T.evolutions.revoke(T.evolutions.heldBy(ids[0])[0].grant_id);
  assert.equal(T.evolutions.flips(ids[0]), 0);
  assert.equal(T.evolutions.heldBy(ids[0]).length, 0);
});

test('lưu thẻ với hạn dùng âm, số lẻ hoặc bỏ trống được chuẩn hoá', async () => {
  const { T } = await boot();
  const base = { name: 'Thẻ thử', description: '', icon: '🃏', image_data: '' };
  const id1 = T.cards.save(Object.assign({ expire_days: -3 }, base));
  const id2 = T.cards.save(Object.assign({ expire_days: 7.9 }, base));
  const id3 = T.cards.save(Object.assign({ expire_days: undefined }, base));
  assert.equal(T.cards.get(id1).expire_days, 0);
  assert.equal(T.cards.get(id2).expire_days, 7);
  assert.equal(T.cards.get(id3).expire_days, 0);
  assert.match(T.cards.expiryLabel(T.cards.get(id1)), /Không hết hạn/);
});
