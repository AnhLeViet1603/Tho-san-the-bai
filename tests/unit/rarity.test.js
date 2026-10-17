// Edge case: chia lá úp theo tỉ lệ độ hiếm và bảo đảm theo từng học sinh
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, seedClass } = require('../helpers/app');

const WEEK = { year: 2026, month: 10, week: 2 };

// Bộ thẻ: nR thẻ R, nSR thẻ SR, nSSR thẻ SSR (bỏ thẻ mẫu)
function deck(T, nR, nSR, nSSR) {
  T.db.run('DELETE FROM cards');
  const add = (r, n) => Array.from({ length: n }, (_, i) =>
    T.cards.save({ name: `${r}${i + 1}`, description: '', icon: '🃏', expire_days: 0, rarity: r }));
  add('R', nR); add('SR', nSR); add('SSR', nSSR);
}

// Cho học sinh nhận một lá cấp `r` rồi dùng luôn (để loại đó lật lại được)
function give(T, sid, r) {
  const card = T.cards.list().find(c => c.rarity === r);
  T.evolutions.grant(sid, card, WEEK);
  T.evolutions.use(T.evolutions.heldBy(sid).pop().grant_id, null);
}

// Bộ sinh số ngẫu nhiên cố định để kết quả lặp lại được
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const levels = picks => [...new Set(picks.map(c => c.rarity))].sort();

test('tỉ lệ mặc định 70 / 25 / 5; mốc cắt sai được ép về hợp lệ', async () => {
  const { T } = await boot();
  assert.deepEqual(T.rarity.weights(), { R: 70, SR: 25, SSR: 5 });
  T.settings.set('rarity_cut_sr', 80);
  T.settings.set('rarity_cut_ssr', 60);
  assert.deepEqual(T.rarity.weights(), { R: 80, SR: 0, SSR: 20 }, 'mốc SSR không được nhỏ hơn mốc SR');
  T.settings.set('rarity_cut_sr', -5);
  T.settings.set('rarity_cut_ssr', 150);
  assert.deepEqual(T.rarity.weights(), { R: 0, SR: 100, SSR: 0 });
});

test('roll không bảo đảm khớp tỉ lệ (10 000 lần, sai số < 2%)', async () => {
  const { T } = await boot();
  const rand = seeded(42);
  const n = 10000;
  const hit = { R: 0, SR: 0, SSR: 0 };
  for (let i = 0; i < n; i++) hit[T.rarity.roll(rand)]++;
  const w = T.rarity.weights();
  for (const r of ['R', 'SR', 'SSR']) assert.ok(Math.abs(hit[r] / n * 100 - w[r]) < 2, `${r}: ${hit[r]}`);
});

test('4 lá R liên tiếp → mọi lá của lượt sau là SR; được SR thì bộ đếm R về 0', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 6, 3, 3);
  T.settings.set('rarity_cut_sr', 100); // không bảo đảm thì toàn R
  for (let i = 0; i < T.rarity.PITY_SR - 1; i++) give(T, sid, 'R');
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['R'], 'chưa đủ mốc');
  give(T, sid, 'R');
  assert.equal(T.rarity.pityState(sid).rStreak, 4);
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['SR']);
  give(T, sid, 'SR');
  assert.equal(T.rarity.pityState(sid).rStreak, 0);
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['R']);
});

test('12 lượt không SSR → mọi lá là SSR; được SSR thì bộ đếm về 0; trùng hạn với SR thì SSR thắng', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 6, 3, 3);
  T.settings.set('rarity_cut_sr', 100);
  // 8 R xen SR để không kích hoạt bảo đảm SR quá sớm: R R R SR × 3 = 12 lượt không SSR, kết thúc bằng 0 R
  for (let i = 0; i < 3; i++) { give(T, sid, 'R'); give(T, sid, 'R'); give(T, sid, 'R'); give(T, sid, 'SR'); }
  assert.deepEqual(T.rarity.pityState(sid), { rStreak: 0, noSsr: 12 });
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['SSR']);
  give(T, sid, 'SSR');
  assert.equal(T.rarity.pityState(sid).noSsr, 0);
  assert.equal(T.rarity.pityState(sid).rStreak, 0);
  // 12 lượt: 8 lần (R, R, R, SR) không đủ, dựng chuỗi kết thúc bằng 4 R
  for (let i = 0; i < 2; i++) { give(T, sid, 'R'); give(T, sid, 'R'); give(T, sid, 'R'); give(T, sid, 'SR'); }
  for (let i = 0; i < 4; i++) give(T, sid, 'R');
  assert.deepEqual(T.rarity.pityState(sid), { rStreak: 4, noSsr: 12 });
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['SSR'], 'cả hai cùng đến hạn: SSR thắng');
});

