// Edge case: chia nhóm, đọc Excel, thống kê, nhập/xuất và nâng cấp dữ liệu
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass } = require('../helpers/app');

// ---------- Nhóm ----------

test('tạo nhóm: gọi lại với số nhỏ hơn không xoá bớt, số lớn hơn chỉ thêm phần thiếu', async () => {
  const { T } = await boot();
  const { lesson } = seedClass(T);
  T.groups.ensureCount(lesson, 3);
  T.groups.ensureCount(lesson, 2);
  assert.equal(T.groups.list(lesson.id).length, 3);
  T.groups.ensureCount(lesson, 5);
  assert.deepEqual(T.groups.list(lesson.id).map(g => g.name), ['Nhóm 1', 'Nhóm 2', 'Nhóm 3', 'Nhóm 4', 'Nhóm 5']);
});

test('chia ngẫu nhiên: mỗi em đúng một nhóm, sĩ số lệch nhau tối đa 1', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  T.groups.ensureCount(lesson, 3);
  T.groups.shuffle(lesson.id, ids);
  T.groups.shuffle(lesson.id, ids); // chia lại không được nhân đôi thành viên
  const groups = T.groups.list(lesson.id);
  const all = groups.flatMap(g => g.members).sort((a, b) => a - b);
  assert.deepEqual(all, ids);
  const sizes = groups.map(g => g.members.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join('/'));
});

test('chia ngẫu nhiên khi chưa có nhóm hoặc nhiều nhóm hơn học sinh đều không lỗi', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T, ['A', 'B']);
  T.groups.shuffle(lesson.id, ids);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM group_members'), 0);
  T.groups.ensureCount(lesson, 5);
  T.groups.shuffle(lesson.id, ids);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM group_members'), 2);
});

test('chuyển học sinh sang nhóm khác không để lại bản ghi ở nhóm cũ; về "chưa có nhóm" thì xoá hẳn', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.groups.ensureCount(lesson, 2);
  const [g1, g2] = T.groups.list(lesson.id);
  T.groups.setMember(lesson.id, ids[0], g1.id);
  T.groups.setMember(lesson.id, ids[0], g2.id);
  T.groups.setMember(lesson.id, ids[0], g2.id); // thả lại vào chính nhóm đó
  assert.deepEqual(T.groups.list(lesson.id).map(g => g.members), [[], [ids[0]]]);
  T.groups.setMember(lesson.id, ids[0], null);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM group_members'), 0);
});

test('điểm nhóm không phụ thuộc sĩ số, mỗi thành viên vẫn nhận đủ ATP', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.groups.ensureCount(lesson, 2);
  const [big, small] = T.groups.list(lesson.id);
  T.atp.award([ids[0], ids[1]], lesson.id, 'score_8_9', { groupId: big.id });
  T.atp.award([ids[0], ids[1]], lesson.id, 'score_8_9', { groupId: big.id });
  T.atp.award([ids[2]], lesson.id, 'score_9_plus', { groupId: small.id });
  assert.deepEqual(T.groups.scores(lesson.id), { [big.id]: 4, [small.id]: 3 });
  assert.equal(T.atp.totalFor(ids[0]), 4);
  assert.equal(T.atp.totalFor(ids[1]), 4);
});

test('xoá nhóm giữ nguyên ATP đã cộng và chuyển thành điểm cá nhân', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  T.groups.ensureCount(lesson, 1);
  const g = T.groups.list(lesson.id)[0];
  T.groups.setMember(lesson.id, ids[0], g.id);
  T.atp.award([ids[0]], lesson.id, 'speak', { groupId: g.id });
  T.groups.remove(g.id);
  assert.equal(T.atp.totalFor(ids[0]), 1);
  assert.deepEqual(T.groups.scores(lesson.id), {});
  assert.equal(T.stats.summary({ source: 'group' }).total, 0);
  assert.equal(T.stats.summary({ source: 'solo' }).total, 1);
});

test('chép nhóm từ tiết trước: bỏ qua học sinh đã ẩn, báo false khi chưa có tiết nào chia nhóm', async () => {
  const { T } = await boot();
  const { ids, lesson } = seedClass(T);
  assert.equal(T.groups.copyFromPrevious(lesson), false);

  T.groups.ensureCount(lesson, 2);
  const [g1, g2] = T.groups.list(lesson.id);
  T.groups.setMember(lesson.id, ids[0], g1.id);
  T.groups.setMember(lesson.id, ids[1], g1.id);
  T.groups.setMember(lesson.id, ids[2], g2.id);
  T.students.setActive(ids[1], false);

  T.store.set({ period: 2 });
  const next = T.lessons.current();
  assert.equal(T.groups.copyFromPrevious(next), true);
  assert.deepEqual(T.groups.list(next.id).map(g => g.members), [[ids[0]], [ids[2]]]);
  assert.equal(T.groups.list(lesson.id).length, 2, 'tiết gốc không bị thay đổi');
});

