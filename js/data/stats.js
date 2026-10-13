// Truy vấn tổng hợp cho dashboard
(function (T) {
  'use strict';

  const FROM = `
    FROM atp_events e
    JOIN lessons l ON l.id = e.lesson_id
    JOIN students s ON s.id = e.student_id
    JOIN classes c ON c.id = e.class_id`;

  // filter: { classIds[], scope ('school' = năm học hiện tại), year, month, week, period, type, source, studentId }
  function where(f) {
    const w = [];
    const p = [];
    if (f.classIds && f.classIds.length) {
      w.push(`e.class_id IN (${f.classIds.map(() => '?').join(',')})`);
      p.push(...f.classIds);
    }
    ['year', 'month', 'week', 'period'].forEach(k => {
      if (f[k]) { w.push(`l.${k} = ?`); p.push(Number(f[k])); }
    });
    if (f.type) { w.push('e.type = ?'); p.push(f.type); }
    if (f.source === 'group') w.push('e.group_id IS NOT NULL');
    if (f.source === 'solo') w.push('e.group_id IS NULL');
    if (f.studentId) { w.push('e.student_id = ?'); p.push(Number(f.studentId)); }
    if (f.scope === 'school') {
      const r = T.schoolYear.range();
      w.push('e.created_at >= ? AND e.created_at < ?');
      p.push(r.startSql, r.endSql);
    }
    return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
  }

  function q(f, select, tail, extraJoin) {
    const w = where(f);
    return T.db.query(`${select} ${FROM} ${extraJoin || ''} ${w.sql} ${tail || ''}`, w.params);
  }

  const summary = f => q(f, `
    SELECT COALESCE(SUM(e.amount), 0) AS total,
      COALESCE(SUM(e.type = 'speak'), 0) AS speak,
      COALESCE(SUM(e.type = 'score_8_9'), 0) AS score_8_9,
      COALESCE(SUM(e.type = 'score_9_plus'), 0) AS score_9_plus,
      COUNT(DISTINCT e.student_id) AS students,
      COUNT(DISTINCT e.lesson_id) AS lessons`)[0];

  const byType = f => q(f, 'SELECT e.type AS key, SUM(e.amount) AS total', 'GROUP BY e.type ORDER BY total DESC');

  const byClass = f => q(f, "SELECT COALESCE(c.icon, '') || ' ' || c.name AS key, SUM(e.amount) AS total",
    'GROUP BY c.id ORDER BY c.sort_order, c.id');

  // unit: 'week' | 'month'
  const byTime = (f, unit) => unit === 'month'
    ? q(f, "SELECT 'T' || l.month || '/' || l.year AS key, SUM(e.amount) AS total",
      'GROUP BY l.year, l.month ORDER BY l.year, l.month')
    : q(f, "SELECT 'T' || l.month || ' · Tuần ' || l.week AS key, SUM(e.amount) AS total",
      'GROUP BY l.year, l.month, l.week ORDER BY l.year, l.month, l.week');

  const topStudents = (f, n) => q(f, 'SELECT s.name AS key, SUM(e.amount) AS total',
    `GROUP BY s.id ORDER BY total DESC LIMIT ${Number(n) || 10}`);

  const byGroup = f => q(f, "SELECT g.name || ' (' || c.name || ')' AS key, SUM(e.amount) AS total",
    'GROUP BY c.id, g.name ORDER BY total DESC LIMIT 12', 'JOIN groups g ON g.id = e.group_id');

  const ranking = f => q(f, `
    SELECT s.id, s.name, c.name AS class_name,
      SUM(e.type = 'speak') AS speak,
      SUM(e.type = 'score_8_9') AS score_8_9,
      SUM(e.type = 'score_9_plus') AS score_9_plus,
      SUM(e.amount) AS total,
      (SELECT COUNT(*) FROM student_cards v WHERE v.student_id = s.id AND v.status = 'held') AS cards`,
    'GROUP BY s.id ORDER BY total DESC, s.name');

  // Số lượt lật theo từng loại thẻ (lọc theo lớp, năm, học sinh)
  function evolution(f) {
    const w = ['1 = 1'];
    const p = [];
    if (f.classIds && f.classIds.length) {
      w.push(`s.class_id IN (${f.classIds.map(() => '?').join(',')})`);
      p.push(...f.classIds);
    }
    if (f.year) { w.push('v.year = ?'); p.push(Number(f.year)); }
    if (f.scope === 'school') {
      const r = T.schoolYear.range();
      w.push('v.granted_at >= ? AND v.granted_at < ?');
      p.push(r.startMs, r.endMs);
    }
    if (f.studentId) { w.push('v.student_id = ?'); p.push(Number(f.studentId)); }
    const rows = T.db.query(`
      SELECT k.name AS key, COUNT(*) AS total, SUM(v.status = 'used') AS used
      FROM student_cards v
      JOIN cards k ON k.id = v.card_id
      JOIN students s ON s.id = v.student_id
      WHERE ${w.join(' AND ')} GROUP BY k.id ORDER BY total DESC`, p);
    return {
      rows,
      flips: rows.reduce((a, r) => a + r.total, 0),
      used: rows.reduce((a, r) => a + r.used, 0)
    };
  }

  const years = () => T.db.query('SELECT DISTINCT year FROM lessons ORDER BY year').map(r => r.year);

  T.stats = { summary, byType, byClass, byTime, topStudents, byGroup, ranking, evolution, years };
})(window.TSTB);
