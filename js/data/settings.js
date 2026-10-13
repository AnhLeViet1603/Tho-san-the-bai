// Cài đặt dạng key-value
(function (T) {
  'use strict';

  function get(key, def) {
    const v = T.db.scalar('SELECT value FROM settings WHERE key = ?', [key]);
    return v == null ? def : v;
  }

  function num(key, def) {
    const v = Number(get(key));
    return Number.isFinite(v) ? v : def;
  }

  function set(key, value) {
    T.db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, String(value)]);
  }

  T.settings = { get, num, set };
})(window.TSTB);
