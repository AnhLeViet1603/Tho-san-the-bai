// Nhật ký thao tác: ghi lại các thao tác xoá / sửa / hoàn tác để tra lại khi có thắc mắc về điểm, thẻ.
// Không ghi từng lượt cộng ATP (đã có trong atp_events).
(function (T) {
  'use strict';

  const KEEP = 2000; // giữ tối đa chừng này dòng mới nhất

  // action: mã ngắn ('atp.undo', 'class.archive'…); summary: câu mô tả cho người đọc; data: chi tiết (JSON) để tra / khôi phục tay
  function log(action, summary, data) {
    T.db.run('INSERT INTO audit_log (at, action, summary, data) VALUES (?, ?, ?, ?)',
      [Date.now(), action, summary, data == null ? null : JSON.stringify(data)]);
    T.db.run('DELETE FROM audit_log WHERE id <= (SELECT MAX(id) FROM audit_log) - ?', [KEEP]);
  }

  // Mới nhất trước; data đã parse
  const list = (limit = 50) => T.db.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit])
    .map(r => Object.assign(r, { data: r.data ? JSON.parse(r.data) : null }));

  T.audit = { log, list, KEEP };
})(window.TSTB);
