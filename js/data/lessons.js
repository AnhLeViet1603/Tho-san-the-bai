// Tiết học theo lớp / năm / tháng / tuần / tiết
(function (T) {
  'use strict';

  const get = id => T.db.get('SELECT * FROM lessons WHERE id = ?', [id]);

  function ensure(classId, year, month, week, period) {
    const key = [classId, year, month, week, period];
    const found = T.db.get(
      'SELECT * FROM lessons WHERE class_id = ? AND year = ? AND month = ? AND week = ? AND period = ?', key);
    if (found) return found;
    const id = T.db.insert('INSERT INTO lessons (class_id, year, month, week, period) VALUES (?, ?, ?, ?, ?)', key);
    return get(id);
  }

  // Tiết của store hiện tại
  function current() {
    const s = T.store.state;
    return ensure(s.classId, s.year, s.month, s.week, s.period);
  }

  const label = l => `Tháng ${l.month}/${l.year} · Tuần ${l.week} · Tiết ${l.period}`;

  T.lessons = { get, ensure, current, label };
})(window.TSTB);
