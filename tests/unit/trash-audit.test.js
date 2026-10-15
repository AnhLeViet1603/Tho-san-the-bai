// Edge case: thùng rác cho lớp (ẩn mà không mất dữ liệu) và nhật ký thao tác
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass } = require('../helpers/app');

const WEEK = { year: 2026, month: 10, week: 1 };
const actions = T => T.audit.list(1000).map(r => r.action).reverse();

async function twoClasses() {
  const { T } = await boot();
  const a = seedClass(T, ['An', 'Bình'], '10A1');
  const b = seedClass(T, ['Chi'], '10A2');
  T.atp.award(a.ids, a.lesson.id, 'manual', { amount: 60 });
  T.atp.award(b.ids, b.lesson.id, 'manual', { amount: 7 });
  T.evolutions.grant(a.ids[0], T.cards.list()[0], WEEK);
  return { T, a, b };
}

test('chuyển lớp vào thùng rác: biến khỏi danh sách, thống kê, tính lượt lật; dữ liệu còn nguyên', async () => {
  const { T, a, b } = await twoClasses();
  const before = T.atp.totalFor(a.ids[0]);
  T.classes.archive(a.classId);

  assert.deepEqual(T.classes.list().map(c => c.id), [b.classId]);
  assert.deepEqual(T.classes.trash().map(c => [c.id, c.student_count]), [[a.classId, 2]]);
  assert.equal(T.stats.summary({}).total, 7, 'thống kê chỉ còn lớp đang dùng');
  assert.equal(T.stats.evolution({}).flips, 0, 'thống kê thẻ cũng bỏ lớp trong thùng rác');
  assert.ok(!T.evolutions.balances().some(x => a.ids.includes(x.id)), 'đổi mốc ATP không tính lớp trong thùng rác');
  assert.equal(T.atp.totalFor(a.ids[0]), before, 'ATP của học sinh còn nguyên');
  assert.equal(T.integrity.check().ok, true, 'không bị coi là dữ liệu mồ côi');

  T.store.set({ classId: a.classId });
  assert.equal(T.store.currentClass().id, b.classId, 'lớp đang chọn bị chuyển vào thùng rác thì chọn lớp khác');
});

test('khôi phục lớp: trở lại cuối danh sách với đủ dữ liệu', async () => {
  const { T, a, b } = await twoClasses();
  T.classes.archive(a.classId);
  T.classes.restore(a.classId);
  assert.deepEqual(T.classes.list().map(c => c.id), [b.classId, a.classId]);
  assert.equal(T.classes.trash().length, 0);
  assert.equal(T.stats.summary({}).total, 60 * 2 + 7);
  assert.equal(T.evolutions.flips(a.ids[0]), 1);
});

test('xoá vĩnh viễn: mất hẳn, không để lại mồ côi, nhật ký ghi số lượng', async () => {
  const { T, a } = await twoClasses();
  T.classes.archive(a.classId);
  T.classes.remove(a.classId);
  assert.equal(T.classes.get(a.classId), null);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM students WHERE class_id = ?', [a.classId]), 0);
  assert.equal(T.integrity.check().ok, true);
  const last = T.audit.list(1)[0];
  assert.equal(last.action, 'class.delete');
  assert.match(last.summary, /10A1 \(2 học sinh, 2 lượt ATP\)/);
  assert.deepEqual(actions(T), ['class.archive', 'class.delete']);
});

test('hoàn tác / xoá lượt ATP được ghi kèm nội dung đã xoá', async () => {
  const { T, a } = await twoClasses();
  T.atp.award(a.ids, a.lesson.id, 'speak');
  assert.equal(T.atp.undoLast(a.lesson.id), 2);
  let e = T.audit.list(1)[0];
  assert.equal(e.action, 'atp.undo');
  assert.match(e.summary, /Phát biểu \+1 ATP · 2 học sinh \(tổng 2\)/);
  assert.deepEqual(e.data.events.map(x => x.student_name), ['An', 'Bình']);

  const id = T.db.scalar('SELECT id FROM atp_events WHERE student_id = ?', [a.ids[1]]);
  T.atp.removeEvent(id);
  e = T.audit.list(1)[0];
  assert.equal(e.action, 'atp.remove');
  assert.match(e.summary, /Thủ công \+60 ATP · Bình/);
  assert.equal(e.data.events[0].id, id);
});

