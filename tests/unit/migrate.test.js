// Edge case: nâng cấp cấu trúc dữ liệu theo PRAGMA user_version — DB cũ, DB mới hơn, bước lỗi phải rollback
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, fakeStorage } = require('../helpers/app');

const addClass = (T, name) => T.classes.save({ name, icon: '🧬', color: '#5fe08a', note: '' });
const names = T => T.db.query('SELECT name FROM classes ORDER BY id').map(r => r.name);
const userVersion = T => T.db.scalar('PRAGMA user_version');
const hasTable = (T, name) => !!T.db.scalar("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

async function setup(t) {
  const { T } = await boot();
  t.mock.method(console, 'error', () => {});
  t.after(() => T.db.init({ persist: false }));
  return T;
}

// Bytes của một DB tạo bằng chính ứng dụng rồi chỉnh tuỳ ý bằng sql.js
async function dbBytes(T, edit) {
  const SQL = await globalThis.initSqlJs();
  const d = new SQL.Database(T.db.exportBytes());
  edit(d);
  const bytes = d.export();
  d.close();
  return bytes;
}

// Kho lưu giả có sẵn dữ liệu chính
function storageWith(bytes) {
  const s = fakeStorage();
  s.data = bytes;
  return s;
}

test('DB mới tinh: ở phiên bản mới nhất, setting schema_version khớp', async t => {
  const T = await setup(t);
  await T.db.init({ storage: fakeStorage() });
  assert.equal(userVersion(T), T.db.schemaVersion());
  assert.equal(T.db.scalar("SELECT value FROM settings WHERE key = 'schema_version'"), String(T.db.schemaVersion()));
  assert.ok(T.db.schemaVersion() >= 1);
});

test('DB của bản 1.1.x (chưa có user_version) được nâng cấp, dữ liệu giữ nguyên, có bản chụp trước khi nâng cấp', async t => {
  const T = await setup(t);
  await T.db.init({ storage: fakeStorage() });
  addClass(T, 'Lop-Cu');
  const old = await dbBytes(T, d => d.run('PRAGMA user_version = 0'));
  const storage = storageWith(old);
  await T.db.init({ storage });
  assert.equal(userVersion(T), T.db.schemaVersion());
  assert.deepEqual(names(T), ['Lop-Cu']);
  assert.equal(T.db.query('SELECT * FROM cards').length, 12, 'không gieo lại thẻ mẫu');
  const snap = (await T.db.listSnapshots()).find(s => s.reason === 'before-migrate');
  assert.ok(snap, 'có bản chụp trước khi nâng cấp');
  assert.ok(same(storage.map.get(snap.key).bytes, old), 'bản chụp là dữ liệu trước nâng cấp');
});

test('DB bản thử nghiệm trước 1.0.0 (bảng evolutions, thiếu expire_days) được chuyển đổi', async t => {
  const T = await setup(t);
  await T.db.init({ storage: fakeStorage() });
  addClass(T, '10A1');
  T.students.bulkAdd(T.classes.list()[0].id, ['An', 'Bình']);
  const [an, binh] = T.db.query('SELECT id FROM students ORDER BY id').map(r => r.id);
  const card = T.cards.list()[0].id;
  const old = await dbBytes(T, d => {
    d.run('PRAGMA user_version = 0');
    d.run('DROP TABLE student_cards');
    d.run(`CREATE TABLE cards_old AS SELECT id, name, description, icon, threshold_atp, image_data, sort_order FROM cards;
      DROP TABLE cards; ALTER TABLE cards_old RENAME TO cards;`);
    d.run('CREATE TABLE evolutions (student_id INTEGER, card_id INTEGER, used INTEGER)');
    d.run('INSERT INTO evolutions VALUES (?, ?, 0), (?, ?, 1)', [an, card, binh, card]);
  });
  await T.db.init({ storage: storageWith(old) });
  assert.equal(hasTable(T, 'evolutions'), false);
  assert.ok(T.db.query('PRAGMA table_info(cards)').some(c => c.name === 'expire_days'));
  const rows = T.db.query('SELECT student_id, status FROM student_cards ORDER BY student_id');
  assert.deepEqual(rows.map(r => [r.student_id, r.status]), [[an, 'held'], [binh, 'used']]);
});

test('DB đã ở phiên bản mới nhất: không chạy lại bước nào, không chụp', async t => {
  const T = await setup(t);
  let calls = 0;
  const steps = [d => { calls++; T.db.MIGRATIONS[0](d); }];
  const storage = fakeStorage();
  await T.db.init({ storage, migrations: steps });
  assert.equal(calls, 1);
  await T.db.init({ storage, migrations: steps });
  assert.equal(calls, 1);
  assert.ok(!(await T.db.listSnapshots()).some(s => s.reason === 'before-migrate'));
});

test('nâng cấp nhiều bước liên tiếp từ phiên bản cũ', async t => {
  const T = await setup(t);
  const storage = fakeStorage();
  await T.db.init({ storage });
  const steps = [...T.db.MIGRATIONS,
    d => d.run('CREATE TABLE extra_a (x)'),
    d => d.run('CREATE TABLE extra_b (x)')];
  await T.db.init({ storage, migrations: steps });
  assert.equal(userVersion(T), steps.length);
  assert.ok(hasTable(T, 'extra_a') && hasTable(T, 'extra_b'));
});

test('bước nâng cấp lỗi: rollback bước đó, báo lỗi, không ghi đè dữ liệu đã lưu', async t => {
  const T = await setup(t);
  const storage = fakeStorage();
  await T.db.init({ storage });
  addClass(T, 'Lop-1');
  await T.db.flush();
  const saved = storage.data;
  const steps = [...T.db.MIGRATIONS,
    d => d.run('CREATE TABLE extra_ok (x)'),
    d => { d.run('CREATE TABLE half_done (x)'); throw new Error('hỏng giữa chừng'); }];
  const n = T.db.MIGRATIONS.length;
  await assert.rejects(T.db.init({ storage, migrations: steps }), new RegExp(`phiên bản ${n + 2}: hỏng giữa chừng`));
  assert.equal(storage.data, saved, 'IndexedDB giữ nguyên bản trước khi nâng cấp');
  assert.equal(hasTable(T, 'half_done'), false, 'bước lỗi được rollback');
  assert.equal(userVersion(T), n + 1, 'các bước trước đó vẫn đã chạy trong bộ nhớ');
  assert.ok((await T.db.listSnapshots()).some(s => s.reason === 'before-migrate'));
});

test('DB tạo bởi phiên bản mới hơn: không mở, không ghi đè', async t => {
  const T = await setup(t);
  await T.db.init({ storage: fakeStorage() });
  addClass(T, 'Lop-1');
  const newer = await dbBytes(T, d => d.run('PRAGMA user_version = 99'));
  const storage = storageWith(newer);
  await assert.rejects(T.db.init({ storage }), /phiên bản mới hơn/);
  assert.equal(storage.data, newer);
});

test('nhập file cũ: được nâng cấp lên phiên bản mới nhất', async t => {
  const T = await setup(t);
  await T.db.init({ storage: fakeStorage() });
  addClass(T, 'Lop-Cu');
  const old = await dbBytes(T, d => d.run('PRAGMA user_version = 0'));
  await T.db.reset();
  await T.db.importBytes(old);
  assert.equal(userVersion(T), T.db.schemaVersion());
  assert.deepEqual(names(T), ['Lop-Cu']);
});

test('nhập file mà bước nâng cấp lỗi: giữ nguyên dữ liệu đang dùng', async t => {
  const T = await setup(t);
  const steps = [...T.db.MIGRATIONS, d => d.run('CREATE TABLE extra (x)')];
  await T.db.init({ storage: fakeStorage(), migrations: steps });
  addClass(T, 'Lop-Hien-Tai');
  // File ở phiên bản ngay trước bước extra nhưng đã có sẵn bảng extra nên bước đó sẽ lỗi
  const n = T.db.MIGRATIONS.length;
  const bad = await dbBytes(T, d => { d.run(`PRAGMA user_version = ${n}`); d.run("UPDATE classes SET name = 'Lop-File'"); });
  await assert.rejects(T.db.importBytes(bad), new RegExp(`phiên bản ${n + 1}`));
  assert.deepEqual(names(T), ['Lop-Hien-Tai']);
  addClass(T, 'Lop-2');
  assert.deepEqual(names(T), ['Lop-Hien-Tai', 'Lop-2'], 'DB vẫn dùng được');
});

test('DB bản 1.2.0 (phiên bản 6, chưa có độ hiếm) lên phiên bản 7: mọi thẻ và lá cũ là R, chạy lại không hỏng', async t => {
  const T = await setup(t);
  await T.db.init({ storage: fakeStorage() });
  const cid = addClass(T, 'Lop-Cu');
  T.students.bulkAdd(cid, ['An']);
  const sid = T.students.list(cid)[0].id;
  T.evolutions.grant(sid, T.cards.list()[0], { year: 2026, month: 10, week: 2 });
  const old = await dbBytes(T, d => {
    d.run('ALTER TABLE student_cards DROP COLUMN rarity');
    d.run('ALTER TABLE cards DROP COLUMN rarity');
    d.run('PRAGMA user_version = 6');
  });
  await T.db.init({ storage: storageWith(old) });
  assert.equal(userVersion(T), 7);
  assert.deepEqual([...new Set(T.db.query('SELECT rarity FROM cards').map(r => r.rarity))], ['R']);
  assert.deepEqual(T.db.query('SELECT rarity FROM student_cards').map(r => r.rarity), ['R']);
  assert.doesNotThrow(() => T.db.MIGRATIONS[6]({ run: (sql, p) => T.db.run(sql, p) }), "chạy lại bước 7 không hỏng");
  assert.equal(T.db.scalar('SELECT COUNT(*) FROM student_cards WHERE rarity IS NULL'), 0);
});
