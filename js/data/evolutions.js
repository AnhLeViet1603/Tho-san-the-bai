// Tiến hoá: cứ mỗi mốc ATP trong năm, học sinh được lật 1 thẻ.
// Mỗi loại thẻ chỉ giữ tối đa 1 lá; thẻ có hạn dùng và không dùng được trong tuần vừa nhận.
(function (T) {
  'use strict';

  const DAY = 86400000;
  const threshold = () => Math.max(1, T.settings.num('evolve_threshold', 50));
  const choices = () => Math.max(1, T.settings.num('evolve_choices', 3));

  const SELECT = `
    SELECT v.id AS grant_id, v.student_id, v.status, v.year, v.month, v.week,
      v.granted_at, v.expires_at, v.used_at,
      k.id, k.name, k.icon, k.description, k.image_data, k.expire_days
    FROM student_cards v JOIN cards k ON k.id = v.card_id`;

  // Thẻ quá hạn mà chưa dùng thì tự mất
  function purge() {
    const cond = "status = 'held' AND expires_at IS NOT NULL AND expires_at < ?";
    const now = Date.now();
    if (T.db.scalar(`SELECT 1 FROM student_cards WHERE ${cond} LIMIT 1`, [now])) {
      T.db.run(`UPDATE student_cards SET status = 'expired' WHERE ${cond}`, [now]);
    }
  }

  // { studentId: [thẻ đang giữ] }
  function heldByClass(classId) {
    const map = {};
    T.db.query(`${SELECT} JOIN students s ON s.id = v.student_id
      WHERE s.class_id = ? AND v.status = 'held' ORDER BY v.id`, [classId])
      .forEach(r => { (map[r.student_id] = map[r.student_id] || []).push(r); });
    return map;
  }

  const heldBy = studentId => T.db.query(`${SELECT} WHERE v.student_id = ? AND v.status = 'held' ORDER BY v.id`, [studentId]);

  // Số lượt đã lật trong năm học hiện tại (kể cả thẻ đã dùng / hết hạn)
  function flipsByClass(classId) {
    const r = T.schoolYear.range();
    const map = {};
    T.db.query(`
      SELECT v.student_id, COUNT(*) AS n FROM student_cards v JOIN students s ON s.id = v.student_id
      WHERE s.class_id = ? AND v.granted_at >= ? AND v.granted_at < ? GROUP BY v.student_id`,
      [classId, r.startMs, r.endMs]).forEach(row => { map[row.student_id] = row.n; });
    return map;
  }

  function flips(studentId) {
    const r = T.schoolYear.range();
    return T.db.scalar('SELECT COUNT(*) FROM student_cards WHERE student_id = ? AND granted_at >= ? AND granted_at < ?',
      [studentId, r.startMs, r.endMs]);
  }

  // Số lượt lật còn lại với tổng ATP của năm học và số lượt đã lật
  const pending = (total, done) => Math.max(0, Math.floor(total / threshold()) - (done || 0));

  // Các thẻ học sinh chưa giữ (mỗi loại tối đa 1 lá)
  const available = studentId => T.db.query(`
    SELECT * FROM cards WHERE id NOT IN (
      SELECT card_id FROM student_cards WHERE student_id = ? AND status = 'held')
    ORDER BY sort_order, id`, [studentId]);

  // when: { year, month, week } của tiết đang dạy. Trả về false nếu đã giữ thẻ này.
  function grant(studentId, card, when) {
    if (T.db.scalar("SELECT 1 FROM student_cards WHERE student_id = ? AND card_id = ? AND status = 'held'",
      [studentId, card.id])) return false;
    const now = Date.now();
    // Hết hạn vào cuối ngày thứ N (UTC+7) kể từ ngày nhận
    const expires = card.expire_days > 0
      ? T.time.dayStart(T.time.today()) + (card.expire_days + 1) * DAY - 1 : null;
    T.db.run(`INSERT INTO student_cards (student_id, card_id, year, month, week, granted_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [studentId, card.id, when.year, when.month, when.week, now, expires]);
    return true;
  }

  // Không được dùng thẻ ngay trong tuần nhận thẻ
  const sameWeek = (row, when) => row.year === when.year && row.month === when.month && row.week === when.week;

  const use = (grantId, lessonId) => T.db.run(
    "UPDATE student_cards SET status = 'used', used_at = ?, lesson_id = ? WHERE id = ? AND status = 'held'",
    [Date.now(), lessonId || null, grantId]);

  // Hoàn tác một lần dùng nhầm; trả về false nếu học sinh đã có lại thẻ cùng loại
  function unuse(grantId) {
    const row = T.db.get('SELECT * FROM student_cards WHERE id = ?', [grantId]);
    if (!row || T.db.scalar("SELECT 1 FROM student_cards WHERE student_id = ? AND card_id = ? AND status = 'held'",
      [row.student_id, row.card_id])) return false;
    T.db.run("UPDATE student_cards SET status = 'held', used_at = NULL, lesson_id = NULL WHERE id = ?", [grantId]);
    return true;
  }

  // Thu hồi: xoá hẳn lượt lật, học sinh được lật lại
  const revoke = grantId => T.db.run('DELETE FROM student_cards WHERE id = ?', [grantId]);

  const history = (classId, limit) => T.db.query(`
    SELECT h.*, s.name AS student_name FROM (${SELECT}) h JOIN students s ON s.id = h.student_id
    WHERE s.class_id = ? AND h.status != 'held'
    ORDER BY COALESCE(h.used_at, h.expires_at) DESC LIMIT ?`, [classId, limit || 30]);

  // Số ngày còn lại; null nếu thẻ không có hạn
  const daysLeft = row => (row.expires_at
    ? Math.max(0, T.time.dayIndex(row.expires_at) - T.time.dayIndex(Date.now())) : null);
  const expiryText = row => {
    const d = daysLeft(row);
    if (d == null) return '∞ Không hết hạn';
    return `⏳ ${d ? `Còn ${d} ngày` : 'Hết hạn hôm nay'} (đến ${T.time.fmt(row.expires_at)})`;
  };

  T.evolutions = {
    threshold, choices, purge, heldByClass, heldBy, flipsByClass, flips, pending, available,
    grant, sameWeek, use, unuse, revoke, history, daysLeft, expiryText
  };
})(window.TSTB);
