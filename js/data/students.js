// CRUD học sinh
(function (T) {
  'use strict';

  function list(classId, includeInactive) {
    return T.db.query(
      `SELECT * FROM students WHERE class_id = ? ${includeInactive ? '' : 'AND active = 1'} ORDER BY sort_order, id`,
      [classId]);
  }

  function add(classId, name) {
    const order = T.db.scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM students WHERE class_id = ?', [classId]);
    return T.db.insert('INSERT INTO students (class_id, name, sort_order) VALUES (?, ?, ?)', [classId, name, order]);
  }

  function bulkAdd(classId, names) {
    T.db.tx(() => names.forEach(n => add(classId, n)));
  }

  const rename = (id, name) => T.db.run('UPDATE students SET name = ? WHERE id = ?', [name, id]);
  const setActive = (id, active) => T.db.run('UPDATE students SET active = ? WHERE id = ?', [active ? 1 : 0, id]);

  function remove(id) {
    const s = T.db.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!s) return;
    T.db.tx(() => {
      T.audit.log('student.delete', `Xoá học sinh ${s.name} (${T.atp.totalFor(id)} ATP năm học, ` +
        `${T.db.scalar('SELECT COUNT(*) FROM student_cards WHERE student_id = ?', [id])} lượt lật thẻ)`, { student: s });
      T.db.run('DELETE FROM student_cards WHERE student_id = ?', [id]);
      T.db.run('DELETE FROM group_members WHERE student_id = ?', [id]);
      T.db.run('DELETE FROM atp_events WHERE student_id = ?', [id]);
      T.db.run('DELETE FROM students WHERE id = ?', [id]);
    });
  }

  function removeAll(classId) {
    const c = T.classes.get(classId);
    const n = T.db.scalar('SELECT COUNT(*) FROM students WHERE class_id = ?', [classId]);
    if (!n) return;
    T.db.tx(() => {
      T.audit.log('student.delete_all', `Xoá toàn bộ ${n} học sinh của lớp ${c ? c.name : classId}`, { classId, count: n });
      const sub = '(SELECT id FROM students WHERE class_id = ?)';
      T.db.run(`DELETE FROM student_cards WHERE student_id IN ${sub}`, [classId]);
      T.db.run(`DELETE FROM group_members WHERE student_id IN ${sub}`, [classId]);
      T.db.run('DELETE FROM atp_events WHERE class_id = ?', [classId]);
      T.db.run('DELETE FROM students WHERE class_id = ?', [classId]);
    });
  }

  T.students = { list, add, bulkAdd, rename, setActive, remove, removeAll };
})(window.TSTB);
