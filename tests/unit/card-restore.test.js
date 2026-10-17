// Edge case: khôi phục thẻ xoá nhầm — loại thẻ trong thùng rác, lá "xoá có trả lượt", lý do không hoàn tác được
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

test('khôi phục loại thẻ: về cuối bộ thẻ, trả lại đúng các lá bị thu lúc xoá, số lượt lật không đổi', async () => {
  const { T, ids } = await setup([100, 50]);
  const [a, b] = T.cards.list();
  T.evolutions.grant(ids[0], a, WEEK);
  T.evolutions.grant(ids[1], a, WEEK);
  T.evolutions.grant(ids[0], b, WEEK);
  T.evolutions.discard(T.evolutions.heldBy(ids[1])[0].grant_id); // giáo viên đã xoá lá của em 1 từ trước
  const flipsBefore = ids.map(id => T.evolutions.flips(id));

  T.cards.remove(a.id);
  assert.deepEqual(T.cards.trash().map(c => [c.id, c.issued, c.returnable]), [[a.id, 2, 1]]);
  assert.equal(T.cards.restore(a.id), 1);

  assert.equal(T.cards.list().filter(c => c.rarity === a.rarity).at(-1).id, a.id, 'về cuối nhóm độ hiếm của nó');
  assert.equal(T.cards.trash().length, 0);
  assert.deepEqual(T.evolutions.heldBy(ids[0]).map(c => c.id).sort(), [a.id, b.id].sort(), 'lá của em 0 được trả lại');
  assert.deepEqual(T.evolutions.heldBy(ids[1]), [], 'lá em 1 bị xoá từ trước thì không tự trả');
  assert.deepEqual(ids.map(id => T.evolutions.flips(id)), flipsBefore);
  assert.deepEqual(T.audit.list(2).map(r => r.action), ['card.restore', 'card.delete']);
});

test('xoá vĩnh viễn chỉ được với loại thẻ chưa từng phát', async () => {
  const { T, ids } = await setup();
  const [a, b] = T.cards.list();
  T.evolutions.grant(ids[0], a, WEEK);
  T.cards.remove(a.id);
  T.cards.remove(b.id);
  assert.equal(T.cards.purge(a.id), false, 'đã phát: không cho xoá hẳn');
  assert.ok(T.cards.get(a.id));
  assert.equal(T.cards.purge(b.id), true);
  assert.equal(T.cards.get(b.id), null);
  assert.equal(T.cards.purge(T.cards.list()[0].id), false, 'thẻ đang dùng thì phải vào thùng rác trước');
});

test('xoá thẻ "trả lại lượt lật": hiện trong lịch sử, không tính lượt lật, hoàn tác được', async () => {
  const { T, classId, ids } = await setup([50]);
  const a = T.cards.list()[0];
  T.evolutions.flip(ids[0], a, WEEK);
  const g = T.evolutions.heldBy(ids[0])[0].grant_id;
  T.evolutions.revoke(g);

  assert.equal(T.evolutions.flips(ids[0]), 0, 'được lật lại');
  assert.equal(T.evolutions.pending(T.atp.totalFor(ids[0]), T.evolutions.flips(ids[0])), 1);
  assert.deepEqual(T.evolutions.history(classId, 30).map(h => [h.grant_id, h.status]), [[g, 'revoked']]);
  assert.equal(T.stats.evolution({}).flips, 0, 'thống kê không tính lá trả lượt');
  assert.equal(T.integrity.check().ok, true, 'trạng thái revoked hợp lệ');

  assert.equal(T.evolutions.restoreBlock(g), null);
  assert.equal(T.evolutions.unuse(g), true);
  assert.deepEqual(T.evolutions.heldBy(ids[0]).map(c => c.grant_id), [g]);
  assert.equal(T.evolutions.flips(ids[0]), 1);
});

test('lá "trả lại lượt lật" mà em đã dùng lượt đó lật thẻ khác: không hoàn tác được (sẽ lật quá)', async () => {
  const { T, ids } = await setup([50]);
  const [a, b] = T.cards.list();
  T.evolutions.flip(ids[0], a, WEEK);
  const g = T.evolutions.heldBy(ids[0])[0].grant_id;
  T.evolutions.revoke(g);
  assert.equal(T.evolutions.flip(ids[0], b, WEEK), 'ok');
  assert.equal(T.evolutions.restoreBlock(g), 'no-flip');
  assert.equal(T.evolutions.unuse(g), false);
  assert.equal(T.evolutions.flips(ids[0]), 1);
});

test('lý do không hoàn tác: loại thẻ trong thùng rác (khôi phục loại thẻ là hoàn tác được), đang giữ lá cùng loại, hết hạn', async () => {
  const { T, ids } = await setup();
  const a = T.cards.list()[0];
  T.evolutions.grant(ids[0], a, WEEK);
  const g = T.evolutions.heldBy(ids[0])[0].grant_id;
  T.evolutions.use(g, null);
  T.cards.remove(a.id);
  assert.equal(T.evolutions.restoreBlock(g), 'archived');
  T.cards.restore(a.id);
  assert.equal(T.evolutions.restoreBlock(g), null);

  T.evolutions.grant(ids[0], a, WEEK);
  assert.equal(T.evolutions.restoreBlock(g), 'held');

  T.db.run("UPDATE student_cards SET status = 'expired' WHERE id = ?", [g]);
  assert.equal(T.evolutions.restoreBlock(g), 'expired');
  assert.equal(T.evolutions.restoreBlock(999999), 'missing');
});

test('trả lượt hai lần không ghi nhật ký hai lần', async () => {
  const { T, ids } = await setup();
  T.evolutions.grant(ids[0], T.cards.list()[0], WEEK);
  const g = T.evolutions.heldBy(ids[0])[0].grant_id;
  T.evolutions.revoke(g);
  T.evolutions.revoke(g);
  assert.equal(T.audit.list(10).filter(r => r.action === 'card.revoke').length, 1);
});

test('nâng cấp: loại thẻ đã ẩn ở bản trước có archived_at = lần thu lá gần nhất, khôi phục trả đúng lá', async () => {
  const { T, ids } = await setup();
  const a = T.cards.list()[0];
  T.evolutions.grant(ids[0], a, WEEK);
  T.evolutions.grant(ids[1], a, WEEK);
  // Giả DB phiên bản 4: ẩn kiểu cũ (chỉ có cờ archived), lá bị thu lúc 1000
  T.db.run("UPDATE student_cards SET status = 'removed', used_at = 1000 WHERE card_id = ?", [a.id]);
  T.db.run('UPDATE cards SET archived = 1, archived_at = NULL WHERE id = ?', [a.id]);
  T.db.run('PRAGMA user_version = 4');
  await T.db.importBytes(T.db.exportBytes());
  assert.equal(T.cards.get(a.id).archived_at, 1000);
  assert.equal(T.cards.restore(a.id), 2);
  assert.equal(T.evolutions.heldBy(ids[1])[0].id, a.id);
});
