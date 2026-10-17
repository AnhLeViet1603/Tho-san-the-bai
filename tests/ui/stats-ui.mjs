// Test tab con của màn Thống kê trên trình duyệt thật: đổi tab, bộ lọc dùng chung, số canvas, lọc thẻ theo tháng/tuần.
// Chạy:  node tests/ui/stats-ui.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, sleep } from './driver.mjs';

const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const b = await launch('stats');
const { send, ev, waitFor, check, shot } = b;
const q = JSON.stringify;

const go = async route => { await ev(`location.hash = '#/${route}'`); await sleep(350); };
const click = async sel => { await ev(`document.querySelector(${q(sel)}).click()`); await sleep(300); };
const count = sel => ev(`document.querySelectorAll(${q(sel)}).length`);
const text = sel => ev(`(document.querySelector(${q(sel)}) || {}).innerText || ''`);
const fill = async (sel, value) => {
  await ev(`(() => { const e = document.querySelector(${q(sel)}); e.value = ${q(String(value))};
    e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
};
const cardsNote = () => text('.chart:has(#cCards) h3 small');

await send('Page.navigate', { url: APP });
check('ứng dụng mở được', await waitFor("!document.getElementById('app').hidden"));
await waitFor("!!document.querySelector('.welcome-modal')", 3000);
await ev("document.querySelector('.welcome-modal [data-x]').click()"); // hồ sơ trình duyệt mới: đóng hộp chào

// Dữ liệu: 1 lớp, An có ATP, 3 lá thẻ: 2 lá tháng 10 (tuần 2, 3), 1 lá tháng 11 (tuần 2)
await ev(`(() => {
  const T = TSTB;
  const cid = T.classes.save({ name: '10A1', icon: '🧬', color: '#5fe08a', note: '' });
  T.students.bulkAdd(cid, ['An', 'Bình']);
  T.store.set({ classId: cid });
  const ids = T.students.list(cid).map(s => s.id);
  T.atp.award(ids, T.lessons.current().id, 'speak');
  const [a, b] = T.cards.list();
  const year = T.store.state.year;
  T.evolutions.grant(ids[0], a, { year, month: 10, week: 2 });
  T.evolutions.grant(ids[1], a, { year, month: 10, week: 3 });
  T.evolutions.grant(ids[0], b, { year, month: 11, week: 2 });
})()`);

await go('thong-ke');
check('3 tab con, mặc định Tổng quan', await count('.subtabs [data-sub]') === 3 && await text('.subtabs .on') === '📋 Tổng quan');
check('Tổng quan: không có canvas', await count('canvas') === 0);
check('Tổng quan: KPI thẻ đếm cả 3 lá', /3 \/ 0/.test(await text('#statsBody')));

await click('[data-sub="atp"]');
check('tab ATP: 6 khung biểu đồ, không quá 6 canvas', await count('.chart-box') === 6 && await count('canvas') <= 6, await count('canvas'));
check('tab ATP: có bộ lọc Loại/Nguồn/Tiết', await count('[data-f="type"], [data-f="source"], [data-f="period"]') === 3);

await click('[data-sub="cards"]');
check('tab Thẻ: 3 khung biểu đồ (theo loại, độ hiếm, độ hiếm theo lớp)', await count('.chart-box') === 3 && await count('canvas') === 3);
check('tab Thẻ: ẩn Loại/Nguồn/Tiết', await count('[data-f="type"], [data-f="source"], [data-f="period"]') === 0);
check('tab Thẻ: chưa lọc thì 3 lá', /3 lá/.test(await cardsNote()), await cardsNote());

await fill('[data-f="month"]', 10);
check('lọc tháng 10 → chỉ 2 lá', /2 lá/.test(await cardsNote()), await cardsNote());
await fill('[data-f="week"]', 3);
check('tháng 10 + tuần 3 → 1 lá', /1 lá/.test(await cardsNote()), await cardsNote());
await shot('the-loc-thang');

await click('[data-sub="overview"]');
check('đổi tab giữ nguyên bộ lọc', await ev("document.querySelector('[data-f=month]').value") === '10'
  && await ev("document.querySelector('[data-f=week]').value") === '3');
check('KPI thẻ ở Tổng quan cũng theo bộ lọc', /1 \/ 0/.test(await text('#statsBody')));

await click('[data-sub="cards"]');
await click('#resetFilter');
check('Xoá bộ lọc giữ nguyên tab Thẻ', await text('.subtabs .on') === '🃏 Thẻ' && /3 lá/.test(await cardsNote()));

console.log('▸ Độ hiếm');
// Lớp 11B2: phát 3 R, 2 SR, 1 SSR
const cls = await ev(`(() => {
  const T = TSTB;
  const cid = T.classes.save({ name: '11B2', icon: '🌿', color: '#5fe08a', note: '' });
  T.students.bulkAdd(cid, ['Hoa', 'Minh']);
  const [h, m] = T.students.list(cid).map(s => s.id);
  const mk = (name, rarity) => T.cards.get(T.cards.save({ name, description: '', icon: '🃏', expire_days: 0, rarity }));
  const w = { year: T.store.state.year, month: 10, week: 1 };
  const R = T.cards.list().filter(c => c.rarity === 'R');
  T.evolutions.grant(h, R[0], w); T.evolutions.grant(h, R[1], w); T.evolutions.grant(m, R[0], w);
  T.evolutions.grant(h, mk('Phượng', 'SR'), w); T.evolutions.grant(m, mk('Hạc', 'SR'), w);
  T.evolutions.grant(m, mk('Rồng', 'SSR'), w);
  return cid;
})()`);
await go('rung'); // rời rồi quay lại để tab Thống kê vẽ lại với lớp mới
await go('thong-ke');
await ev(`document.querySelector('[data-class="${cls}"]').click()`);
await sleep(300);
const kpis = await ev("[...document.querySelectorAll('.kpi b')].map(b => b.innerText)");
check('KPI SR / SSR đã phát: 2 / 1', /2$/.test(kpis[1]) && /1$/.test(kpis[2]), kpis);
const rows = await ev("[...document.querySelectorAll('.rarity-table tbody tr')].map(r => [...r.cells].slice(1).map(c => c.innerText).join('|'))");
check('bảng học sinh: R / SR / SSR / tổng', rows.includes('Hoa|11B2|2|1|0|3') && rows.includes('Minh|11B2|1|1|1|3'), rows);
const pie = await ev("Chart.getChart(document.querySelector('#cRarity canvas')).data.datasets[0].data");
check('biểu đồ tròn độ hiếm 3 / 2 / 1', pie.join() === '3,2,1', pie);
const bar = await ev("Chart.getChart(document.querySelector('#cRarityClass canvas')).data.datasets.map(d => d.data.join())");
check('cột chồng theo lớp 3 / 2 / 1', bar.join('|') === '3|2|1', bar);
await click('[data-card-sort="SSR"]');
check('sắp xếp bảng theo SSR', (await ev("document.querySelector('.rarity-table tbody tr td:nth-child(2)').innerText")) === 'Minh');
await ev("TSTB.cards.save(Object.assign({}, TSTB.cards.list().find(c => c.name === 'Phượng'), { rarity: 'R' }))");
await click('[data-sub="overview"]');
await click('[data-sub="cards"]');
const pie2 = await ev("Chart.getChart(document.querySelector('#cRarity canvas')).data.datasets[0].data");
check('đổi Phượng SR → R sau khi phát: số liệu cũ không đổi', pie2.join() === '3,2,1', pie2);
await shot('do-hiem');

console.log('▸ Nhãn tooltip');
const labels = await ev("['cCards', 'cRarity'].map(id => Chart.getChart(document.querySelector('#' + id + ' canvas')).data.datasets[0].label)");
check('biểu đồ thẻ ghi "Số lá" thay vì ATP', labels.every(l => l === 'Số lá'), labels);

console.log('▸ Bố cục lưới');
// Mỗi hàng của lưới biểu đồ phải lấp đủ bề ngang (không có ô trống)
const rowsFull = () => ev(`(() => {
  const grid = document.querySelector('.charts'), w = grid.getBoundingClientRect().width;
  const rows = {};
  grid.querySelectorAll(':scope > .chart').forEach(c => { const r = c.getBoundingClientRect(); (rows[Math.round(r.top)] = rows[Math.round(r.top)] || []).push(r); });
  return Object.values(rows).map(rs => Math.round(rs.at(-1).right - rs[0].left - w)).every(d => Math.abs(d) <= 2);
})()`);
for (const tab of ['atp', 'cards']) {
  await click(`[data-sub="${tab}"]`);
  check(`màn rộng, tab ${tab}: mọi hàng biểu đồ lấp đủ, không có ô trống`, await rowsFull());
}
const gap = await ev(`document.querySelector('.charts').getBoundingClientRect().top - document.querySelector('.kpis').getBoundingClientRect().bottom`);
check('tab Thẻ: hàng KPI cách lưới biểu đồ', gap >= 10, gap);

console.log('▸ Thu hẹp cửa sổ khi đang xem');
await click('#resetFilter'); // bỏ lọc lớp 11B2 (lớp này chưa có ATP) để tab ATP có biểu đồ
for (const tab of ['atp', 'cards']) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click(`[data-sub="${tab}"]`);
  await sleep(400);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  const m = await ev(`[...document.querySelectorAll('.chart-box')].filter(x => x.querySelector('canvas')).map(box => {
    const a = box.getBoundingClientRect(), c = box.querySelector('canvas').getBoundingClientRect();
    return { right: Math.round(a.right), off: Math.round(c.left + c.width / 2 - (a.left + a.width / 2)) };
  })`);
  check(`tab ${tab}: khung biểu đồ co theo màn 390px, biểu đồ nằm giữa`, m.length && m.every(x => x.right <= 390 && Math.abs(x.off) <= 2), m);
  check(`tab ${tab}: không cuộn ngang`, await ev('document.documentElement.scrollWidth <= innerWidth'));
}
await ev("document.querySelector('.chart').scrollIntoView({ block: 'start' })");
await shot('mobile-the');
await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
