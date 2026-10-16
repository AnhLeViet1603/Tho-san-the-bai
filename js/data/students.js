// CRUD học sinh
(function (T) {
  'use strict';

  // Học sinh của lớp (không tính thùng rác); includeInactive: kể cả em đang "Ẩn"
  function list(classId, includeInactive) {
    return T.db.query(
      `SELECT * FROM students WHERE class_id = ? AND archived_at IS NULL ${includeInactive ? '' : 'AND active = 1'}
       ORDER BY sort_order, id`,
      [classId]);
  }

  // Học sinh trong thùng rác của lớp, mới xoá trước
  const trash = classId => T.db.query(`
    SELECT s.*, (SELECT COUNT(*) FROM student_cards v WHERE v.student_id = s.id AND v.status != 'revoked') AS flips
    FROM students s WHERE s.class_id = ? AND s.archived_at IS NOT NULL ORDER BY s.archived_at DESC, s.id DESC`, [classId]);

  function add(classId, name) {
    const order = T.db.scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM students WHERE class_id = ?', [classId]);
    return T.db.insert('INSERT INTO students (class_id, name, sort_order) VALUES (?, ?, ?)', [classId, name, order]);
  }

  function bulkAdd(classId, names) {
    T.db.tx(() => names.forEach(n => add(classId, n)));
  }

  const rename = (id, name) => T.db.run('UPDATE students SET name = ? WHERE id = ?', [name, id]);
  const setActive = (id, active) => T.db.run('UPDATE students SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  const get = id => T.db.get('SELECT * FROM students WHERE id = ?', [id]);

  // Xoá = chuyển vào thùng rác: ATP, thẻ, nhóm còn nguyên nhưng em biến khỏi mọi màn hình và thống kê
  function remove(id) {
    const s = get(id);
    if (!s || s.archived_at) return;
    T.db.tx(() => {
      T.audit.log('student.archive', `Chuyển học sinh ${s.name} vào thùng rác`, { id });
      T.db.run('UPDATE students SET archived_at = ? WHERE id = ?', [Date.now(), id]);
    });
  }

  // Lấy lại từ thùng rác, về cuối danh sách lớp
  function restore(id) {
    const s = get(id);
    if (!s || !s.archived_at) return;
    T.db.tx(() => {
      const order = T.db.scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM students WHERE class_id = ? AND archived_at IS NULL',
        [s.class_id]);
      T.db.run('UPDATE students SET archived_at = NULL, sort_order = ? WHERE id = ?', [order, id]);
      T.audit.log('student.restore', `Khôi phục học sinh ${s.name} từ thùng rác`, { id });
    });
  }

  // Xoá vĩnh viễn: mất hẳn ATP, thẻ, tư cách thành viên nhóm của em
  function purge(id) {
    const s = get(id);
    if (!s) return;
    T.db.tx(() => {
      T.audit.log('student.delete', `Xoá vĩnh viễn học sinh ${s.name} (` +
        `${T.db.scalar('SELECT COALESCE(SUM(amount), 0) FROM atp_events WHERE student_id = ?', [id])} ATP, ` +
        `${T.db.scalar("SELECT COUNT(*) FROM student_cards WHERE student_id = ? AND status != 'revoked'", [id])} lượt lật thẻ)`,
      { student: s });
      T.db.run('DELETE FROM student_cards WHERE student_id = ?', [id]);
      T.db.run('DELETE FROM group_members WHERE student_id = ?', [id]);
      T.db.run('DELETE FROM atp_events WHERE student_id = ?', [id]);
      T.db.run('DELETE FROM students WHERE id = ?', [id]);
    });
  }

  // Chuyển mọi học sinh (đang dùng) của lớp vào thùng rác — dùng khi import "Thay thế danh sách"
  function removeAll(classId) {
    const c = T.classes.get(classId);
    const n = T.db.scalar('SELECT COUNT(*) FROM students WHERE class_id = ? AND archived_at IS NULL', [classId]);
    if (!n) return;
    T.db.tx(() => {
      T.audit.log('student.archive_all', `Chuyển toàn bộ ${n} học sinh của lớp ${c ? c.name : classId} vào thùng rác`,
        { classId, count: n });
      T.db.run('UPDATE students SET archived_at = ? WHERE class_id = ? AND archived_at IS NULL', [Date.now(), classId]);
    });
  }

  T.students = { list, trash, get, add, bulkAdd, rename, setActive, remove, restore, purge, removeAll };
})(window.TSTB);
