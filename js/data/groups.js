// Nhóm trong một tiết học
(function (T) {
  'use strict';

  const COLORS = ['#5fe08a', '#ffc94a', '#59d0e0', '#ff8f6b', '#c39bff', '#ff7fb6', '#9be15d', '#6fa8ff'];

  function list(lessonId) {
    const groups = T.db.query('SELECT * FROM groups WHERE lesson_id = ? ORDER BY id', [lessonId]);
    const byId = {};
    groups.forEach(g => { g.members = []; byId[g.id] = g; });
    T.db.query(
      `SELECT gm.* FROM group_members gm JOIN groups g ON g.id = gm.group_id
       JOIN students s ON s.id = gm.student_id AND s.archived_at IS NULL WHERE g.lesson_id = ?`, [lessonId])
      .forEach(m => byId[m.group_id].members.push(m.student_id));
    return groups;
  }

  // Thêm nhóm cho tới khi tiết có đủ `count` nhóm
  function ensureCount(lesson, count) {
    T.db.tx(() => {
      let have = T.db.scalar('SELECT COUNT(*) FROM groups WHERE lesson_id = ?', [lesson.id]);
      while (have < count) {
        T.db.run('INSERT INTO groups (class_id, lesson_id, name, color) VALUES (?, ?, ?, ?)',
          [lesson.class_id, lesson.id, 'Nhóm ' + (have + 1), COLORS[have % COLORS.length]]);
        have++;
      }
    });
  }

  const rename = (id, name) => T.db.run('UPDATE groups SET name = ? WHERE id = ?', [name, id]);

  // Xoá nhóm nhưng giữ ATP đã cộng (chuyển thành điểm cá nhân)
  function remove(id) {
    T.db.tx(() => {
      T.db.run('UPDATE atp_events SET group_id = NULL WHERE group_id = ?', [id]);
      T.db.run('DELETE FROM group_members WHERE group_id = ?', [id]);
      T.db.run('DELETE FROM groups WHERE id = ?', [id]);
    });
  }

  function clear(lessonId) {
    T.db.tx(() => list(lessonId).forEach(g => remove(g.id)));
  }

  // groupId = null: đưa học sinh về "chưa có nhóm"
  function setMember(lessonId, studentId, groupId) {
    T.db.tx(() => {
      T.db.run(
        'DELETE FROM group_members WHERE student_id = ? AND group_id IN (SELECT id FROM groups WHERE lesson_id = ?)',
        [studentId, lessonId]);
      if (groupId) T.db.run('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)', [groupId, studentId]);
    });
  }

  function shuffle(lessonId, studentIds) {
    const groups = list(lessonId);
    if (!groups.length) return;
    const ids = studentIds.slice();
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    T.db.tx(() => {
      T.db.run('DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE lesson_id = ?)', [lessonId]);
      ids.forEach((sid, i) => T.db.run('INSERT INTO group_members (group_id, student_id) VALUES (?, ?)',
        [groups[i % groups.length].id, sid]));
    });
  }

  // Chép nhóm từ tiết gần nhất (cùng lớp) đã có nhóm; trả về false nếu không có
  function copyFromPrevious(lesson) {
    const src = T.db.scalar(
      'SELECT lesson_id FROM groups WHERE class_id = ? AND lesson_id != ? ORDER BY id DESC LIMIT 1',
      [lesson.class_id, lesson.id]);
    if (!src) return false;
    T.db.tx(() => {
      clear(lesson.id);
      list(src).forEach(g => {
        const id = T.db.insert('INSERT INTO groups (class_id, lesson_id, name, color) VALUES (?, ?, ?, ?)',
          [lesson.class_id, lesson.id, g.name, g.color]);
        g.members.forEach(sid => T.db.run(
          `INSERT INTO group_members (group_id, student_id)
           SELECT ?, id FROM students WHERE id = ? AND active = 1 AND archived_at IS NULL`, [id, sid]));
      });
    });
    return true;
  }

  // Điểm nhóm = tổng ATP của các lượt cộng (không phụ thuộc sĩ số nhóm)
  function scores(lessonId) {
    const map = {};
    T.db.query(`
      SELECT group_id, SUM(amount) AS total FROM (
        SELECT group_id, batch_id, MAX(amount) AS amount FROM atp_events
        WHERE lesson_id = ? AND group_id IS NOT NULL GROUP BY group_id, batch_id)
      GROUP BY group_id`, [lessonId]).forEach(r => { map[r.group_id] = r.total; });
    return map;
  }

  T.groups = { list, ensureCount, rename, remove, clear, setMember, shuffle, copyFromPrevious, scores };
})(window.TSTB);
