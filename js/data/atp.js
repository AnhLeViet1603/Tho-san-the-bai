// Sự kiện ATP: ghi, tính tổng, hoàn tác
(function (T) {
  'use strict';

  const TYPES = {
    speak: { label: 'Phát biểu', icon: '🗣️', setting: 'atp_speak' },
    score_8_9: { label: 'Điểm 8–9', icon: '⭐', setting: 'atp_score_8_9' },
    score_9_plus: { label: 'Điểm 9+', icon: '🌟', setting: 'atp_score_9_plus' },
    manual: { label: 'Thủ công', icon: '✎', setting: null }
  };

  const amountFor = type => (TYPES[type].setting ? T.settings.num(TYPES[type].setting, 0) : 0);

  // Ghi một lượt cộng cho nhiều học sinh; amount được chụp lại tại thời điểm ghi
  function award(studentIds, lessonId, type, opts = {}) {
    if (!TYPES[type]) throw new Error('Loại cộng ATP không hợp lệ: ' + type);
    const lesson = T.lessons.get(lessonId);
    if (!lesson) throw new Error('Không tìm thấy tiết học');
    const amount = opts.amount != null ? opts.amount : amountFor(type);
    if (!Number.isInteger(amount)) throw new Error('Số ATP phải là số nguyên');
    const now = Date.now();
    const batch = now + '-' + Math.random().toString(36).slice(2, 8);
    T.db.tx(() => studentIds.forEach(sid => T.db.run(
      `INSERT INTO atp_events (student_id, class_id, lesson_id, type, amount, group_id, batch_id, note, created_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sid, lesson.class_id, lessonId, type, amount, opts.groupId || null, batch, opts.note || null, now])));
    return amount;
  }

  function toMap(rows) {
    const map = {};
    rows.forEach(r => { map[r.student_id] = r.total; });
    return map;
  }

  // ATP được tính lại từ 0 mỗi năm học: chỉ cộng các lượt ghi trong năm học hiện tại
  function totalsByClass(classId) {
    const r = T.schoolYear.range();
    return toMap(T.db.query(`
      SELECT student_id, SUM(amount) AS total FROM atp_events
      WHERE class_id = ? AND created_ms >= ? AND created_ms < ? GROUP BY student_id`,
      [classId, r.startMs, r.endMs]));
  }

  function totalFor(studentId) {
    const r = T.schoolYear.range();
    return T.db.scalar(`
      SELECT COALESCE(SUM(amount), 0) FROM atp_events
      WHERE student_id = ? AND created_ms >= ? AND created_ms < ?`, [studentId, r.startMs, r.endMs]);
  }

  const totalsByLesson = lessonId => toMap(T.db.query(
    'SELECT student_id, SUM(amount) AS total FROM atp_events WHERE lesson_id = ? GROUP BY student_id', [lessonId]));

  // Xoá lượt cộng gần nhất của tiết; trả về số sự kiện đã xoá
  function undoLast(lessonId) {
    const last = T.db.get('SELECT id, batch_id FROM atp_events WHERE lesson_id = ? ORDER BY id DESC LIMIT 1', [lessonId]);
    if (!last) return 0;
    const n = T.db.scalar('SELECT COUNT(*) FROM atp_events WHERE lesson_id = ? AND batch_id = ?', [lessonId, last.batch_id]);
    T.db.run('DELETE FROM atp_events WHERE lesson_id = ? AND batch_id = ?', [lessonId, last.batch_id]);
    return n;
  }

  // Id các sự kiện của lượt cộng gần nhất trong tiết (lượt mà undoLast sẽ xoá)
  function lastBatchIds(lessonId) {
    const last = T.db.get('SELECT batch_id FROM atp_events WHERE lesson_id = ? ORDER BY id DESC LIMIT 1', [lessonId]);
    if (!last) return [];
    return T.db.query('SELECT id FROM atp_events WHERE lesson_id = ? AND batch_id = ?', [lessonId, last.batch_id]).map(r => r.id);
  }

  // Xoá các sự kiện này thì những em nào thành ra đã lật nhiều thẻ hơn số lượt được hưởng? [{ id, name }]
  function removalImpact(eventIds) {
    if (!eventIds.length) return [];
    const r = T.schoolYear.range();
    const deltas = {};
    T.db.query(`SELECT student_id, SUM(amount) AS s FROM atp_events
      WHERE id IN (${eventIds.map(() => '?').join(',')}) AND created_ms >= ? AND created_ms < ? GROUP BY student_id`,
    [...eventIds, r.startMs, r.endMs]).forEach(row => { deltas[row.student_id] = -row.s; });
    return T.evolutions.overdrawnIf(deltas);
  }

  const history = lessonId => T.db.query(`
    SELECT e.*, s.name AS student_name, g.name AS group_name
    FROM atp_events e
    JOIN students s ON s.id = e.student_id
    LEFT JOIN groups g ON g.id = e.group_id
    WHERE e.lesson_id = ? ORDER BY e.id DESC`, [lessonId]);

  const removeEvent = id => T.db.run('DELETE FROM atp_events WHERE id = ?', [id]);

  T.atp = {
    TYPES, amountFor, award, totalsByClass, totalFor, totalsByLesson, undoLast, lastBatchIds, removalImpact, history, removeEvent
  };
})(window.TSTB);
