// Nạp lớp dữ liệu của ứng dụng vào Node (không cần trình duyệt) với SQLite trong bộ nhớ.
// Chạy toàn bộ test:  node --test "tests/unit/*.test.js"
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

// Chỉ nạp phần không đụng tới DOM: lõi, dữ liệu và các feature thuần logic
const FILES = [
  'js/core/ui.js',
  'js/core/time.js',
  'js/core/db.js',
  'js/core/tab-lock.js',
  'js/core/store.js',
  'js/core/router.js',
  'js/data/settings.js',
  'js/data/schoolyear.js',
  'js/data/classes.js',
  'js/data/students.js',
  'js/data/lessons.js',
  'js/data/atp.js',
  'js/data/cards.js',
  'js/data/evolutions.js',
  'js/data/groups.js',
  'js/data/stats.js',
  'js/data/integrity.js',
  'js/features/award.js',
  'js/features/excel-import.js'
];

const DAY = 86400000;
let loaded = false;

// Trả về { T, toasts, opened }: DB trống mới tinh cho mỗi lần gọi.
// toasts: các thông báo đã hiện; opened: các học sinh được mở màn lật thẻ.
async function boot() {
  if (!loaded) {
    globalThis.window = globalThis;
    globalThis.initSqlJs = require(path.join(ROOT, 'vendor', 'sql-asm.js'));
    globalThis.XLSX = require(path.join(ROOT, 'vendor', 'xlsx.full.min.js'));
    FILES.forEach(f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
    await globalThis.TSTB.db.init({ persist: false });
    loaded = true;
  } else {
    await globalThis.TSTB.db.reset();
  }
  const T = globalThis.TSTB;

  // Thay các phần giao diện bằng bản ghi nhận để kiểm tra
  const toasts = [];
  const opened = [];
  T.ui.toast = (msg, kind) => toasts.push({ msg, kind: kind || '' });
  T.router.refresh = () => {};
  T.evolve = { open: student => opened.push(student) };

  // Năm học bao quanh "hôm nay" để kết quả không phụ thuộc ngày chạy test
  const now = Date.now();
  T.schoolYear.set(dateOf(T, now - 30 * DAY), dateOf(T, now + 300 * DAY));
  T.store.set({ classId: null, year: 2026, month: 10, week: 2, period: 1 });
  return { T, toasts, opened };
}

// 'YYYY-MM-DD' theo UTC+7 của một mốc ms
function dateOf(T, ms) {
  const p = T.time.parts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// Tạo 1 lớp + học sinh + tiết hiện tại. Trả về { classId, ids, lesson }.
function seedClass(T, names, className) {
  const classId = T.classes.save({ name: className || '10A1', icon: '🧬', color: '#5fe08a', note: '' });
  T.students.bulkAdd(classId, names || ['An', 'Bình', 'Chi']);
  T.store.set({ classId });
  return { classId, ids: T.students.list(classId).map(s => s.id), lesson: T.lessons.current() };
}

// Đóng băng "bây giờ" tại một mốc ISO (ví dụ '2026-10-12T10:00:00+07:00')
function freeze(t, iso) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) });
}

// Đặt lại thời điểm ghi của mọi lượt cộng ATP (chuỗi UTC 'YYYY-MM-DD HH:MM:SS'); ghi cả created_ms
function stampEvents(T, sqlUtc, where) {
  T.db.run(`UPDATE atp_events SET created_at = ?, created_ms = CAST(strftime('%s', ?) AS INTEGER) * 1000
    ${where ? 'WHERE ' + where : ''}`, [sqlUtc, sqlUtc]);
}

// Kho lưu giả thay IndexedDB; fails = số lần ghi dữ liệu chính tiếp theo sẽ lỗi.
// s.data là dữ liệu chính ('db.sqlite'); s.map chứa mọi key (kể cả bản chụp).
function fakeStorage(fails = 0) {
  const s = {
    map: new Map(), fails, writes: 0,
    get data() { return s.map.get('db.sqlite') || null; },
    set data(v) { s.map.set('db.sqlite', v); },
    get: async key => s.map.get(key) || null,
    set: async (key, value) => {
      if (key !== 'db.sqlite') { s.map.set(key, value); return; }
      s.writes++;
      if (s.fails > 0) { s.fails--; throw new Error('QuotaExceededError'); }
      s.data = value;
    },
    del: async key => { s.map.delete(key); },
    keys: async () => [...s.map.keys()]
  };
  return s;
}

module.exports = { boot, seedClass, freeze, stampEvents, dateOf, fakeStorage, DAY };
