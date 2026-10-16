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
    T.db.query(`${SELECT} JOIN students s ON s.id = v.student_id AND s.archived_at IS NULL
      WHERE s.class_id = ? AND v.status = 'held' ORDER BY v.id`, [classId])
      .forEach(r => { (map[r.student_id] = map[r.student_id] || []).push(r); });
    return map;
  }

  const heldBy = studentId => T.db.query(`${SELECT} WHERE v.student_id = ? AND v.status = 'held' ORDER BY v.id`, [studentId]);

  // Số lượt đã lật trong năm học hiện tại (kể cả thẻ đã dùng / hết hạn / bị xoá không trả lượt;
  // trừ lá bị xoá kiểu "trả lại lượt lật" — status 'revoked')
  function flipsByClass(classId) {
    const r = T.schoolYear.range();
    const map = {};
    T.db.query(`
      SELECT v.student_id, COUNT(*) AS n FROM student_cards v JOIN students s ON s.id = v.student_id
      WHERE s.class_id = ? AND v.status != 'revoked' AND v.granted_at >= ? AND v.granted_at < ? GROUP BY v.student_id`,
      [classId, r.startMs, r.endMs]).forEach(row => { map[row.student_id] = row.n; });
    return map;
  }

  function flips(studentId) {
    const r = T.schoolYear.range();
    return T.db.scalar(`SELECT COUNT(*) FROM student_cards
      WHERE student_id = ? AND status != 'revoked' AND granted_at >= ? AND granted_at < ?`,
      [studentId, r.startMs, r.endMs]);
  }

  // Số lượt lật còn lại với tổng ATP của năm học và số lượt đã lật
  const pending = (total, done) => Math.max(0, Math.floor(total / threshold()) - (done || 0));

  // Các thẻ học sinh chưa giữ (mỗi loại tối đa 1 lá), bỏ loại đã xoá
  const available = studentId => T.db.query(`
    SELECT * FROM cards WHERE archived = 0 AND id NOT IN (
      SELECT card_id FROM student_cards WHERE student_id = ? AND status = 'held')
    ORDER BY sort_order, id`, [studentId]);

  const holds = (studentId, cardId) => !!T.db.scalar(
    "SELECT 1 FROM student_cards WHERE student_id = ? AND card_id = ? AND status = 'held'", [studentId, cardId]);

  // Hết hạn vào cuối ngày thứ N (UTC+7) kể từ hôm nay; null nếu thẻ không có hạn
  const expiryFor = card => (card.expire_days > 0
    ? T.time.dayStart(T.time.today()) + (card.expire_days + 1) * DAY - 1 : null);

  // when: { year, month, week } của tiết đang dạy. Trả về false nếu đã giữ thẻ này.
  function grant(studentId, card, when) {
    if (holds(studentId, card.id)) return false;
    T.db.run(`INSERT INTO student_cards (student_id, card_id, year, month, week, granted_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [studentId, card.id, when.year, when.month, when.week, Date.now(), expiryFor(card)]);
    return true;
  }

  // Lật thẻ thật sự (từ màn lật thẻ): kiểm tra lại mọi điều kiện ngay trong transaction, vì màn lật
  // có thể đã mở từ trước khi ATP bị hoàn tác, thẻ bị xoá hay em đã lật ở chỗ khác.
  // Trả về 'ok' | 'no-flip' (hết lượt) | 'held' (đang giữ loại này) | 'archived' (loại thẻ đã bị xoá)
  function flip(studentId, card, when) {
    return T.db.tx(() => {
      const fresh = T.cards.get(card.id);
      if (!fresh || fresh.archived) return 'archived';
      if (!pending(T.atp.totalFor(studentId), flips(studentId))) return 'no-flip';
      return grant(studentId, fresh, when) ? 'ok' : 'held';
    });
  }

  // ---------- Cân đối lượt lật: số lượt được hưởng theo ATP so với số thẻ đã lật ----------
  const allowed = (total, th) => Math.max(0, Math.floor(total / th));

  // [{ id, name, total, flips }] của mọi học sinh trong năm học hiện tại
  function balances() {
    const r = T.schoolYear.range();
    return T.db.query(`
      SELECT s.id, s.name,
        COALESCE((SELECT SUM(amount) FROM atp_events e
          WHERE e.student_id = s.id AND e.created_ms >= ? AND e.created_ms < ?), 0) AS total,
        (SELECT COUNT(*) FROM student_cards v
          WHERE v.student_id = s.id AND v.status != 'revoked' AND v.granted_at >= ? AND v.granted_at < ?) AS flips
      FROM students s WHERE s.archived_at IS NULL AND s.class_id IN (SELECT id FROM classes WHERE archived_at IS NULL)
      ORDER BY s.class_id, s.sort_order, s.id`, [r.startMs, r.endMs, r.startMs, r.endMs]);
  }

  // Đổi mốc ATP thì lượt lật cả năm được tính lại. Trả về:
  // more: số em có thêm lượt lật, extra: tổng số lượt thêm, over: số em thành ra đã lật nhiều hơn lượt được hưởng
  function thresholdImpact(next) {
    const cur = threshold();
    const th = Math.max(1, Math.trunc(next) || 1);
    const out = { more: 0, extra: 0, over: 0 };
    balances().forEach(b => {
      const before = Math.max(0, allowed(b.total, cur) - b.flips);
      const after = Math.max(0, allowed(b.total, th) - b.flips);
      if (after > before) { out.more++; out.extra += after - before; }
      if (b.flips <= allowed(b.total, cur) && b.flips > allowed(b.total, th)) out.over++;
    });
    return out;
  }

  // deltas: { studentId: thay đổi ATP trong năm học }. Trả về [{ id, name }] các em sẽ thành ra
  // đã lật nhiều thẻ hơn số lượt được hưởng (trước đó thì chưa).
  function overdrawnIf(deltas) {
    const ids = Object.keys(deltas).map(Number);
    if (!ids.length) return [];
    const th = threshold();
    return balances().filter(b => ids.includes(b.id) &&
      b.flips <= allowed(b.total, th) && b.flips > allowed(b.total + deltas[b.id], th))
      .map(b => ({ id: b.id, name: b.name }));
  }

  // Không được dùng thẻ ngay trong tuần nhận thẻ
  const sameWeek = (row, when) => row.year === when.year && row.month === when.month && row.week === when.week;

  // Ghi nhật ký cho một thao tác trên lá thẻ: "<việc> thẻ <tên thẻ> của <học sinh>"
  function logCard(action, verb, grantId, extra) {
    const r = T.db.get(`SELECT v.*, k.name AS card_name, s.name AS student_name FROM student_cards v
      LEFT JOIN cards k ON k.id = v.card_id LEFT JOIN students s ON s.id = v.student_id WHERE v.id = ?`, [grantId]);
    if (r) T.audit.log(action, `${verb} ${T.cards.named(r.card_name)} của ${r.student_name}${extra ? ' ' + extra : ''}`, { grant: r });
  }

  const use = (grantId, lessonId) => T.db.run(
    "UPDATE student_cards SET status = 'used', used_at = ?, lesson_id = ? WHERE id = ? AND status = 'held'",
    [Date.now(), lessonId || null, grantId]);

  // Vì sao không hoàn tác được lá này? null nếu được.
  // 'missing' | 'expired' | 'archived' (loại thẻ đang trong thùng rác) | 'held' (đang giữ lá cùng loại)
  // | 'no-flip' (lá "trả lại lượt lật" mà học sinh đã dùng lượt đó để lật thẻ khác)
  function restoreBlock(grantId) {
    const row = T.db.get('SELECT * FROM student_cards WHERE id = ?', [grantId]);
    if (!row || row.status === 'held') return 'missing';
    if (row.status === 'expired') return 'expired';
    const card = T.cards.get(row.card_id);
    if (!card || card.archived) return 'archived';
    if (holds(row.student_id, row.card_id)) return 'held';
    if (row.status === 'revoked' && !pending(T.atp.totalFor(row.student_id), flips(row.student_id))) return 'no-flip';
    return null;
  }

  // Hoàn tác một lần dùng nhầm hoặc xoá nhầm (lá trở về "đang giữ"); false nếu không được — lý do: restoreBlock()
  function unuse(grantId) {
    if (restoreBlock(grantId)) return false;
    const row = T.db.get('SELECT * FROM student_cards WHERE id = ?', [grantId]);
    const from = { used: '(đã dùng → đang giữ)', revoked: '(xoá có trả lượt → đang giữ)' }[row.status] || '(→ đang giữ)';
    T.db.tx(() => {
      logCard('card.unuse', 'Hoàn tác', grantId, from);
      T.db.run("UPDATE student_cards SET status = 'held', used_at = NULL, lesson_id = NULL WHERE id = ?", [grantId]);
    });
    return true;
  }

  // Thu hồi: lá không còn tính là đã lật (học sinh được lật lại) nhưng vẫn nằm trong lịch sử để hoàn tác
  const revoke = grantId => T.db.tx(() => {
    if (!T.db.scalar("SELECT 1 FROM student_cards WHERE id = ? AND status != 'revoked'", [grantId])) return;
    logCard('card.revoke', 'Xoá', grantId, '(trả lại lượt lật)');
    T.db.run("UPDATE student_cards SET status = 'revoked', used_at = ? WHERE id = ?", [Date.now(), grantId]);
  });

  // Giáo viên xoá thẻ nhưng không trả lại lượt lật; vẫn nằm trong lịch sử để hoàn tác
  const discard = grantId => T.db.tx(() => {
    if (!heldRow(grantId)) return;
    logCard('card.discard', 'Xoá', grantId, '(không trả lượt lật)');
    T.db.run("UPDATE student_cards SET status = 'removed', used_at = ? WHERE id = ? AND status = 'held'", [Date.now(), grantId]);
  });

  const heldRow = grantId => T.db.get("SELECT * FROM student_cards WHERE id = ? AND status = 'held'", [grantId]);

  // Sửa hạn một lá đang giữ: hết hạn vào cuối ngày `dateStr` (UTC+7); bỏ trống = không hết hạn.
  // Trả về false nếu ngày đã qua hoặc không hợp lệ.
  function setExpiry(grantId, dateStr) {
    let expires = null;
    if (dateStr) {
      expires = T.time.dayStart(dateStr) + DAY - 1;
      if (!(expires >= Date.now())) return false;
    }
    if (!heldRow(grantId)) return false;
    T.db.tx(() => {
      logCard('card.expiry', 'Sửa hạn', grantId, `thành ${expires ? T.time.fmt(expires) : 'không hết hạn'}`);
      T.db.run('UPDATE student_cards SET expires_at = ? WHERE id = ?', [expires, grantId]);
    });
    return true;
  }

  // Đổi một lá đang giữ sang loại thẻ khác: giữ nguyên lượt lật và tuần nhận, hạn tính lại
  // theo thẻ mới kể từ hôm nay. Trả về false nếu học sinh đã giữ loại thẻ đó.
  function swap(grantId, cardId) {
    const row = heldRow(grantId);
    const card = T.cards.get(cardId);
    if (!row || !card || card.archived || row.card_id === card.id || holds(row.student_id, card.id)) return false;
    T.db.tx(() => {
      logCard('card.swap', 'Đổi', grantId, `sang ${T.cards.named(card.name)}`);
      T.db.run('UPDATE student_cards SET card_id = ?, expires_at = ? WHERE id = ?', [card.id, expiryFor(card), grantId]);
    });
    return true;
  }

  const history = (classId, limit) => T.db.query(`
    SELECT h.*, s.name AS student_name FROM (${SELECT}) h JOIN students s ON s.id = h.student_id AND s.archived_at IS NULL
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
    grant, flip, sameWeek, use, unuse, restoreBlock, revoke, discard, setExpiry, swap, history, daysLeft, expiryText,
    balances, thresholdImpact, overdrawnIf
  };
})(window.TSTB);
