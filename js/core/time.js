// Ngày giờ theo múi UTC+7 (giờ Việt Nam), không phụ thuộc múi giờ của máy
(function (T) {
  'use strict';

  const OFFSET = 7 * 3600000;
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');

  // Date có các trường UTC trùng với giờ UTC+7 của thời điểm `ms`
  const shifted = ms => new Date((ms == null ? Date.now() : ms) + OFFSET);

  // 'YYYY-MM-DD' theo UTC+7 của mốc `ms` (mặc định: bây giờ)
  const dateOf = ms => shifted(ms).toISOString().slice(0, 10);
  const today = () => dateOf();

  function parts(ms) {
    const d = shifted(ms);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  // Mốc 00:00 (UTC+7) của ngày 'YYYY-MM-DD', tính bằng ms
  const dayStart = dateStr => Date.parse(dateStr + 'T00:00:00+07:00');

  // Số thứ tự ngày theo UTC+7, dùng để đếm chênh lệch ngày
  const dayIndex = ms => Math.floor((ms + OFFSET) / DAY);

  // ms -> 'YYYY-MM-DD HH:MM:SS' (UTC), cùng định dạng CURRENT_TIMESTAMP của SQLite
  const toSql = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

  // Hiển thị dd/mm/yyyy
  const fmtDate = dateStr => dateStr.split('-').reverse().join('/');
  const fmt = ms => fmtDate(dateOf(ms));

  function addYears(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    let dt = new Date(Date.UTC(y + n, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) dt = new Date(Date.UTC(y + n, m, 0)); // 29/02 -> 28/02
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  T.time = { DAY, today, dateOf, parts, dayStart, dayIndex, toSql, fmt, fmtDate, addYears };
})(window.TSTB);