// ---------- Excel ----------

test('đọc cột tên: bỏ tiêu đề, ô trống, khoảng trắng thừa; ô số được đổi thành chữ', async () => {
  const { T } = await boot();
  const ws = XLSX.utils.aoa_to_sheet([
    ['STT', 'Họ tên'], [1, '  Nguyễn   Văn  An '], [2, ''], [3, null], [4, 'Trần Bình'], [5, 2024], [6, '   ']
  ]);
  assert.deepEqual(T.excelImport.extract(ws, 'B', 1), ['Nguyễn Văn An', 'Trần Bình', '2024']);
});

test('đọc Excel: cột ngoài vùng dữ liệu, số dòng tiêu đề quá lớn và sheet rỗng đều trả về rỗng', async () => {
  const { T } = await boot();
  const ws = XLSX.utils.aoa_to_sheet([['Họ tên'], ['An'], ['Bình']]);
  assert.deepEqual(T.excelImport.extract(ws, 'Z', 1), []);
  assert.deepEqual(T.excelImport.extract(ws, 'A', 99), []);
  assert.deepEqual(T.excelImport.extract(ws, 'A', 0), ['Họ tên', 'An', 'Bình'], 'không có dòng tiêu đề');
  assert.deepEqual(T.excelImport.extract({}, 'A', 1), []);
  assert.deepEqual(T.excelImport.extract(undefined, 'A', 1), []);
});

test('đọc Excel: bảng không bắt đầu từ ô A1 vẫn lấy đúng cột theo chữ cái thật', async () => {
  const { T } = await boot();
  const ws = XLSX.utils.aoa_to_sheet([['Họ tên'], ['An'], ['Bình']], { origin: 'C4' });
  assert.deepEqual(T.excelImport.extract(ws, 'C', 0), ['Họ tên', 'An', 'Bình']);
  assert.deepEqual(T.excelImport.extract(ws, 'C', 4), ['An', 'Bình'], 'tiêu đề nằm ở dòng 4');
  assert.deepEqual(T.excelImport.extract(ws, 'A', 0), []);
});

// ---------- Thống kê ----------

test('thống kê trên dữ liệu trống trả về 0 chứ không phải null', async () => {
  const { T } = await boot();
  seedClass(T);
  const s = T.stats.summary({});
  assert.deepEqual([s.total, s.speak, s.score_8_9, s.score_9_plus, s.students, s.lessons], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(T.stats.byType({}), []);
  assert.deepEqual(T.stats.ranking({}), []);
  assert.deepEqual(T.stats.evolution({}), { rows: [], flips: 0, used: 0 });
});

test('bộ lọc thống kê kết hợp được: lớp, loại, nguồn, học sinh, tuần', async () => {
  const { T } = await boot();
  const a = seedClass(T, ['An', 'Bình'], '10A1');
  T.atp.award(a.ids, a.lesson.id, 'speak');
  T.atp.award([a.ids[0]], a.lesson.id, 'score_9_plus');
  T.groups.ensureCount(a.lesson, 1);
  T.atp.award([a.ids[1]], a.lesson.id, 'speak', { groupId: T.groups.list(a.lesson.id)[0].id });
  const b = seedClass(T, ['Hoa'], '11B2');
  T.store.set({ week: 4 });
  T.atp.award(b.ids, T.lessons.current().id, 'speak');

  assert.equal(T.stats.summary({}).total, 1 + 1 + 3 + 1 + 1);
  assert.equal(T.stats.summary({ classIds: [a.classId] }).total, 6);
  assert.equal(T.stats.summary({ classIds: [a.classId, b.classId] }).total, 7);
  assert.equal(T.stats.summary({ type: 'speak' }).speak, 4);
  assert.equal(T.stats.summary({ source: 'group' }).total, 1);
  assert.equal(T.stats.summary({ studentId: a.ids[0] }).total, 4);
  assert.equal(T.stats.summary({ week: 4 }).total, 1);
  assert.equal(T.stats.summary({ classIds: [a.classId], week: 4 }).total, 0, 'hai điều kiện loại trừ nhau');
  assert.equal(T.stats.ranking({})[0].name, 'An');
});

test('thống kê thẻ: đếm cả thẻ đã dùng và đã hết hạn', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  const [a, b] = T.cards.list();
  const week = { year: 2026, month: 10, week: 2 };
  T.evolutions.grant(ids[0], a, week);
  T.evolutions.grant(ids[1], a, week);
  T.evolutions.grant(ids[0], b, week);
  T.evolutions.use(T.evolutions.heldBy(ids[1])[0].grant_id, null);
  const evo = T.stats.evolution({});
  assert.equal(evo.flips, 3);
  assert.equal(evo.used, 1);
  assert.equal(evo.rows[0].key, a.name);
  assert.equal(T.stats.evolution({ studentId: ids[1] }).flips, 1);
});

