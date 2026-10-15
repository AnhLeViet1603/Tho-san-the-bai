// Edge case: kiểm tra toàn vẹn — bản ghi mồ côi, giá trị lạ, sửa có chụp trước, ATP không hợp lệ bị chặn
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass, fakeStorage } = require('../helpers/app');

const counts = r => Object.fromEntries(r.issues.map(i => [i.key, i.count]));

async function setup() {
  const { T } = await boot();
  const ctx = seedClass(T);
  T.atp.award(ctx.ids, ctx.lesson.id, 'speak');
  T.evolutions.grant(ctx.ids[0], T.cards.list()[0], { year: 2026, month: 10, week: 1 });
  return { T, ...ctx };
}

test('dữ liệu bình thường: không có lỗi', async () => {
  const { T } = await setup();
  const r = T.integrity.check();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.fileError, null);
});

test('xoá học sinh bằng SQL bỏ qua dây chuyền: phát hiện ATP và thẻ mồ côi', async () => {
  const { T, ids } = await setup();
  T.db.run('DELETE FROM students WHERE id = ?', [ids[0]]);
  const r = T.integrity.check();
  assert.equal(r.ok, false);
  assert.deepEqual(counts(r), { atp_events: 1, student_cards: 1 });
});

test('xoá lớp bằng SQL: phát hiện cả chuỗi học sinh, tiết, ATP', async () => {
  const { T, classId } = await setup();
  T.db.run('DELETE FROM classes WHERE id = ?', [classId]);
  const c = counts(T.integrity.check());
  assert.equal(c.students, 3);
  assert.equal(c.lessons, 1);
  assert.equal(c.atp_events, 3);
});

test('giá trị lạ: loại ATP không xác định, ATP không phải số nguyên, trạng thái thẻ lạ', async () => {
  const { T, ids, classId, lesson } = await setup();
  const ins = 'INSERT INTO atp_events (student_id, class_id, lesson_id, type, amount) VALUES (?, ?, ?, ?, ?)';
  T.db.run(ins, [ids[1], classId, lesson.id, 'bonus_tuong_lai', 2]);
  T.db.run(ins, [ids[1], classId, lesson.id, 'manual', 1.5]);
  T.db.run(ins, [ids[1], classId, lesson.id, 'manual', 'abc']);
  T.db.run("UPDATE student_cards SET status = 'lost'");
  assert.deepEqual(counts(T.integrity.check()), { atp_type: 1, atp_amount: 2, card_status: 1 });
});

test('sửa: xoá mồ côi theo dây chuyền, đưa giá trị lạ về mặc định, dữ liệu tốt giữ nguyên', async () => {
  const { T, ids, classId, lesson } = await setup();
  T.db.run('DELETE FROM students WHERE id = ?', [ids[0]]);
  T.db.run('INSERT INTO atp_events (student_id, class_id, lesson_id, type, amount) VALUES (?, ?, ?, ?, ?)',
    [ids[1], classId, lesson.id, 'bonus_tuong_lai', 2]);
  T.evolutions.grant(ids[1], T.cards.list()[1], { year: 2026, month: 10, week: 1 });
  T.db.run("UPDATE student_cards SET status = 'lost' WHERE student_id = ?", [ids[1]]);

  const n = await T.integrity.repair();
  assert.equal(n, 4);
  assert.equal(T.integrity.check().ok, true);
  assert.equal(T.atp.totalFor(ids[1]), 1 + 2, 'lượt loại lạ được giữ, chuyển thành Thủ công');
  assert.equal(T.atp.totalFor(ids[2]), 1);
  assert.equal(T.db.scalar('SELECT status FROM student_cards WHERE student_id = ?', [ids[1]]), 'removed');
});

test('sửa: nhóm mồ côi kéo theo thành viên nhóm (lặp nhiều lượt)', async () => {
  const { T, ids, classId, lesson } = await setup();
  const gid = T.db.insert('INSERT INTO groups (class_id, lesson_id, name) VALUES (?, ?, ?)', [classId, lesson.id, 'Nhóm 1']);
  T.db.run('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)', [gid, ids[0]]);
  T.db.run('DELETE FROM lessons WHERE id = ?', [lesson.id]);
  await T.integrity.repair();
  assert.equal(T.integrity.check().ok, true);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM group_members'), 0);
});

test('sửa: chụp lại trước; không chụp được thì không sửa gì', async t => {
  const { T } = await boot();
  t.mock.method(console, 'error', () => {});
  const storage = fakeStorage();
  await T.db.init({ storage });
  t.after(() => T.db.init({ persist: false }));
  const { ids } = seedClass(T);
  T.atp.award(ids, T.lessons.current().id, 'speak');
  T.db.run('DELETE FROM students WHERE id = ?', [ids[0]]);

  await T.integrity.repair();
  assert.ok((await T.db.listSnapshots()).some(s => s.reason === 'before-repair'));

  T.db.run('DELETE FROM students WHERE id = ?', [ids[1]]);
  const set = storage.set;
  storage.set = async (k, v) => { if (k.startsWith('snap:')) throw new Error('QuotaExceededError'); return set(k, v); };
  await assert.rejects(T.integrity.repair(), /Không tạo được bản chụp an toàn/);
  assert.equal(T.integrity.check().issues[0].count, 1, 'chưa sửa gì');
});

test('ghi ATP: số không nguyên, loại lạ, tiết không tồn tại bị chặn và không ghi gì', async () => {
  const { T, ids, lesson } = await setup();
  const before = T.db.scalar('SELECT COUNT(*) FROM atp_events');
  assert.throws(() => T.atp.award([ids[0]], lesson.id, 'manual', { amount: 1.5 }), /số nguyên/);
  assert.throws(() => T.atp.award([ids[0]], lesson.id, 'manual', { amount: NaN }), /số nguyên/);
  assert.throws(() => T.atp.award([ids[0]], lesson.id, 'manual', { amount: Infinity }), /số nguyên/);
  assert.throws(() => T.atp.award([ids[0]], lesson.id, 'manual', { amount: '3' }), /số nguyên/);
  assert.throws(() => T.atp.award([ids[0]], lesson.id, 'bonus'), /không hợp lệ/);
  assert.throws(() => T.atp.award([ids[0]], 99999, 'speak'), /tiết học/);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM atp_events'), before);
  assert.equal(T.atp.award([ids[0]], lesson.id, 'manual', { amount: -3 }), -3, 'số âm hợp lệ');
});
