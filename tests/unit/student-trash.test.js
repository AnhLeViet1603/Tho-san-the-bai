// Edge case: thùng rác cho học sinh — ẩn khỏi mọi nơi, dữ liệu còn nguyên, khôi phục, xoá vĩnh viễn, import "Thay thế"
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass } = require('../helpers/app');

const WEEK = { year: 2026, month: 10, week: 1 };

async function setup() {
  const { T } = await boot();
  const ctx = seedClass(T, ['An', 'Bình', 'Chi']);
  T.atp.award(ctx.ids, ctx.lesson.id, 'manual', { amount: 60 });
  T.evolutions.grant(ctx.ids[0], T.cards.list()[0], WEEK);
  T.groups.ensureCount(ctx.lesson, 1);
  const g = T.groups.list(ctx.lesson.id)[0];
  T.groups.setMember(ctx.lesson.id, ctx.ids[0], g.id);
  T.groups.setMember(ctx.lesson.id, ctx.ids[1], g.id);
  return { T, g, ...ctx };
}

test('chuyển học sinh vào thùng rác: biến khỏi danh sách, nhóm, lịch sử thẻ, thống kê, sĩ số; dữ liệu còn nguyên', async () => {
  const { T, classId, ids, lesson, g } = await setup();
  T.students.remove(ids[0]);

  assert.deepEqual(T.students.list(classId, true).map(s => s.id), [ids[1], ids[2]]);
  assert.deepEqual(T.students.trash(classId).map(s => [s.id, s.flips]), [[ids[0], 1]]);
  assert.deepEqual(T.groups.list(lesson.id).find(x => x.id === g.id).members, [ids[1]], 'không còn trong nhóm');
  assert.deepEqual(Object.keys(T.evolutions.heldByClass(classId)).map(Number), [], 'không hiện ở bảng thẻ');
  assert.equal(T.stats.summary({}).total, 120, 'thống kê bỏ ATP của em');
  assert.equal(T.stats.evolution({}).flips, 0);
  assert.equal(T.classes.list()[0].student_count, 2);
  assert.equal(T.classes.list()[0].atp_total, 120);
  assert.ok(!T.evolutions.balances().some(b => b.id === ids[0]));

  assert.equal(T.atp.totalFor(ids[0]), 60, 'ATP còn nguyên');
  assert.equal(T.evolutions.flips(ids[0]), 1, 'thẻ còn nguyên');
  assert.equal(T.integrity.check().ok, true, 'không bị coi là mồ côi');
});

test('khôi phục học sinh: về cuối danh sách, trở lại nhóm, ATP và thẻ đủ', async () => {
  const { T, classId, ids, lesson, g } = await setup();
  T.students.remove(ids[0]);
  T.students.restore(ids[0]);
  assert.deepEqual(T.students.list(classId).map(s => s.id), [ids[1], ids[2], ids[0]]);
  assert.equal(T.students.trash(classId).length, 0);
  assert.deepEqual(T.groups.list(lesson.id).find(x => x.id === g.id).members.sort(), [ids[0], ids[1]].sort());
  assert.equal(T.stats.summary({}).total, 180);
  assert.equal(T.evolutions.heldBy(ids[0]).length, 1);
  assert.deepEqual(T.audit.list(2).map(r => r.action), ['student.restore', 'student.archive']);
});

test('cộng ATP cho nhóm không cộng cho học sinh trong thùng rác', async () => {
  const { T, ids, lesson, g } = await setup();
  T.students.remove(ids[0]);
  const members = T.groups.list(lesson.id).find(x => x.id === g.id).members;
  T.atp.award(members, lesson.id, 'manual', { amount: 5, groupId: g.id });
  assert.equal(T.atp.totalFor(ids[0]), 60);
  assert.equal(T.atp.totalFor(ids[1]), 65);
});

test('chép nhóm từ tiết trước không kéo theo học sinh trong thùng rác', async () => {
  const { T, ids } = await setup(); // tiết 1: An, Bình chung một nhóm
  T.students.remove(ids[0]);
  T.store.set({ period: 2 });
  const next = T.lessons.current();
  assert.equal(T.groups.copyFromPrevious(next), true);
  const members = T.db.query(`SELECT gm.student_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
    WHERE g.lesson_id = ?`, [next.id]).map(r => r.student_id);
  assert.deepEqual(members, [ids[1]]);
});

test('import "Thay thế danh sách": học sinh cũ vào thùng rác, khôi phục được', async () => {
  const { T, classId, ids } = await setup();
  T.db.tx(() => {
    T.students.removeAll(classId);
    T.students.bulkAdd(classId, ['Dũng', 'Em']);
  });
  assert.deepEqual(T.students.list(classId).map(s => s.name), ['Dũng', 'Em']);
  assert.equal(T.students.trash(classId).length, 3);
  T.students.restore(ids[1]);
  assert.deepEqual(T.students.list(classId).map(s => s.name), ['Dũng', 'Em', 'Bình']);
  assert.equal(T.atp.totalFor(ids[1]), 60);
});

test('Ẩn khác thùng rác: em đang ẩn vẫn ở danh sách (includeInactive), không ở thùng rác', async () => {
  const { T, classId, ids } = await setup();
  T.students.setActive(ids[1], false);
  assert.ok(T.students.list(classId, true).some(s => s.id === ids[1]));
  assert.ok(!T.students.list(classId).some(s => s.id === ids[1]));
  assert.equal(T.students.trash(classId).length, 0);
});

test('xoá vĩnh viễn từ thùng rác: mất hẳn, không để lại mồ côi', async () => {
  const { T, classId, ids } = await setup();
  T.students.remove(ids[0]);
  T.students.purge(ids[0]);
  assert.equal(T.students.get(ids[0]), null);
  assert.equal(T.students.trash(classId).length, 0);
  assert.equal(T.integrity.check().ok, true);
});

test('xoá vĩnh viễn lớp kéo theo cả học sinh trong thùng rác của lớp', async () => {
  const { T, classId, ids } = await setup();
  T.students.remove(ids[0]);
  T.classes.archive(classId);
  T.classes.remove(classId);
  assert.equal(T.students.get(ids[0]), null);
  assert.equal(T.integrity.check().ok, true);
});

test('nâng cấp DB phiên bản 5: có cột archived_at cho học sinh, mọi em vẫn hiện', async () => {
  const { T, classId } = await setup();
  T.db.run('PRAGMA user_version = 5');
  await T.db.importBytes(T.db.exportBytes());
  assert.equal(T.db.scalar('PRAGMA user_version'), T.db.schemaVersion());
  assert.equal(T.students.list(classId).length, 3);
});
