// Độ hiếm khi lật thẻ: chia các lá úp theo tỉ lệ R / SR / SSR giáo viên đặt, kèm bảo đảm ẩn theo từng học sinh.
// Bảo đảm tính lại từ lịch sử student_cards (cột rarity là snapshot lúc phát) mỗi lần chia bài: không lưu trạng thái riêng.
(function (T) {
  'use strict';

  // Sau PITY_SR lá R liên tiếp → lượt sau mọi lá ≥ SR; sau PITY_SSR lượt liên tiếp không có SSR → mọi lá là SSR.
  // Cả hai cùng đến hạn thì SSR thắng.
  const PITY_SR = 4;
  const PITY_SSR = 12;
  const LEVELS = ['R', 'SR', 'SSR'];

  const clamp = v => Math.min(100, Math.max(0, Math.round(v)));

  // 2 mốc cắt trên thanh 0–100, luôn sr ≤ ssr
  function cuts() {
    const sr = clamp(T.settings.num('rarity_cut_sr', 70));
    const ssr = Math.max(sr, clamp(T.settings.num('rarity_cut_ssr', 95)));
    return { sr, ssr };
  }

  // Tỉ lệ phần trăm từng cấp
  function weights(c = cuts()) {
    return { R: c.sr, SR: c.ssr - c.sr, SSR: 100 - c.ssr };
  }

  function roll(rand = Math.random) {
    const c = cuts();
    const x = rand() * 100;
    return x < c.sr ? 'R' : x < c.ssr ? 'SR' : 'SSR';
  }

  // rStreak: số lá R liên tiếp gần nhất; noSsr: số lượt liên tiếp gần nhất không có SSR (trong năm học hiện tại)
  function pityState(studentId) {
    const r = T.schoolYear.range();
    const rows = T.db.query(`SELECT rarity FROM student_cards
      WHERE student_id = ? AND status != 'revoked' AND granted_at >= ? AND granted_at < ?
      ORDER BY granted_at DESC, id DESC`, [studentId, r.startMs, r.endMs]);
    const lead = test => { let n = 0; while (n < rows.length && test(rows[n].rarity || 'R')) n++; return n; };
    return { rStreak: lead(x => x === 'R'), noSsr: lead(x => x !== 'SSR') };
  }

  function shuffled(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Cấp được roll mà không còn thẻ: hạ xuống cấp liền dưới còn thẻ, không có thì nâng lên cấp gần nhất
  function fallback(level, pools) {
    const i = LEVELS.indexOf(level);
    for (let j = i; j >= 0; j--) if (pools[LEVELS[j]].length) return LEVELS[j];
    for (let j = i + 1; j < LEVELS.length; j++) if (pools[LEVELS[j]].length) return LEVELS[j];
    return null;
  }

  // Các lá úp cho một lượt lật: luôn đủ n lá (trừ khi không còn loại thẻ nào để lật).
  // Trong một lượt ưu tiên không trùng loại; cấp đã cạn loại thì cho trùng (học sinh chỉ nhận 1 lá).
  function deal(studentId, n, rand = Math.random) {
    const pools = { R: [], SR: [], SSR: [] };
    T.evolutions.available(studentId).forEach(c => pools[T.cards.rarityOf(c.rarity)].push(c));
    if (!LEVELS.some(l => pools[l].length)) return [];

    const s = pityState(studentId);
    let floor = null; // mọi lá trong lượt phải ≥ cấp này
    if (s.noSsr >= PITY_SSR && pools.SSR.length) floor = 'SSR';
    else if (s.rStreak >= PITY_SR && (pools.SR.length || pools.SSR.length)) floor = pools.SR.length ? 'SR' : 'SSR';

    const bags = { R: [], SR: [], SSR: [] };
    const draw = level => {
      if (!bags[level].length) bags[level] = shuffled(pools[level], rand);
      return bags[level].pop();
    };
    return Array.from({ length: Math.max(1, n) }, () => {
      let level = floor === 'SSR' ? 'SSR' : roll(rand);
      if (floor === 'SR' && level === 'R') level = 'SR';
      if (!pools[level].length) level = floor ? floor : fallback(level, pools);
      return draw(level);
    });
  }

  T.rarity = { LEVELS, PITY_SR, PITY_SSR, cuts, weights, roll, pityState, deal };
})(window.TSTB);
