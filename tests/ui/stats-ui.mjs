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
const cardsNote = () => text('#statsBody h3 small');

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
check('tab Thẻ: 1 biểu đồ', await count('.chart-box') === 1 && await count('canvas') === 1);
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

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