test('cấp được roll không có thẻ: hạ xuống cấp dưới, không có thì nâng lên', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 3, 0, 2);
  T.settings.set('rarity_cut_sr', 0);
  T.settings.set('rarity_cut_ssr', 100); // toàn SR, mà không có thẻ SR
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['R']);
  deck(T, 0, 0, 2);
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['SSR']);
});

test('bảo đảm không thực hiện được (chưa có thẻ cấp đó): bỏ qua, bộ đếm giữ nguyên để lượt sau thử lại', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 6, 0, 0);
  T.settings.set('rarity_cut_sr', 100);
  for (let i = 0; i < 6; i++) give(T, sid, 'R');
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['R']);
  assert.equal(T.rarity.pityState(sid).rStreak, 6);
  T.cards.save({ name: 'SR mới', description: '', icon: '🃏', expire_days: 0, rarity: 'SR' });
  assert.deepEqual(levels(T.rarity.deal(sid, 3)), ['SR']);
});

test('lá bị xoá kiểu trả lại lượt (revoked) không tính vào bảo đảm', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 6, 2, 2);
  for (let i = 0; i < 4; i++) give(T, sid, 'R');
  const last = T.db.scalar('SELECT MAX(id) FROM student_cards WHERE student_id = ?', [sid]);
  T.evolutions.revoke(last);
  assert.equal(T.rarity.pityState(sid).rStreak, 3);
});

test('chỉ có 2 thẻ SSR mà chia 5 lá SSR: đủ 5 lá, mỗi loại xuất hiện ít nhất một lần', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 6, 2, 2);
  T.settings.set('rarity_cut_sr', 0);
  T.settings.set('rarity_cut_ssr', 0);
  const picks = T.rarity.deal(sid, 5);
  assert.equal(picks.length, 5);
  assert.deepEqual(levels(picks), ['SSR']);
  assert.equal(new Set(picks.map(c => c.id)).size, 2);
});

test('6 thẻ R chia 5 lá: không trùng loại; đang giữ hết mọi loại thì không có lá nào', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 6, 0, 0);
  const picks = T.rarity.deal(sid, 5);
  assert.equal(picks.length, 5);
  assert.equal(new Set(picks.map(c => c.id)).size, 5);
  T.cards.list().forEach(c => T.evolutions.grant(sid, c, WEEK));
  assert.deepEqual(T.rarity.deal(sid, 5), []);
});

test('mô phỏng 1 000 lượt: không bao giờ 5 R liền, không bao giờ 13 lượt liền không SSR', async () => {
  const { T } = await boot();
  const { ids: [sid] } = seedClass(T);
  deck(T, 3, 3, 3);
  const rand = seeded(7);
  let rRun = 0;
  let noSsr = 0;
  let maxR = 0;
  let maxNoSsr = 0;
  const seen = { R: 0, SR: 0, SSR: 0 };
  for (let i = 0; i < 1000; i++) {
    const picks = T.rarity.deal(sid, 3, rand);
    const card = picks[Math.floor(rand() * picks.length)];
    T.evolutions.grant(sid, card, WEEK);
    T.evolutions.use(T.evolutions.heldBy(sid).pop().grant_id, null);
    seen[card.rarity]++;
    rRun = card.rarity === 'R' ? rRun + 1 : 0;
    noSsr = card.rarity === 'SSR' ? 0 : noSsr + 1;
    maxR = Math.max(maxR, rRun);
    maxNoSsr = Math.max(maxNoSsr, noSsr);
  }
  assert.ok(maxR <= T.rarity.PITY_SR, `chuỗi R dài nhất ${maxR}`);
  assert.ok(maxNoSsr <= T.rarity.PITY_SSR, `chuỗi không SSR dài nhất ${maxNoSsr}`);
  assert.ok(seen.R > seen.SR && seen.SR > seen.SSR, JSON.stringify(seen));
});