test('hoàn tác khi không còn gì thì không ghi nhật ký', async () => {
  const { T } = await boot();
  const { lesson } = seedClass(T);
  assert.equal(T.atp.undoLast(lesson.id), 0);
  assert.deepEqual(actions(T), []);
});

test('các thao tác sửa thẻ của học sinh đều được ghi, thao tác bị từ chối thì không', async () => {
  const { T, a } = await twoClasses();
  const [c0, c1, c2] = T.cards.list();
  const g = () => T.evolutions.heldBy(a.ids[0])[0].grant_id;

  T.evolutions.setExpiry(g(), '2030-01-01');
  T.evolutions.swap(g(), c1.id);
  assert.equal(T.evolutions.swap(g(), c1.id), false);
  assert.equal(T.evolutions.setExpiry(g(), '2000-01-01'), false);
  T.evolutions.discard(g());
  const removed = T.db.scalar("SELECT id FROM student_cards WHERE status = 'removed'");
  T.evolutions.unuse(removed);
  T.evolutions.revoke(g());
  T.evolutions.grant(a.ids[1], c2, WEEK);
  T.cards.remove(c2.id);

  assert.deepEqual(actions(T), ['card.expiry', 'card.swap', 'card.discard', 'card.unuse', 'card.revoke', 'card.delete']);
  const sums = T.audit.list(10).map(r => r.summary).reverse();
  assert.equal(sums[0], `Sửa hạn ${c0.name} của An thành 01/01/2030`, 'tên thẻ mẫu đã có chữ "Thẻ": không lặp');
  assert.equal(sums[1], `Đổi ${c0.name} của An sang ${c1.name}`);
  assert.equal(sums[5], `Xoá loại ${c2.name} (thu lại 1 lá đang giữ)`);
  assert.equal(T.cards.named('Rồng'), 'thẻ Rồng');
  assert.equal(T.cards.named('Thẻ Rồng'), 'Thẻ Rồng');
  assert.equal(T.cards.named('Thẻo'), 'thẻ Thẻo');
});

test('xoá học sinh / xoá cả lớp học sinh được ghi', async () => {
  const { T, a, b } = await twoClasses();
  T.students.remove(a.ids[0]);
  T.students.removeAll(b.classId);
  T.students.removeAll(b.classId); // lớp đã trống: không ghi thêm
  assert.deepEqual(actions(T), ['student.delete', 'student.delete_all']);
  assert.match(T.audit.list(2)[1].summary, /Xoá học sinh An \(60 ATP năm học, 1 lượt lật thẻ\)/);
});

test(`nhật ký chỉ giữ ${2000} dòng mới nhất`, async () => {
  const { T } = await boot();
  T.db.tx(() => { for (let i = 0; i < T.audit.KEEP + 5; i++) T.audit.log('test', 'dòng ' + i); });
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM audit_log'), T.audit.KEEP);
  assert.equal(T.audit.list(1)[0].summary, 'dòng ' + (T.audit.KEEP + 4));
});

test('nâng cấp DB phiên bản 3: có cột archived_at và bảng nhật ký, lớp cũ vẫn hiện', async () => {
  const { T } = await boot();
  seedClass(T);
  T.db.run('DROP TABLE audit_log');
  T.db.run('PRAGMA user_version = 3');
  // Giả cột archived_at chưa có: không xoá được cột nên chỉ kiểm tra bước chạy lại không hỏng
  await T.db.importBytes(T.db.exportBytes());
  assert.equal(T.db.scalar('PRAGMA user_version'), T.db.schemaVersion());
  assert.equal(T.classes.list().length, 1);
  T.audit.log('test', 'ok');
  assert.equal(T.audit.list(1)[0].summary, 'ok');
});
