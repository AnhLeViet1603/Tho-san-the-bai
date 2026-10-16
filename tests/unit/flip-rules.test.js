// Edge case: ràng buộc lượt lật — DB chặn lá trùng, lật thẻ kiểm tra lại trong transaction,
// xoá loại thẻ không tạo lượt bù, đổi mốc ATP / hoàn tác ATP được báo trước ảnh hưởng
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass } = require('../helpers/app');

const WEEK = { year: 2026, month: 10, week: 1 };

async function setup(atp = []) {
  const { T } = await boot();
  const ctx = seedClass(T);
  atp.forEach((n, i) => { if (n) T.atp.award([ctx.ids[i]], ctx.lesson.id, 'manual', { amount: n }); });
  return { T, ...ctx };
}

test('DB không cho một học sinh giữ 2 lá cùng loại, kể cả khi ghi thẳng bằng SQL', async () => {
  const { T, ids } = await setup();
  const card = T.cards.list()[0];
  T.evolutions.grant(ids[0], card, WEEK);
  assert.throws(() => T.db.run(
    "INSERT INTO student_cards (student_id, card_id, year, granted_at, status) VALUES (?, ?, 2026, 0, 'held')", [ids[0], card.id]),
  /UNIQUE/);
  // Lá cùng loại nhưng đã dùng thì không vướng
  T.evolutions.use(T.evolutions.heldBy(ids[0])[0].grant_id, null);
  assert.equal(T.evolutions.grant(ids[0], card, WEEK), true);
});

test('nâng cấp: dữ liệu cũ có lá trùng thì giữ lá nhận trước, lá sau thành "removed"', async () => {
  const { T, ids } = await setup();
  const card = T.cards.list()[0];
  T.db.run('DROP INDEX ux_student_cards_held');
  T.evolutions.grant(ids[0], card, WEEK);
  T.db.run("INSERT INTO student_cards (student_id, card_id, year, granted_at, status) VALUES (?, ?, 2026, ?, 'held')",
    [ids[0], card.id, Date.now()]);
  T.db.run('PRAGMA user_version = 1');
  await T.db.importBytes(T.db.exportBytes());
  const rows = T.db.query('SELECT id, status FROM student_cards WHERE student_id = ? ORDER BY id', [ids[0]]);
  assert.deepEqual(rows.map(r => r.status), ['held', 'removed']);
  assert.equal(T.evolutions.flips(ids[0]), 2, 'lá trùng vẫn tính là đã lật');
});

test('flip(): hết lượt thì không lật được', async () => {
  const { T, ids } = await setup([49]);
  assert.equal(T.evolutions.flip(ids[0], T.cards.list()[0], WEEK), 'no-flip');
  assert.equal(T.evolutions.flips(ids[0]), 0);
});

test('flip(): hai màn lật mở cùng lúc khi chỉ còn 1 lượt thì chỉ lật được một lần', async () => {
  const { T, ids } = await setup([50]);
  const [a, b] = T.cards.list();
  assert.equal(T.evolutions.flip(ids[0], a, WEEK), 'ok');
  assert.equal(T.evolutions.flip(ids[0], b, WEEK), 'no-flip');
  assert.equal(T.evolutions.flips(ids[0]), 1);
});

test('flip(): ATP bị hoàn tác sau khi đã mở màn lật thì không lật được', async () => {
  const { T, ids, lesson } = await setup([50]);
  const card = T.cards.list()[0];
  T.atp.undoLast(lesson.id);
  assert.equal(T.evolutions.flip(ids[0], card, WEEK), 'no-flip');
});

test('flip(): đang giữ loại thẻ đó / loại thẻ vừa bị xoá', async () => {
  const { T, ids } = await setup([150]);
  const [a, b] = T.cards.list();
  assert.equal(T.evolutions.flip(ids[0], a, WEEK), 'ok');
  assert.equal(T.evolutions.flip(ids[0], a, WEEK), 'held');
  T.evolutions.grant(ids[1], b, WEEK); // để b được giữ lại (archive) thay vì xoá hẳn
  T.cards.remove(b.id);
  assert.equal(T.evolutions.flip(ids[0], b, WEEK), 'archived');
  assert.equal(T.evolutions.flips(ids[0]), 1);
});

