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

  // Xoá loại thẻ = chuyển vào thùng rác: các lá học sinh đang giữ bị thu lại nhưng vẫn tính là đã lật
  // (không ai được lật bù), lịch sử giữ nguyên. Khôi phục được bằng restore().
  function remove(id) {
    const c = get(id);
    if (!c || c.archived) return;
    const now = Date.now();
    T.db.tx(() => {
      T.audit.log('card.delete', `Xoá loại ${named(c.name)}` + (holders(id) ? ` (thu lại ${holders(id)} lá đang giữ)` : ''),
        { id, name: c.name });
      T.db.run("UPDATE student_cards SET status = 'removed', used_at = ? WHERE card_id = ? AND status = 'held'", [now, id]);
      T.db.run('UPDATE cards SET archived = 1, archived_at = ? WHERE id = ?', [now, id]);
    });
  }

  // Loại thẻ trong thùng rác, mới xoá trước. issued: số lá từng phát; returnable: số lá bị thu lúc xoá (sẽ trả lại khi khôi phục)
  const trash = () => T.db.query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM student_cards v WHERE v.card_id = c.id) AS issued,
      (SELECT COUNT(*) FROM student_cards v WHERE v.card_id = c.id AND v.status = 'removed' AND v.used_at = c.archived_at) AS returnable
    FROM cards c WHERE c.archived = 1 ORDER BY c.archived_at DESC, c.id DESC`);

  // Đưa loại thẻ về bộ thẻ (cuối danh sách) và trả lại các lá bị thu lúc xoá. Trả về số lá đã trả.
  function restore(id) {
    const c = get(id);
    if (!c || !c.archived) return 0;
    const back = "card_id = ? AND status = 'removed' AND used_at = ?";
    const n = T.db.scalar(`SELECT COUNT(*) FROM student_cards WHERE ${back}`, [id, c.archived_at]);
    T.db.tx(() => {
      T.audit.log('card.restore', `Khôi phục loại ${named(c.name)}` + (n ? ` (trả lại ${n} lá)` : ''), { id, name: c.name });
      T.db.run(`UPDATE student_cards SET status = 'held', used_at = NULL WHERE ${back}`, [id, c.archived_at]);
      const order = T.db.scalar('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cards WHERE archived = 0');
      T.db.run('UPDATE cards SET archived = 0, archived_at = NULL, sort_order = ? WHERE id = ?', [order, id]);
    });
    return n;
  }

  // Xoá hẳn một loại thẻ trong thùng rác — chỉ khi chưa từng phát cho ai (xoá loại đã phát làm sai số lượt lật)
  function purge(id) {
    const c = get(id);
    if (!c || !c.archived) return false;
    if (T.db.scalar('SELECT 1 FROM student_cards WHERE card_id = ? LIMIT 1', [id])) return false;
    T.db.tx(() => {
      T.audit.log('card.purge', `Xoá vĩnh viễn loại ${named(c.name)}`, { card: c });
      T.db.run('DELETE FROM cards WHERE id = ?', [id]);
    });
    return true;
  }

  const holders = id => T.db.scalar("SELECT COUNT(*) FROM student_cards WHERE card_id = ? AND status = 'held'", [id]);

  // "thẻ X" cho câu văn, không lặp chữ khi tên đã bắt đầu bằng "Thẻ" (Thẻ Tế Bào…)
  const named = name => (/^thẻ(\s|$)/i.test(name || '') ? name : `thẻ ${name}`);

  const expiryLabel = c => (c.expire_days > 0 ? `⏳ Hạn ${c.expire_days} ngày` : '∞ Không hết hạn');

  T.cards = { ICONS, list, get, save, remove, trash, restore, purge, holders, named, expiryLabel };
})(window.TSTB);
