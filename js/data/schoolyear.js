// Năm học: ATP và lượt lật thẻ chỉ tính trong khoảng [ngày bắt đầu, ngày kết thúc] (UTC+7)
(function (T) {
  'use strict';

  const read = () => ({ start: T.settings.get('school_start'), end: T.settings.get('school_end') });

  // Luôn trả về năm học hợp lệ: tự đặt mặc định 05/09 – 31/05 nếu chưa cấu hình
  // (ví dụ ngay sau khi xoá toàn bộ dữ liệu hoặc nhập một bản sao lưu cũ)
  function get() {
    const cur = read();
    if (cur.start && cur.end) return cur;
    const p = T.time.parts();
    const y = p.month >= 6 ? p.year : p.year - 1;
    set(`${y}-09-05`, `${y + 1}-05-31`);
    return read();
  }

  function set(start, end) {
    T.db.tx(() => {
      T.settings.set('school_start', start);
      T.settings.set('school_end', end);
    });
  }

  // Khi đã qua ngày kết thúc: tự chuyển sang năm học kế tiếp (điểm tính lại từ 0)
  function roll() {
    let { start, end } = get();
    const today = T.time.today();
    let n = 0;
    while (today > end && n < 100) {
      start = T.time.addYears(start, 1);
      end = T.time.addYears(end, 1);
      n++;
    }
    if (n) set(start, end);
    return n > 0;
  }

  // Gọi mỗi lần vẽ màn hình; trả về true nếu vừa sang năm học mới
  function ensure() {
    const fresh = !read().start || !read().end;
    get();
    return fresh ? false : roll();
  }

  function range() {
    const { start, end } = get();
    const startMs = T.time.dayStart(start);
    const endMs = T.time.dayStart(end) + T.time.DAY; // hết ngày kết thúc
    const ys = start.slice(0, 4);
    const ye = end.slice(0, 4);
    return {
      start, end, startMs, endMs,
      label: ys === ye ? ys : `${ys}–${ye}`
    };
  }

  T.schoolYear = { get, set, ensure, range };
})(window.TSTB);
