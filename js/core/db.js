// SQLite (sql.js) + lưu bền vào IndexedDB
(function (T) {
  'use strict';

  const IDB_NAME = 'tho-san-the-bai';
  const IDB_STORE = 'files';
  const IDB_KEY = 'db.sqlite';

  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, icon TEXT, color TEXT, note TEXT,
      sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL, name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL,
      week INTEGER NOT NULL, period INTEGER NOT NULL, title TEXT, lesson_date TEXT,
      UNIQUE (class_id, year, month, week, period));
    CREATE TABLE IF NOT EXISTS atp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL, class_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL,
      type TEXT NOT NULL, amount INTEGER NOT NULL,
      group_id INTEGER, batch_id TEXT, note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT, icon TEXT,
      threshold_atp INTEGER NOT NULL DEFAULT 0, image_data TEXT,
      sort_order INTEGER DEFAULT 0, expire_days INTEGER DEFAULT 30);
    CREATE TABLE IF NOT EXISTS student_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL, card_id INTEGER NOT NULL,
      year INTEGER NOT NULL, month INTEGER NOT NULL DEFAULT 0, week INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'held',
      granted_at INTEGER NOT NULL, expires_at INTEGER, used_at INTEGER, lesson_id INTEGER);
    CREATE INDEX IF NOT EXISTS idx_student_cards_student ON student_cards (student_id);
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL, name TEXT NOT NULL, color TEXT);
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
      PRIMARY KEY (group_id, student_id));
    CREATE INDEX IF NOT EXISTS idx_students_class ON students (class_id);
    CREATE INDEX IF NOT EXISTS idx_events_student ON atp_events (student_id);
    CREATE INDEX IF NOT EXISTS idx_events_lesson ON atp_events (lesson_id);
    CREATE INDEX IF NOT EXISTS idx_events_class ON atp_events (class_id);
  `;

  const DEFAULT_SETTINGS = {
    schema_version: '1',
    excel_name_column: 'A',
    excel_header_rows: '1',
    atp_speak: '1',
    atp_score_8_9: '2',
    atp_score_9_plus: '3',
    evolve_threshold: '50',
    evolve_choices: '3',
    card_expire_days: '30'
  };

  const SEED_CARDS = [
    ['Thẻ Tế Bào', 'Được chọn chỗ ngồi trong 1 tuần.', '🦠'],
    ['Thẻ San Hô', 'Được giáo viên gợi ý 1 lần khi kiểm tra miệng.', '🪸'],
    ['Thẻ Lưỡng Cư', 'Miễn 1 lần kiểm tra miệng.', '🐸'],
    ['Thẻ Khủng Long', '+0,5 điểm vào bài kiểm tra 15 phút.', '🦖'],
    ['Thẻ Linh Trưởng', '+1 điểm vào bài kiểm tra 1 tiết.', '🦧']
  ];

  // Phiên bản cấu trúc dữ liệu mà bản ứng dụng này hiểu được
  const SCHEMA_VERSION = 1;
  const SNAP_MAX = 5;

  // Lưu lỗi thì thử lại sau 1s, 3s rồi cứ 10s một lần
  const RETRY = [1000, 3000, 10000];

  let SQL = null;
  let db = null;
  let timer = null;
  let retryTimer = null;
  let depth = 0;
  let persist = true;
  let storage = null;  // { get, set, del, keys }: mặc định là IndexedDB
  let version = 0;     // tăng mỗi lần dữ liệu đổi
  let savedVersion = 0;
  let saving = null;
  let failures = 0;
  let status = 'saved'; // saved | pending | saving | error
  const listeners = [];

  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Kho key–value trên IndexedDB: 'db.sqlite' là dữ liệu chính, 'snap:…' là các bản chụp
  async function idbReq(mode, fn) {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, mode);
      const req = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => { idb.close(); resolve(req.result); };
      tx.onerror = () => { idb.close(); reject(tx.error); };
      tx.onabort = () => { idb.close(); reject(tx.error); };
    });
  }

  const idbStorage = {
    get: async key => (await idbReq('readonly', st => st.get(key))) || null,
    set: (key, value) => idbReq('readwrite', st => st.put(value, key)),
    del: key => idbReq('readwrite', st => st.delete(key)),
    keys: () => idbReq('readonly', st => st.getAllKeys())
  };

  function setStatus(next) {
    if (next === status) return;
    status = next;
    listeners.forEach(fn => fn(next));
  }

  const dirty = () => persist && version !== savedVersion;

  // Ghi bản hiện tại vào IndexedDB. Không bao giờ reject: lỗi thì giữ trạng thái "chưa lưu" và tự thử lại.
  async function flush() {
    clearTimeout(timer);
    timer = null;
    clearTimeout(retryTimer);
    retryTimer = null;
    if (!db || !dirty()) return;
    if (saving) {
      await saving;
      return flush();
    }
    const v = version;
    setStatus('saving');
    try {
      saving = storage.set(IDB_KEY, db.export());
      await saving;
      savedVersion = v;
      failures = 0;
      setStatus(dirty() ? 'pending' : 'saved');
      if (dirty()) timer = setTimeout(flush, 300);
    } catch (err) {
      console.error(err);
      if (!persist) return;
      if (!failures) T.ui.toast('Không lưu được dữ liệu: ' + (err && err.message) + '. Đang thử lại…', 'error');
      retryTimer = setTimeout(flush, RETRY[Math.min(failures, RETRY.length - 1)]);
      failures++;
      setStatus('error');
    } finally {
      saving = null;
    }
  }

  function changed() {
    version++;
    if (persist && status !== 'error') setStatus('pending');
  }

  function touch() {
    if (depth || !persist) return;
    changed();
    if (retryTimer) return; // đang chờ thử lại: lần thử đó sẽ lưu luôn thay đổi này
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }

  // fn(status) được gọi mỗi khi trạng thái lưu đổi; trả về hàm huỷ đăng ký
  function onStatus(fn) {
    listeners.push(fn);
    fn(status);
    return () => listeners.splice(listeners.indexOf(fn), 1);
  }

  function run(sql, params) {
    db.run(sql, params || []);
    touch();
  }

  function query(sql, params) {
    const st = db.prepare(sql);
    const out = [];
    try {
      st.bind(params || []);
      while (st.step()) out.push(st.getAsObject());
    } finally {
      st.free();
    }
    return out;
  }

  const get = (sql, params) => query(sql, params)[0] || null;

  function scalar(sql, params) {
    const row = get(sql, params);
    return row ? Object.values(row)[0] : null;
  }

  function insert(sql, params) {
    db.run(sql, params || []);
    const id = scalar('SELECT last_insert_rowid()');
    touch();
    return id;
  }

  function tx(fn) {
    if (depth) return fn();
    db.run('BEGIN');
    depth++;
    try {
      const result = fn();
      db.run('COMMIT');
      return result;
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    } finally {
      depth--;
      touch();
    }
  }

  // Nâng cấp dữ liệu tạo bởi phiên bản cũ
  function migrate() {
    if (!query('PRAGMA table_info(cards)').some(c => c.name === 'expire_days')) {
      db.run('ALTER TABLE cards ADD COLUMN expire_days INTEGER DEFAULT 30');
    }
    if (scalar("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evolutions'")) {
      const now = Date.now();
      db.run(`
        INSERT INTO student_cards (student_id, card_id, year, status, granted_at, expires_at, used_at)
        SELECT student_id, card_id, ?, CASE WHEN used THEN 'used' ELSE 'held' END, ?, ?, CASE WHEN used THEN ? END
        FROM evolutions`, [T.time.parts().year, now, now + 30 * T.time.DAY, now]);
      db.run('DROP TABLE evolutions');
    }
  }

  function prepare() {
    db.run(SCHEMA);
    migrate();
    Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) =>
      db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]));
    if (!scalar("SELECT value FROM settings WHERE key = 'cards_seeded'")) {
      SEED_CARDS.forEach((c, i) =>
        db.run('INSERT INTO cards (name, description, icon, sort_order) VALUES (?, ?, ?, ?)', [...c, i]));
      db.run("INSERT INTO settings (key, value) VALUES ('cards_seeded', '1')");
    }
  }

  // opts.persist = false: chỉ giữ dữ liệu trong bộ nhớ (dùng cho test)
  // opts.storage = { get, set, del, keys }: thay IndexedDB (dùng cho test)
  async function init(opts = {}) {
    if (typeof initSqlJs !== 'function') throw new Error('Thiếu file vendor/sql-asm.js');
    persist = opts.persist !== false;
    storage = opts.storage || idbStorage;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    timer = retryTimer = null;
    version = savedVersion = failures = 0;
    status = 'saved';
    if (!SQL) SQL = await initSqlJs();
    const bytes = persist ? await storage.get(IDB_KEY) : null;
    if (db) db.close();
    db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    prepare();
    changed();
    await flush();
    if (persist) await dailySnapshot();
  }

  const exportBytes = () => db.export();

  // ---------- Bản chụp: giữ tối đa SNAP_MAX bản trong IndexedDB để lùi lại khi nhập nhầm / xoá nhầm ----------
  const SNAP_PREFIX = 'snap:';

  // { key, at, reason, size } mới nhất trước
  async function listSnapshots() {
    if (!persist) return [];
    const keys = (await storage.keys()).filter(k => String(k).startsWith(SNAP_PREFIX));
    const out = [];
    for (const key of keys) {
      const snap = await storage.get(key);
      if (snap) out.push({ key, at: snap.at, reason: snap.reason, size: snap.bytes.length });
    }
    return out.sort((x, y) => y.at - x.at);
  }

  // Chụp dữ liệu hiện tại. Ném lỗi nếu không ghi được (ví dụ đầy bộ nhớ); trả về key, hoặc null khi không lưu bền.
  async function snapshot(reason) {
    if (!persist) return null;
    const at = Date.now();
    const key = `${SNAP_PREFIX}${at}:${reason}:${Math.random().toString(36).slice(2, 8)}`;
    await storage.set(key, { at, reason, bytes: db.export() });
    const old = (await listSnapshots()).slice(SNAP_MAX);
    for (const s of old) await storage.del(s.key);
    return key;
  }

  // Bản chụp hằng ngày lúc mở ứng dụng; lỗi thì bỏ qua (không chặn việc dùng ứng dụng)
  async function dailySnapshot() {
    try {
      const last = (await listSnapshots()).find(s => s.reason === 'daily');
      if (!last || Date.now() - last.at >= T.time.DAY) await snapshot('daily');
    } catch (err) {
      console.error(err);
    }
  }

  // Chụp trước một thao tác thay toàn bộ dữ liệu; không chụp được thì không cho làm
  async function guard(reason) {
    try {
      await snapshot(reason);
    } catch (err) {
      console.error(err);
      throw new Error('Không tạo được bản chụp an toàn trước khi thay dữ liệu (' + (err && err.message) +
        '). Hãy xuất file sao lưu rồi thử lại.');
    }
  }

  // Phiên bản cấu trúc dữ liệu của một DB (lấy số lớn hơn giữa PRAGMA user_version và setting schema_version)
  function schemaOf(d) {
    const one = sql => {
      const st = d.prepare(sql);
      try { return st.step() ? st.get()[0] : null; } finally { st.free(); }
    };
    let setting = null;
    try { setting = one("SELECT value FROM settings WHERE key = 'schema_version'"); } catch (err) { /* chưa có bảng settings */ }
    return Math.max(Number(one('PRAGMA user_version')) || 0, Number(setting) || 0);
  }

  // Mở file .sqlite và kiểm tra trước khi dùng; ném lỗi mô tả rõ nếu không hợp lệ
  function openChecked(bytes) {
    let next;
    try {
      next = new SQL.Database(bytes);
      const st = next.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'classes'");
      const ok = st.step();
      st.free();
      if (!ok) throw new Error('no classes');
    } catch (err) {
      if (next) next.close();
      throw new Error('File không phải dữ liệu của Thợ Săn Thẻ Bài');
    }
    const st = next.prepare('PRAGMA integrity_check');
    const check = st.step() ? st.get()[0] : 'không đọc được';
    st.free();
    if (check !== 'ok') {
      next.close();
      throw new Error('File sao lưu bị hỏng: ' + check);
    }
    if (schemaOf(next) > SCHEMA_VERSION) {
      next.close();
      throw new Error('File được tạo bởi phiên bản mới hơn của ứng dụng. Hãy cập nhật ứng dụng rồi nhập lại.');
    }
    return next;
  }

  // opts.reason: lý do của bản chụp tạo trước khi thay ('before-import' mặc định)
  async function importBytes(bytes, opts = {}) {
    const next = openChecked(bytes);
    try {
      await guard(opts.reason || 'before-import');
    } catch (err) {
      next.close();
      throw err;
    }
    db.close();
    db = next;
    prepare();
    changed();
    await flush();
  }

  async function restoreSnapshot(key) {
    const snap = await storage.get(key);
    if (!snap) throw new Error('Không tìm thấy bản chụp');
    await importBytes(snap.bytes, { reason: 'before-restore' });
  }

  async function reset() {
    await guard('before-reset');
    db.close();
    db = new SQL.Database();
    prepare();
    changed();
    await flush();
  }

  // Dung lượng trình duyệt cấp cho ứng dụng: { usage, quota } (byte) hoặc null nếu không biết
  async function usage() {
    try {
      const nav = window.navigator;
      return nav && nav.storage && nav.storage.estimate ? await nav.storage.estimate() : null;
    } catch (err) {
      return null;
    }
  }

  // Ngừng ghi vào IndexedDB (tab khác đã nhận quyền ghi). Thay đổi sau đó chỉ nằm trong bộ nhớ.
  function detach() {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    timer = retryTimer = null;
    persist = false;
  }

  T.db = {
    init, run, query, get, scalar, insert, tx, flush, dirty, onStatus, detach, exportBytes, importBytes, reset,
    listSnapshots, restoreSnapshot, usage, SNAP_MAX,
    status: () => status
  };
})(window.TSTB);
