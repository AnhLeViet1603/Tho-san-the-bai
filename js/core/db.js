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
    card_expire_days: '30',
    // Tỉ lệ độ hiếm khi lật thẻ: 2 mốc cắt trên thanh 0–100 → R [0, cut_sr) · SR [cut_sr, cut_ssr) · SSR [cut_ssr, 100)
    rarity_cut_sr: '70',
    rarity_cut_ssr: '95'
  };

  const SEED_CARDS = [
    ['Thẻ Tế Bào', 'Được chọn chỗ ngồi trong 1 tuần.', '🦠'],
    ['Thẻ San Hô', 'Được giáo viên gợi ý 1 lần khi kiểm tra miệng.', '🪸'],
    ['Thẻ Lưỡng Cư', 'Miễn 1 lần kiểm tra miệng.', '🐸'],
    ['Thẻ Khủng Long', '+0,5 điểm vào bài kiểm tra 15 phút.', '🦖'],
    ['Thẻ Linh Trưởng', '+1 điểm vào bài kiểm tra 1 tiết.', '🦧']
  ];

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
  let fresh = false;    // lần mở này tạo DB mới vì trình duyệt chưa có dữ liệu (lần đầu, hoặc dữ liệu vừa bị xoá)
  const listeners = [];
  const savedListeners = []; // gọi sau mỗi lần ghi IndexedDB thành công (tự lưu ra file nối vào đây)

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
    listeners.slice().forEach(fn => fn(next)); // bản sao: listener có thể tự huỷ đăng ký giữa chừng
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
      savedListeners.slice().forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
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

  // ---------- Nâng cấp cấu trúc dữ liệu ----------
  // Mỗi bước nâng DB từ phiên bản i lên i + 1 (PRAGMA user_version), nhận DB sql.js. Chỉ THÊM bước mới vào cuối,
  // không sửa bước đã phát hành: DB của người dùng có thể đang ở bất kỳ phiên bản nào trước đó.
  // Viết mỗi bước sao cho chạy lại lần nữa cũng không hỏng (IF NOT EXISTS, kiểm tra cột trước khi ALTER).
  const MIGRATIONS = [
    // 1: cấu trúc của bản 1.0.0 – 1.1.x (các bản này chưa ghi user_version nên DB của chúng có user_version = 0).
    // Bổ sung luôn những gì bản thử nghiệm trước 1.0.0 còn thiếu.
    () => {
      db.run(SCHEMA);
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
    },

    // 2: mỗi học sinh giữ tối đa 1 lá mỗi loại do DB đảm bảo; loại thẻ bị xoá thì chỉ ẩn (archived)
    d => {
      // Dữ liệu cũ lỡ có lá trùng: giữ lá nhận trước, lá còn lại coi như giáo viên đã xoá (vẫn tính lượt lật)
      d.run(`UPDATE student_cards SET status = 'removed', used_at = COALESCE(used_at, ?)
        WHERE status = 'held' AND id NOT IN (
          SELECT MIN(id) FROM student_cards WHERE status = 'held' GROUP BY student_id, card_id)`, [Date.now()]);
      d.run("CREATE UNIQUE INDEX IF NOT EXISTS ux_student_cards_held ON student_cards (student_id, card_id) WHERE status = 'held'");
      if (!query('PRAGMA table_info(cards)').some(c => c.name === 'archived')) {
        d.run('ALTER TABLE cards ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
      }
    },

    // 3: thời điểm ghi ATP lưu bằng mili giây như các bảng khác (created_at là chuỗi UTC của SQLite, chỉ tới giây),
    // để ranh giới năm học được so một cách duy nhất. created_at giữ lại cho dữ liệu cũ.
    d => {
      if (!query('PRAGMA table_info(atp_events)').some(c => c.name === 'created_ms')) {
        d.run('ALTER TABLE atp_events ADD COLUMN created_ms INTEGER');
      }
      d.run(`UPDATE atp_events SET created_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000
        WHERE created_ms IS NULL`);
      d.run('CREATE INDEX IF NOT EXISTS idx_events_class_time ON atp_events (class_id, created_ms)');
    },

    // 4: thùng rác cho lớp (archived_at: lúc chuyển vào thùng rác) và nhật ký thao tác
    d => {
      if (!query('PRAGMA table_info(classes)').some(c => c.name === 'archived_at')) {
        d.run('ALTER TABLE classes ADD COLUMN archived_at INTEGER');
      }
      d.run(`CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, data TEXT)`);
      d.run('CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at)');
    },

    // 5: thùng rác cho loại thẻ — archived_at là lúc xoá, cũng là used_at của các lá bị thu lại lúc đó
    // (để khôi phục loại thẻ thì trả đúng những lá ấy). Loại đã ẩn từ trước: lấy lần thu lá gần nhất.
    d => {
      if (!query('PRAGMA table_info(cards)').some(c => c.name === 'archived_at')) {
        d.run('ALTER TABLE cards ADD COLUMN archived_at INTEGER');
      }
      d.run(`UPDATE cards SET archived_at = COALESCE(
          (SELECT MAX(used_at) FROM student_cards v WHERE v.card_id = cards.id AND v.status = 'removed'), 0)
        WHERE archived = 1 AND archived_at IS NULL`);
    },

    // 6: thùng rác cho học sinh (archived_at: lúc xoá). Khác "Ẩn" (active = 0): học sinh trong thùng rác biến khỏi
    // mọi màn hình kể cả danh sách lớp và thống kê, nhưng dữ liệu còn nguyên để khôi phục.
    d => {
      if (!query('PRAGMA table_info(students)').some(c => c.name === 'archived_at')) {
        d.run('ALTER TABLE students ADD COLUMN archived_at INTEGER');
      }
    },

    // 7: độ hiếm thẻ R / SR / SSR. student_cards.rarity là độ hiếm của loại thẻ lúc phát (snapshot),
    // để giáo viên đổi độ hiếm loại thẻ về sau không làm sai lịch sử. Thẻ và lá cũ đều là R.
    d => {
      if (!query('PRAGMA table_info(cards)').some(c => c.name === 'rarity')) {
        d.run("ALTER TABLE cards ADD COLUMN rarity TEXT NOT NULL DEFAULT 'R'");
      }
      if (!query('PRAGMA table_info(student_cards)').some(c => c.name === 'rarity')) {
        d.run('ALTER TABLE student_cards ADD COLUMN rarity TEXT');
      }
      d.run(`UPDATE student_cards SET rarity = COALESCE((SELECT k.rarity FROM cards k WHERE k.id = student_cards.card_id), 'R')
        WHERE rarity IS NULL`);
    }
  ];

  let migrations = MIGRATIONS;
  const latest = () => migrations.length;
  const versionOf = () => Number(scalar('PRAGMA user_version')) || 0;

  const NEWER = 'Dữ liệu được tạo bởi phiên bản mới hơn của ứng dụng. Hãy cập nhật ứng dụng rồi mở lại.';

  // Chạy lần lượt các bước còn thiếu, mỗi bước một transaction: lỗi thì DB giữ nguyên ở bước trước.
  function migrate() {
    const from = versionOf();
    if (from > latest()) throw new Error(NEWER);
    for (let v = from; v < latest(); v++) {
      db.run('BEGIN');
      try {
        migrations[v](db);
        db.run(`PRAGMA user_version = ${v + 1}`);
        db.run('COMMIT');
      } catch (err) {
        db.run('ROLLBACK');
        throw new Error(`Không nâng cấp được dữ liệu lên phiên bản ${v + 1}: ${err.message}`);
      }
    }
  }

  function prepare() {
    migrate();
    Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) =>
      db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]));
    // Giữ setting để file sao lưu đọc được phiên bản cả khi công cụ khác làm mất user_version
    db.run("UPDATE settings SET value = ? WHERE key = 'schema_version'", [String(latest())]);
    if (!scalar("SELECT value FROM settings WHERE key = 'cards_seeded'")) {
      SEED_CARDS.forEach((c, i) =>
        db.run('INSERT INTO cards (name, description, icon, sort_order) VALUES (?, ?, ?, ?)', [...c, i]));
      db.run("INSERT INTO settings (key, value) VALUES ('cards_seeded', '1')");
    }
  }

  // opts.persist = false: chỉ giữ dữ liệu trong bộ nhớ (dùng cho test)
  // opts.storage = { get, set, del, keys }: thay IndexedDB (dùng cho test)
  // opts.migrations: thay danh sách bước nâng cấp (dùng cho test)
  async function init(opts = {}) {
    if (typeof initSqlJs !== 'function') throw new Error('Thiếu file vendor/sql-asm.js');
    persist = opts.persist !== false;
    storage = opts.storage || idbStorage;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    timer = retryTimer = null;
    version = savedVersion = failures = 0;
    status = 'saved';
    migrations = opts.migrations || MIGRATIONS;
    if (!SQL) SQL = await initSqlJs();
    const bytes = persist ? await storage.get(IDB_KEY) : null;
    fresh = persist && !bytes;
    if (db) db.close();
    db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    // Chụp lại trước khi nâng cấp dữ liệu đang có; lỗi chụp không chặn việc nâng cấp
    // (mỗi bước nâng cấp đã chạy trong transaction, và lỗi thì không ghi gì vào IndexedDB)
    if (bytes && persist && versionOf() < latest()) {
      try { await snapshot('before-migrate'); } catch (err) { console.error(err); }
    }
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
    if (schemaOf(next) > latest()) {
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
    const prev = db;
    db = next;
    try {
      prepare();
    } catch (err) {
      db = prev;
      next.close();
      throw err;
    }
    prev.close();
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

  // Kho key–value đang dùng (IndexedDB hoặc bản giả khi test) cho dữ liệu phụ, ví dụ file tự lưu đã chọn.
  // Không dùng tiền tố 'snap:' (dành cho bản chụp) và key 'db.sqlite'.
  const kv = {
    get: key => storage.get(key),
    set: (key, value) => storage.set(key, value),
    del: key => storage.del(key)
  };

  // fn() sau mỗi lần ghi IndexedDB thành công; trả về hàm huỷ đăng ký
  function onSaved(fn) {
    savedListeners.push(fn);
    return () => savedListeners.splice(savedListeners.indexOf(fn), 1);
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
    listSnapshots, restoreSnapshot, guard, usage, kv, onSaved, writable: () => persist, SNAP_MAX, schemaVersion: latest, MIGRATIONS,
    status: () => status,
    fresh: () => fresh
  };
})(window.TSTB);
