// Bộ thẻ tiến hoá: mỗi thẻ là một đặc quyền thưởng cho học sinh
(function (T) {
  'use strict';

  const ICONS = ['🦠', '🧫', '🪸', '🍄', '🌱', '🐛', '🦋', '🐟', '🐸', '🦎', '🐢', '🦖',
    '🦕', '🦅', '🦉', '🐺', '🦊', '🐘', '🦧', '🧬', '⚡', '🔥', '🛡️', '👑'];

  // Chỉ các loại thẻ đang dùng; loại đã xoá (archived) vẫn còn trong DB để lịch sử hiển thị được
  const list = () => T.db.query('SELECT * FROM cards WHERE archived = 0 ORDER BY sort_order, id');
  const get = id => T.db.get('SELECT * FROM cards WHERE id = ?', [id]);

  // expire_days = 0: thẻ không hết hạn
  function save(c) {
    const vals = [c.name, c.description, c.icon, c.image_data || null, Math.max(0, Math.trunc(c.expire_days) || 0)];
    if (c.id) {
      T.db.run('UPDATE cards SET name = ?, description = ?, icon = ?, image_data = ?, expire_days = ? WHERE id = ?',
        [...vals, c.id]);
      return c.id;
    }
    const order = T.db.scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cards');
    return T.db.insert(
      'INSERT INTO cards (name, description, icon, image_data, expire_days, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [...vals, order]);
  }

  // Xoá loại thẻ: các lá học sinh đang giữ bị thu lại nhưng vẫn tính là đã lật (không ai được lật thêm),
  // lịch sử giữ nguyên. Loại thẻ chưa từng được phát thì xoá hẳn.
  function remove(id) {
    const c = get(id);
    if (!c) return;
    T.db.tx(() => {
      T.audit.log('card.delete', `Xoá loại ${named(c.name)}` + (holders(id) ? ` (thu lại ${holders(id)} lá đang giữ)` : ''),
        { id, name: c.name });
      if (!T.db.scalar('SELECT 1 FROM student_cards WHERE card_id = ? LIMIT 1', [id])) {
        T.db.run('DELETE FROM cards WHERE id = ?', [id]);
        return;
      }
      T.db.run("UPDATE student_cards SET status = 'removed', used_at = ? WHERE card_id = ? AND status = 'held'", [Date.now(), id]);
      T.db.run('UPDATE cards SET archived = 1 WHERE id = ?', [id]);
    });
  }

  const holders = id => T.db.scalar("SELECT COUNT(*) FROM student_cards WHERE card_id = ? AND status = 'held'", [id]);

  // "thẻ X" cho câu văn, không lặp chữ khi tên đã bắt đầu bằng "Thẻ" (Thẻ Tế Bào…)
  const named = name => (/^thẻ(\s|$)/i.test(name || '') ? name : `thẻ ${name}`);

  const expiryLabel = c => (c.expire_days > 0 ? `⏳ Hạn ${c.expire_days} ngày` : '∞ Không hết hạn');

  T.cards = { ICONS, list, get, save, remove, holders, named, expiryLabel };
})(window.TSTB);
