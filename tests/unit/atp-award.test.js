// Edge case: ghi ATP, hoàn tác, xoá dây chuyền và quy tắc mở màn lật thẻ khi cộng điểm
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass } = require('../helpers/app');

test('đổi mức ATP trong cài đặt không làm thay đổi lịch sử đã ghi', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.atp.award([ids[0]], lesson.id, 'speak');
  T.settings.set('atp_speak', 10);
  T.atp.award([ids[0]], lesson.id, 'speak');
  assert.equal(T.atp.totalFor(ids[0]), 1 + 10);
});

test('mức ATP bị nhập sai (chữ, rỗng) được coi là 0 thay vì NaN', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.settings.set('atp_speak', 'abc');
  assert.equal(T.atp.amountFor('speak'), 0);
  T.atp.award([ids[0]], lesson.id, 'speak');
  assert.equal(T.atp.totalFor(ids[0]), 0);
});

test('trừ điểm cho ra tổng âm và không bao giờ có lượt lật âm', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.atp.award([ids[0]], lesson.id, 'manual', { amount: -8 });
  assert.equal(T.atp.totalFor(ids[0]), -8);
  assert.equal(T.evolutions.pending(-8, 0), 0);
  assert.equal(T.evolutions.pending(0, 3), 0);
});

test('hoàn tác xoá trọn một lượt cộng nhiều học sinh, không đụng lượt trước', async () => {
  const { T } = await boot();
  const { classId, ids, lesson } = seedClass(T);
  T.atp.award([ids[0]], lesson.id, 'speak');
  T.atp.award(ids, lesson.id, 'score_9_plus');
  assert.equal(T.atp.undoLast(lesson.id), 3);
  assert.deepEqual(T.atp.totalsByClass(classId), { [ids[0]]: 1 });
  assert.equal(T.atp.undoLast(lesson.id), 1);
  assert.equal(T.atp.undoLast(lesson.id), 0, 'tiết không còn gì để hoàn tác');
});

test('hoàn tác chỉ tác động tiết đang mở, không xoá lượt của tiết khác', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.atp.award([ids[0]], lesson.id, 'speak');
  T.store.set({ period: 2 });
  const other = T.lessons.current();
  assert.notEqual(other.id, lesson.id);
  assert.equal(T.atp.undoLast(other.id), 0);
  assert.equal(T.atp.totalFor(ids[0]), 1);
});

test('mở lại cùng lớp/năm/tháng/tuần/tiết trả về đúng tiết cũ, không tạo trùng', async () => {
  const { T } = await boot();
  const { lesson } = seedClass(T);
  assert.equal(T.lessons.current().id, lesson.id);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM lessons'), 1);
});

test('xoá vĩnh viễn học sinh xoá kèm ATP, thẻ và tư cách thành viên nhóm', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.atp.award(ids, lesson.id, 'speak');
  T.groups.ensureCount(lesson, 1);
  const g = T.groups.list(lesson.id)[0];
  T.groups.setMember(lesson.id, ids[0], g.id);
  T.evolutions.grant(ids[0], T.cards.list()[0], { year: 2026, month: 10, week: 2 });

  T.students.remove(ids[0]);
  T.students.purge(ids[0]);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM students WHERE id = ?', [ids[0]]), 0);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM atp_events WHERE student_id = ?', [ids[0]]), 0);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM student_cards WHERE student_id = ?', [ids[0]]), 0);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM group_members WHERE student_id = ?', [ids[0]]), 0);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM atp_events'), 2, 'ATP của bạn khác còn nguyên');
});

test('xoá lớp không để lại dữ liệu mồ côi và không ảnh hưởng lớp khác', async () => {
  const { T } = await boot();
  const a = seedClass(T, ['An', 'Bình'], '10A1');
  const b = seedClass(T, ['Hoa'], '11B2');
  T.atp.award(a.ids, a.lesson.id, 'speak');
  T.atp.award(b.ids, b.lesson.id, 'speak');
  T.groups.ensureCount(a.lesson, 2);
  T.groups.shuffle(a.lesson.id, a.ids);
  T.evolutions.grant(a.ids[0], T.cards.list()[0], { year: 2026, month: 10, week: 2 });

  T.classes.remove(a.classId);
  for (const table of ['students', 'lessons', 'atp_events', 'groups']) {
    assert.equal(T.db.scalar(`SELECT COUNT(*) FROM ${table} WHERE class_id = ?`, [a.classId]), 0, table);
  }
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM group_members'), 0);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM student_cards'), 0);
  assert.equal(T.atp.totalFor(b.ids[0]), 1);
});