test('xoá loại thẻ không làm tăng lượt lật của ai', async () => {
  const { T, classId, ids } = await setup([100, 50]);
  const [a, b] = T.cards.list();
  T.evolutions.flip(ids[0], a, WEEK);
  T.evolutions.flip(ids[0], b, WEEK);
  T.evolutions.flip(ids[1], a, WEEK);
  const pendingOf = () => ids.map(id => T.evolutions.pending(T.atp.totalFor(id), T.evolutions.flips(id)));
  const before = pendingOf();
  T.cards.remove(a.id);
  assert.deepEqual(pendingOf(), before);
  assert.deepEqual(Object.values(T.evolutions.flipsByClass(classId)), [2, 1]);
});

test('lá của loại thẻ đã xoá: không hoàn tác được, không đổi sang được', async () => {
  const { T, classId, ids } = await setup();
  const [a, b] = T.cards.list();
  T.evolutions.grant(ids[0], a, WEEK);
  T.evolutions.grant(ids[0], b, WEEK);
  T.evolutions.use(T.evolutions.heldBy(ids[0])[0].grant_id, null); // dùng lá a
  T.evolutions.grant(ids[1], a, WEEK);
  T.cards.remove(a.id);
  const usedA = T.evolutions.history(classId, 30).find(h => h.student_id === ids[0]);
  assert.equal(T.evolutions.unuse(usedA.grant_id), false, 'không hoàn tác ra lại thẻ đã bị xoá');
  const heldB = T.evolutions.heldBy(ids[0])[0];
  assert.equal(T.evolutions.swap(heldB.grant_id, a.id), false, 'không đổi sang loại đã xoá');
});

test('đổi mốc ATP: đếm đúng số em có thêm lượt và số em thành ra lật quá', async () => {
  const { T, ids } = await setup([100, 60, 10]); // mốc 50
  T.evolutions.flip(ids[0], T.cards.list()[0], WEEK);
  T.evolutions.flip(ids[0], T.cards.list()[1], WEEK); // em 0: 100 ATP, đã lật 2
  T.evolutions.flip(ids[1], T.cards.list()[0], WEEK); // em 1: 60 ATP, đã lật 1

  // Hạ mốc xuống 20: em 0 được 5 lượt (thêm 3), em 1 được 3 (thêm 2), em 2: 10 ATP vẫn 0
  assert.deepEqual(T.evolutions.thresholdImpact(20), { more: 2, extra: 5, over: 0 });
  // Nâng mốc lên 70: em 0 chỉ được 1 lượt nhưng đã lật 2; em 1 được 0 nhưng đã lật 1
  assert.deepEqual(T.evolutions.thresholdImpact(70), { more: 0, extra: 0, over: 2 });
  // Giữ nguyên mốc: không ảnh hưởng
  assert.deepEqual(T.evolutions.thresholdImpact(50), { more: 0, extra: 0, over: 0 });
});

test('hoàn tác ATP: báo đúng các em không còn đủ ATP cho thẻ đã lật', async () => {
  const { T, ids, lesson } = await setup([50, 100]);
  T.evolutions.flip(ids[0], T.cards.list()[0], WEEK);
  T.evolutions.flip(ids[1], T.cards.list()[0], WEEK);
  T.atp.award([ids[0], ids[1]], lesson.id, 'manual', { amount: 10 }); // lượt gần nhất: không ảnh hưởng ai
  assert.deepEqual(T.atp.removalImpact(T.atp.lastBatchIds(lesson.id)), []);

  // Bỏ lượt +50 đầu tiên của em 0 → em 0 còn 10 ATP mà đã lật 1 thẻ
  const first = T.db.scalar('SELECT MIN(id) FROM atp_events WHERE student_id = ?', [ids[0]]);
  assert.deepEqual(T.atp.removalImpact([first]).map(s => s.id), [ids[0]]);
  // Em 1 dư nhiều: 100 + 10 + 50 ATP, lật 1 → bỏ lượt +50 vẫn đủ
  T.atp.award([ids[1]], lesson.id, 'manual', { amount: 50 });
  assert.deepEqual(T.atp.removalImpact(T.atp.lastBatchIds(lesson.id)), []);
});

test('hoàn tác ATP: em vốn đã lật quá từ trước thì không báo lại', async () => {
  const { T, ids, lesson } = await setup([50]);
  T.evolutions.grant(ids[0], T.cards.list()[0], WEEK);
  T.evolutions.grant(ids[0], T.cards.list()[1], WEEK); // đã lật 2 dù chỉ đủ 1
  T.atp.award([ids[0]], lesson.id, 'manual', { amount: 5 });
  assert.deepEqual(T.atp.removalImpact(T.atp.lastBatchIds(lesson.id)), []);
});
