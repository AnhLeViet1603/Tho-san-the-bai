// Bộ thẻ tiến hoá: mỗi thẻ là một đặc quyền thưởng cho học sinh
(function (T) {
  'use strict';

  const ICONS = ['🦠', '🧫', '🪸', '🍄', '🌱', '🐛', '🦋', '🐟', '🐸', '🦎', '🐢', '🦖',
    '🦕', '🦅', '🦉', '🐺', '🦊', '🐘', '🦧', '🧬', '⚡', '🔥', '🛡️', '👑'];

  const list = () => T.db.query('SELECT * FROM cards ORDER BY sort_order, id');
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

  // Xoá thẻ kéo theo mọi lá học sinh đang giữ và lịch sử của thẻ đó
  function remove(id) {
    T.db.tx(() => {
      T.db.run('DELETE FROM student_cards WHERE card_id = ?', [id]);
      T.db.run('DELETE FROM cards WHERE id = ?', [id]);
    });
  }

  const holders = id => T.db.scalar("SELECT COUNT(*) FROM student_cards WHERE card_id = ? AND status = 'held'", [id]);

  const expiryLabel = c => (c.expire_days > 0 ? `⏳ Hạn ${c.expire_days} ngày` : '∞ Không hết hạn');

  T.cards = { ICONS, list, get, save, remove, holders, expiryLabel };
})(window.TSTB);
