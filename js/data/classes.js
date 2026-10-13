// CRUD lớp học
(function (T) {
  'use strict';

  const ICONS = ['🌿', '🌱', '🌳', '🍄', '🧬', '🦠', '🔬', '🦋', '🐛', '🐝', '🐞', '🦎',
    '🐸', '🐢', '🦕', '🦖', '🐟', '🐬', '🦉', '🦅', '🦊', '🐺', '🐘', '🦧'];

  // atp_total chỉ tính trong năm học hiện tại
  function list() {
    const r = T.schoolYear.range();
    return T.db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.active = 1) AS student_count,
        (SELECT COALESCE(SUM(e.amount), 0) FROM atp_events e
          WHERE e.class_id = c.id AND e.created_at >= ? AND e.created_at < ?) AS atp_total
      FROM classes c ORDER BY c.sort_order, c.id`, [r.startSql, r.endSql]);
  }

  const get = id => T.db.get('SELECT * FROM classes WHERE id = ?', [id]);

  function save(c) {
    if (c.id) {
      T.db.run('UPDATE classes SET name = ?, icon = ?, color = ?, note = ? WHERE id = ?',
        [c.name, c.icon, c.color, c.note, c.id]);
      return c.id;
    }
    const order = T.db.scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM classes');
    return T.db.insert('INSERT INTO classes (name, icon, color, note, sort_order) VALUES (?, ?, ?, ?, ?)',
      [c.name, c.icon, c.color, c.note, order]);
  }

  // dir: -1 lên, +1 xuống
  function move(id, dir) {
    const ids = list().map(c => c.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    T.db.tx(() => ids.forEach((cid, n) => T.db.run('UPDATE classes SET sort_order = ? WHERE id = ?', [n, cid])));
  }

  function remove(id) {
    T.db.tx(() => {
      T.db.run('DELETE FROM student_cards WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)', [id]);
      T.db.run('DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE class_id = ?)', [id]);
      T.db.run('DELETE FROM groups WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM atp_events WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM lessons WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM students WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM classes WHERE id = ?', [id]);
    });
  }

  T.classes = { ICONS, list, get, save, move, remove };
})(window.TSTB);
