// Kiểm tra toàn vẹn dữ liệu: file SQLite hỏng, bản ghi mồ côi (trỏ tới học sinh / lớp / tiết / thẻ không còn),
// giá trị không hợp lệ. Bảng không có khoá ngoại nên các lỗi này chỉ phát hiện được bằng truy vấn.
(function (T) {
  'use strict';

  const STATUSES = ['held', 'used', 'expired', 'removed', 'revoked'];
  const inList = list => list.map(s => `'${s}'`).join(', ');
  const missing = (table, col) => `${col} NOT IN (SELECT id FROM ${table})`;

  // Mỗi mục: điều kiện tìm bản ghi lỗi và cách sửa. Thứ tự sửa: cha trước, con sau.
  const RULES = [
    { key: 'students', label: 'Học sinh thuộc lớp không còn tồn tại', table: 'students',
      where: missing('classes', 'class_id'), fix: 'delete' },
    { key: 'lessons', label: 'Tiết học thuộc lớp không còn tồn tại', table: 'lessons',
      where: missing('classes', 'class_id'), fix: 'delete' },
    { key: 'groups', label: 'Nhóm thuộc lớp / tiết không còn tồn tại', table: 'groups',
      where: `${missing('classes', 'class_id')} OR ${missing('lessons', 'lesson_id')}`, fix: 'delete' },
    { key: 'group_members', label: 'Thành viên nhóm trỏ tới nhóm / học sinh không còn', table: 'group_members',
      where: `${missing('groups', 'group_id')} OR ${missing('students', 'student_id')}`, fix: 'delete' },
    { key: 'atp_events', label: 'Lượt cộng ATP của học sinh / tiết / lớp không còn', table: 'atp_events',
      where: `${missing('students', 'student_id')} OR ${missing('lessons', 'lesson_id')} OR ${missing('classes', 'class_id')}`,
      fix: 'delete' },
    { key: 'atp_type', label: 'Lượt cộng ATP có loại không xác định', table: 'atp_events',
      where: () => `type NOT IN (${inList(Object.keys(T.atp.TYPES))})`, fix: "type = 'manual'" },
    { key: 'atp_amount', label: 'Lượt cộng ATP có số ATP không hợp lệ', table: 'atp_events',
      where: "typeof(amount) != 'integer'", fix: 'delete' },
    { key: 'atp_time', label: 'Lượt cộng ATP thiếu thời điểm ghi', table: 'atp_events',
      where: "typeof(created_ms) != 'integer'",
      fix: "created_ms = COALESCE(CAST(strftime('%s', created_at) AS INTEGER) * 1000, 0)" },
    { key: 'student_cards', label: 'Thẻ của học sinh / loại thẻ không còn tồn tại', table: 'student_cards',
      where: `${missing('students', 'student_id')} OR ${missing('cards', 'card_id')}`, fix: 'delete' },
    { key: 'card_status', label: 'Thẻ có trạng thái không xác định', table: 'student_cards',
      where: `status NOT IN (${inList(STATUSES)})`, fix: "status = 'removed'" }
  ];

  const whereOf = r => (typeof r.where === 'function' ? r.where() : r.where);

  // { ok, fileError, issues: [{ key, label, count }] } — fileError: kết quả PRAGMA integrity_check nếu khác 'ok'
  function check() {
    const res = T.db.query('PRAGMA integrity_check');
    const verdict = res.length ? Object.values(res[0])[0] : 'không đọc được';
    const fileError = verdict === 'ok' ? null : res.map(r => Object.values(r)[0]).join('; ');
    const issues = RULES.map(r => ({
      key: r.key, label: r.label, count: T.db.scalar(`SELECT COUNT(*) FROM ${r.table} WHERE ${whereOf(r)}`)
    })).filter(i => i.count > 0);
    return { ok: !fileError && !issues.length, fileError, issues };
  }

  // Sửa mọi lỗi sửa được (xoá bản ghi mồ côi, đưa giá trị lạ về mặc định). Chụp lại dữ liệu trước khi sửa;
  // chụp không được thì không sửa. Trả về số bản ghi đã sửa.
  async function repair() {
    await T.db.guard('before-repair');
    let fixed = 0;
    T.db.tx(() => {
      // Lặp vì xoá cha có thể làm lộ ra con mồ côi (ví dụ xoá nhóm → thành viên nhóm)
      for (let pass = 0; pass < 3; pass++) {
        let n = 0;
        RULES.forEach(r => {
          const where = whereOf(r);
          const count = T.db.scalar(`SELECT COUNT(*) FROM ${r.table} WHERE ${where}`);
          if (!count) return;
          T.db.run(r.fix === 'delete'
            ? `DELETE FROM ${r.table} WHERE ${where}`
            : `UPDATE ${r.table} SET ${r.fix} WHERE ${where}`);
          n += count;
        });
        fixed += n;
        if (!n) break;
      }
    });
    check();
    return fixed;
  }

  T.integrity = { check, repair };
})(window.TSTB);