test('ẩn học sinh: không còn trong danh sách chấm điểm nhưng giữ nguyên ATP', async () => {
  const { T } = await boot();
  const { classId, ids, lesson } = seedClass(T);
  T.atp.award([ids[0]], lesson.id, 'speak');
  T.students.setActive(ids[0], false);
  assert.equal(T.students.list(classId).length, 2);
  assert.equal(T.students.list(classId, true).length, 3);
  assert.equal(T.atp.totalFor(ids[0]), 1);
});

// ---------- T.award: khi nào mở màn lật thẻ ----------

test('cộng cá nhân vừa chạm mốc: mở màn lật thẻ đúng một lần cho em đó', async () => {
  const { T, opened } = await boot();
  const { ids, lesson } = seedClass(T);
  T.settings.set('evolve_threshold', 6);
  T.award([ids[0]], lesson.id, 'manual', { amount: 5 });
  assert.equal(opened.length, 0, 'thiếu 1 ATP thì chưa mở');
  T.award([ids[0]], lesson.id, 'manual', { amount: 1 });
  assert.equal(opened.length, 1);
  assert.equal(opened[0].id, ids[0]);
});

test('đã đủ mốc nhưng chưa lật: cộng thêm mà chưa tới mốc kế thì không mở lại', async () => {
  const { T, opened } = await boot();
  const { ids, lesson } = seedClass(T);
  T.settings.set('evolve_threshold', 6);
  T.award([ids[0]], lesson.id, 'manual', { amount: 6 });
  T.award([ids[0]], lesson.id, 'manual', { amount: 2 });
  assert.equal(opened.length, 1);
});

test('một lượt cộng vượt hai mốc: chỉ mở một lần, còn lại 2 lượt lật', async () => {
  const { T, opened } = await boot();
  const { ids, lesson } = seedClass(T);
  T.settings.set('evolve_threshold', 6);
  T.award([ids[0]], lesson.id, 'manual', { amount: 13 });
  assert.equal(opened.length, 1);
  assert.equal(T.evolutions.pending(T.atp.totalFor(ids[0]), T.evolutions.flips(ids[0])), 2);
});

test('cộng cùng lúc cho nhiều em cùng đạt mốc: không mở màn lật, chỉ một thông báo gộp', async () => {
  const { T, opened, toasts } = await boot();
  const { ids, lesson } = seedClass(T, ['An', 'Bình', 'Chi', 'Dũng', 'Em']);
  T.settings.set('evolve_threshold', 6);
  T.award(ids, lesson.id, 'manual', { amount: 6 });
  assert.equal(opened.length, 0);
  const evo = toasts.filter(x => x.kind === 'gold');
  assert.equal(evo.length, 1, 'không bắn mỗi em một thông báo');
  assert.match(evo[0].msg, /An, Bình, Chi và 2 em khác/);
});

test('cộng điểm nhóm đủ mốc: không bao giờ mở màn lật, kể cả khi chỉ một em đạt', async () => {
  const { T, opened, toasts } = await boot();
  const { ids, lesson } = seedClass(T);
  T.settings.set('evolve_threshold', 6);
  T.groups.ensureCount(lesson, 1);
  const g = T.groups.list(lesson.id)[0];
  T.groups.setMember(lesson.id, ids[0], g.id);
  T.award([ids[0]], lesson.id, 'manual', { amount: 6, groupId: g.id });
  assert.equal(opened.length, 0);
  const evo = toasts.filter(x => x.kind === 'gold');
  assert.equal(evo.length, 1);
  assert.match(evo[0].msg, /Cá nhân/);
});

test('trừ điểm hoặc cộng chưa tới mốc không sinh thông báo tiến hoá', async () => {
  const { T, opened, toasts } = await boot();
  const { ids, lesson } = seedClass(T);
  T.settings.set('evolve_threshold', 6);
  T.award([ids[0]], lesson.id, 'manual', { amount: -3 });
  T.award([ids[0]], lesson.id, 'speak');
  assert.equal(opened.length, 0);
  assert.equal(toasts.filter(x => x.kind === 'gold').length, 0);
});

test('không chọn học sinh nào: cảnh báo và không ghi gì', async () => {
  const { T, toasts } = await boot();
  const { lesson } = seedClass(T);
  T.award([], lesson.id, 'speak');
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM atp_events'), 0);
  assert.equal(toasts.at(-1).kind, 'warn');
});
