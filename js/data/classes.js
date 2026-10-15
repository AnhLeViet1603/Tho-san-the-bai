// CRUD lớp học
(function (T) {
  'use strict';

  const ICONS = ['🌿', '🌱', '🌳', '🍄', '🧬', '🦠', '🔬', '🦋', '🐛', '🐝', '🐞', '🦎',
    '🐸', '🐢', '🦕', '🦖', '🐟', '🐬', '🦉', '🦅', '🦊', '🐺', '🐘', '🦧'];

  // Các lớp đang dùng (không tính lớp trong thùng rác); atp_total chỉ tính trong năm học hiện tại
  function list() {
    const r = T.schoolYear.range();
    return T.db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.active = 1) AS student_count,
        (SELECT COALESCE(SUM(e.amount), 0) FROM atp_events e
          WHERE e.class_id = c.id AND e.created_ms >= ? AND e.created_ms < ?) AS atp_total
      FROM classes c WHERE c.archived_at IS NULL ORDER BY c.sort_order, c.id`, [r.startMs, r.endMs]);
  }

  // Lớp trong thùng rác, mới xoá trước
  const trash = () => T.db.query(`
    SELECT c.*, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count
    FROM classes c WHERE c.archived_at IS NOT NULL ORDER BY c.archived_at DESC`);

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

  // Chuyển vào thùng rác: dữ liệu giữ nguyên, lớp biến khỏi mọi màn hình và thống kê cho tới khi khôi phục
  function archive(id) {
    const c = get(id);
    if (!c || c.archived_at) return;
    T.db.tx(() => {
      T.db.run('UPDATE classes SET archived_at = ? WHERE id = ?', [Date.now(), id]);
      T.audit.log('class.archive', `Chuyển lớp ${c.name} vào thùng rác`, { id });
    });
  }

  function restore(id) {
    const c = get(id);
    if (!c || !c.archived_at) return;
    T.db.tx(() => {
      const order = T.db.scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM classes WHERE archived_at IS NULL');
      T.db.run('UPDATE classes SET archived_at = NULL, sort_order = ? WHERE id = ?', [order, id]);
      T.audit.log('class.restore', `Khôi phục lớp ${c.name} từ thùng rác`, { id });
    });
  }

  // Xoá vĩnh viễn lớp cùng mọi học sinh, tiết, ATP, thẻ, nhóm của lớp
  function remove(id) {
    const c = get(id);
    if (!c) return;
    const counts = {
      students: T.db.scalar('SELECT COUNT(*) FROM students WHERE class_id = ?', [id]),
      atp_events: T.db.scalar('SELECT COUNT(*) FROM atp_events WHERE class_id = ?', [id])
    };
    T.db.tx(() => {
      T.audit.log('class.delete', `Xoá vĩnh viễn lớp ${c.name} (${counts.students} học sinh, ${counts.atp_events} lượt ATP)`,
        Object.assign({ class: c }, counts));
      T.db.run('DELETE FROM student_cards WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)', [id]);
      T.db.run('DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE class_id = ?)', [id]);
      T.db.run('DELETE FROM groups WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM atp_events WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM lessons WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM students WHERE class_id = ?', [id]);
      T.db.run('DELETE FROM classes WHERE id = ?', [id]);
    });
  }

  T.classes = { ICONS, list, trash, get, save, move, archive, restore, remove };
})(window.TSTB);