// ---------- Nhập / xuất & nâng cấp ----------

test('xuất rồi nhập lại khôi phục nguyên vẹn dữ liệu', async () => {
  const { T } = await boot();
  const { classId, ids, lesson } = seedClass(T);
  T.atp.award(ids, lesson.id, 'score_9_plus');
  const bytes = T.db.exportBytes();
  await T.db.reset();
  assert.equal(T.classes.list().length, 0);
  await T.db.importBytes(bytes);
  assert.equal(T.classes.list()[0].name, '10A1');
  assert.equal(T.students.list(classId).length, 3);
  assert.equal(T.db.scalar('SELECT SUM(amount) FROM atp_events'), 9);
});

test('nhập file không phải dữ liệu của ứng dụng bị từ chối và dữ liệu hiện tại còn nguyên', async () => {
  const { T } = await boot();
  seedClass(T);
  await assert.rejects(T.db.importBytes(new Uint8Array([1, 2, 3, 4, 5])));
  await assert.rejects(T.db.importBytes(new TextEncoder().encode('đây không phải sqlite')));
  assert.equal(T.classes.list().length, 1);
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM students'), 3);
});

test('xoá toàn bộ dữ liệu đưa về trạng thái ban đầu kèm bộ thẻ mẫu và cài đặt mặc định', async () => {
  const { T } = await boot();
  seedClass(T);
  T.settings.set('atp_speak', 99);
  T.cards.list().forEach(c => T.cards.remove(c.id));
  await T.db.reset();
  assert.equal(T.classes.list().length, 0);
  assert.equal(T.cards.list().length, 5);
  assert.equal(T.settings.num('atp_speak'), 1);
});

test('bộ thẻ mẫu không bị tạo lại sau khi người dùng đã xoá hết thẻ', async () => {
  const { T } = await boot();
  T.cards.list().forEach(c => T.cards.remove(c.id));
  await T.db.importBytes(T.db.exportBytes()); // tương đương mở lại ứng dụng
  assert.equal(T.cards.list().length, 0);
});

test('nâng cấp dữ liệu bản cũ: bảng evolutions được chuyển sang student_cards rồi xoá', async () => {
  const { T } = await boot();
  const { ids } = seedClass(T);
  const [a, b] = T.cards.list();
  T.db.run('CREATE TABLE evolutions (student_id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL, used INTEGER DEFAULT 0)');
  T.db.run('INSERT INTO evolutions VALUES (?, ?, 0), (?, ?, 1)', [ids[0], a.id, ids[1], b.id]);

  await T.db.importBytes(T.db.exportBytes());
  assert.equal(T.db.scalar("SELECT COUNT(*) FROM sqlite_master WHERE name = 'evolutions'"), 0);
  assert.deepEqual(T.evolutions.heldBy(ids[0]).map(c => c.id), [a.id]);
  assert.equal(T.db.scalar('SELECT status FROM student_cards WHERE student_id = ?', [ids[1]]), 'used');
  assert.ok(T.evolutions.heldBy(ids[0])[0].expires_at > Date.now(), 'thẻ chuyển sang có hạn dùng mới');

  await T.db.importBytes(T.db.exportBytes()); // chạy nâng cấp lần hai không nhân đôi
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM student_cards'), 2);
});

test('giao dịch lỗi giữa chừng được hoàn lại toàn bộ', async () => {
  const { T } = await boot();
  const { classId } = seedClass(T);
  assert.throws(() => T.db.tx(() => {
    T.students.add(classId, 'Tạm');
    T.db.run('INSERT INTO bang_khong_ton_tai VALUES (1)');
  }));
  assert.equal(T.students.list(classId).length, 3);
  T.students.add(classId, 'Sau lỗi'); // DB vẫn dùng tiếp được, không kẹt trong giao dịch
  assert.equal(T.students.list(classId).length, 4);
});
