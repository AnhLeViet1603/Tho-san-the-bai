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

  let SQL = null;
  let db = null;
  let timer = null;
  let depth = 0;
  let persist = true;

  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet() {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => { idb.close(); resolve(req.result || null); };
      req.onerror = () => { idb.close(); reject(req.error); };
    });
  }

  async function idbSet(bytes) {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => { idb.close(); resolve(); };
      tx.onerror = () => { idb.close(); reject(tx.error); };
    });
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!db || !persist) return Promise.resolve();
    return idbSet(db.export()).catch(err => {
      console.error(err);
      T.ui.toast('Không lưu được dữ liệu: ' + err.message, 'error');
    });
  }

  function touch() {
    if (depth || !persist) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
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
  async function init(opts) {
    if (typeof initSqlJs !== 'function') throw new Error('Thiếu file vendor/sql-asm.js');
    persist = !(opts && opts.persist === false);
    SQL = await initSqlJs();
    const bytes = persist ? await idbGet() : null;
    db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    prepare();
    await flush();
  }

  const exportBytes = () => db.export();

  async function importBytes(bytes) {
    const next = new SQL.Database(bytes);
    let ok = false;
    try {
      const st = next.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'classes'");
      ok = st.step();
      st.free();
    } catch (err) {
      ok = false;
    }
    if (!ok) {
      next.close();
      throw new Error('File không phải dữ liệu của Thợ Săn Thẻ Bài');
    }
    db.close();
    db = next;
    prepare();
    await flush();
  }

  async function reset() {
    db.close();
    db = new SQL.Database();
    prepare();
    await flush();
  }

  T.db = { init, run, query, get, scalar, insert, tx, flush, exportBytes, importBytes, reset };
})(window.TSTB);
