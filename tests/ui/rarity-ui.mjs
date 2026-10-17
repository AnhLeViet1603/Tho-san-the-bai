// Test độ hiếm thẻ R / SR / SSR trên trình duyệt thật: thêm thẻ theo cấp, đổi cấp chuyển nhóm.
// Chạy:  node tests/ui/rarity-ui.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, sleep } from './driver.mjs';

const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const b = await launch('rarity');
const { send, ev, waitFor, check, shot } = b;
const q = JSON.stringify;

const go = async route => { await ev(`location.hash = '#/${route}'`); await sleep(350); };
const click = async sel => { await ev(`document.querySelector(${q(sel)}).click()`); await sleep(250); };
const count = sel => ev(`document.querySelectorAll(${q(sel)}).length`);
const setField = (name, value) => ev(`(() => { const e = [...document.querySelectorAll('.modal-wrap')].pop()
  .querySelector('[name=${name}]'); e.value = ${q(String(value))}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const formOk = async () => {
  await ev("[...document.querySelectorAll('.modal-wrap')].pop().querySelector('footer .btn:last-child').click()");
  await sleep(300);
};
const inGroup = (r, name) => ev(`[...document.querySelectorAll('[data-rarity-group=${r}] .pcard b')].some(b => b.innerText === ${q(name)})`);

await send('Page.navigate', { url: APP });
check('ứng dụng mở được', await waitFor("!document.getElementById('app').hidden"));
await waitFor("!!document.querySelector('.welcome-modal')", 3000);
await ev("document.querySelector('.welcome-modal [data-x]').click()"); // hồ sơ trình duyệt mới: đóng hộp chào

console.log('▸ Cài đặt → Thẻ tiến hoá: nhóm theo độ hiếm');
await go('cai-dat');
await click('[data-tab="cards"]');
check('3 nhóm R / SR / SSR', await count('[data-rarity-group]') === 3);
check('bộ thẻ mẫu 5 R · 4 SR · 3 SSR', await count('[data-rarity-group=R] .pcard--r') === 5
  && await count('[data-rarity-group=SR] .pcard--sr') === 4 && await count('[data-rarity-group=SSR] .pcard--ssr') === 3);
// Bỏ thẻ SR / SSR mẫu (xoá vĩnh viễn) để các bước sau bắt đầu từ nhóm SR, SSR trống
await ev(`TSTB.cards.list().filter(c => c.rarity !== 'R').forEach(c => { TSTB.cards.remove(c.id); TSTB.cards.purge(c.id); })`);
await go('rung');
await go('cai-dat');
await click('[data-tab="cards"]');
check('chỉ còn 5 thẻ R', await count('.pcard') === 5 && await count('.pcard--sr, .pcard--ssr') === 0);

for (const [r, name] of [['R', 'Thẻ Rêu'], ['SR', 'Thẻ Phượng'], ['SSR', 'Thẻ Rồng']]) {
  await click(`[data-act="add"][data-rarity="${r}"]`);
  check(`nút "Thêm thẻ ${r}" chọn sẵn độ hiếm ${r}`,
    await ev("[...document.querySelectorAll('.modal-wrap')].pop().querySelector('[name=rarity]').value") === r);
  await setField('name', name);
  await formOk();
  check(`thêm thẻ ${r}: nằm trong nhóm ${r}`, await inGroup(r, name));
}
check('khung SSR riêng + huy hiệu', await count('[data-rarity-group=SSR] .pcard--ssr .rbadge--ssr') === 1);
await shot('nhom-do-hiem');

console.log('▸ Đổi độ hiếm chuyển nhóm');
await ev(`[...document.querySelectorAll('[data-rarity-group=SSR] .pcard')].find(c => c.innerText.includes('Thẻ Rồng'))
  .querySelector('[data-act=edit]').click()`);
await sleep(250);
await setField('rarity', 'R');
await formOk();
check('sửa SSR → R: chuyển sang nhóm R', await inGroup('R', 'Thẻ Rồng') && !(await inGroup('SSR', 'Thẻ Rồng')));
check('nhóm trống hiện thông báo', /Chưa có thẻ SSR/.test(await ev("document.querySelector('[data-rarity-group=SSR]').innerText")));

console.log('▸ Slider tỉ lệ');
const knob = (k, v) => ev(`(() => { const e = document.querySelector('#rarityForm [data-knob=${k}]');
  e.value = ${v}; e.dispatchEvent(new Event('input', { bubbles: true })); return Number(e.value); })()`);
const label = async () => (await ev("document.querySelector('#rarityLabel').innerText")).replace(/\s+/g, ' ');
await go('cai-dat');
await click('[data-tab="cards"]');
check('mặc định R 70% · SR 25% · SSR 5%', /R 70%.*SR 25%.*SSR 5%/s.test(await label()), await label());
check('chưa có thẻ SSR → cảnh báo', /Chưa có thẻ SSR/.test(await label()));
await knob('a', 50);
check('kéo núm 1 → nhãn đổi', /R 50%.*SR 45%/s.test(await label()), await label());
check('núm 1 không vượt núm 2', await knob('a', 99) === 95);
check('núm 2 không vượt núm 1', await knob('b', 10) === 95);
await knob('a', 60);
await knob('b', 80);
await click('#rarityForm button.btn:not(.ghost)');
check('Lưu → setting đổi', await ev("TSTB.rarity.cuts().sr === 60 && TSTB.rarity.cuts().ssr === 80"));
check('ghi nhật ký tỉ lệ', await ev("TSTB.db.scalar(\"SELECT COUNT(*) FROM audit_log WHERE action = 'settings.rarity'\")") === 1);
await ev('location.reload()');
await sleep(1200);
await waitFor("!document.getElementById('app').hidden");
await go('cai-dat');
await click('[data-tab="cards"]');
check('tải lại trang vẫn giữ tỉ lệ', /R 60%.*SR 20%.*SSR 20%/s.test(await label()), await label());
await click('#rarityDefault');
check('nút Mặc định đưa về 70/25/5', /R 70%.*SR 25%.*SSR 5%/s.test(await label()));
await ev("document.querySelector('#rarityForm').scrollIntoView({ block: 'center' })");
await shot('slider');

console.log('▸ SSR = 100%');
await click('[data-act="add"][data-rarity="SSR"]');
await setField('name', 'Thẻ Kỳ Lân');
await formOk();
await knob('a', 0);
await knob('b', 0);
check('đặt SSR 100% → nhãn', /SSR 100%/.test(await label()));
await click('#rarityForm button.btn:not(.ghost)');
check('mọi lượt lật đều ra SSR', await ev(`(() => {
  const T = TSTB;
  const cid = T.classes.save({ name: '10A1', icon: '🧬', color: '#5fe08a', note: '' });
  T.students.bulkAdd(cid, ['An']);
  const sid = T.students.list(cid)[0].id;
  for (let i = 0; i < 30; i++) if (T.rarity.deal(sid, 3).some(c => c.rarity !== 'SSR')) return false;
  return true;
})()`));

console.log('▸ Màn lật thẻ: lá úp không lộ gì');
// Tỉ lệ 34 / 33 / 33 để 3 lá thường khác cấp nhau; An (lớp 10A1 vừa tạo) được 150 ATP = 3 lượt lật
await ev(`(() => {
  const T = TSTB;
  T.settings.set('rarity_cut_sr', 34); T.settings.set('rarity_cut_ssr', 67);
  const sid = T.db.scalar("SELECT id FROM students WHERE name = 'An'");
  T.store.set({ classId: T.db.scalar('SELECT class_id FROM students WHERE id = ?', [sid]) });
  T.atp.award([sid], T.lessons.current().id, 'manual', { amount: 150 });
  T.evolve.open({ id: sid, name: 'An' });
})()`);
await sleep(700);
const names = await ev("TSTB.cards.list().map(c => c.name)");
const flips = await ev(`[...document.querySelectorAll('.evo .flip')].map(f => f.outerHTML
  .replace(/ data-i="\\d+"/, '').replace(/--delay:\\d+ms/, '').replace(/aria-label="[^"]*"/, ''))`);
check('3 lá úp', flips.length === 3);
check('outerHTML 3 lá úp giống hệt nhau', flips.every(h => h === flips[0]), flips[0]);
const evoHtml = await ev("document.querySelector('.evo').outerHTML");
check('DOM không có mặt trước, tên hay độ hiếm thẻ', await count('.evo .flip-front, .evo .pcard, .evo [data-card], .evo [class*=rarity]') === 0
  && !names.some(n => evoHtml.includes(n)) && !/\b(SSR|SR)\b|rbadge/.test(evoHtml));
await click('.evo .flip');
const grant = await ev("TSTB.db.get('SELECT rarity, card_id FROM student_cards ORDER BY id DESC LIMIT 1')");
const cls = 'rarity-' + grant.rarity.toLowerCase();
check('sau khi chọn: chỉ 1 mặt trước, của đúng lá đã nhận', await count('.evo .flip-front') === 1
  && await count(`.flip.picked .pcard[data-card="${grant.card_id}"]`) === 1);
check('class cấp đúng trên .evo và .flip.picked', await count(`.evo.${cls} .flip.picked.${cls}`) === 1, cls);
check('các lá không chọn vẫn úp và mờ', await count('.flip.dim') === 2 && await count('.flip.dim .flip-front') === 0);
await sleep(2200);
check('hiện kết quả', await ev("!document.querySelector('.evo-result').hidden"));
await shot('lat-' + grant.rarity);
await click('.evo-result [data-close]');

console.log('▸ Lật SSR');
// Dùng hết lá đang giữ để thẻ SSR duy nhất chắc chắn lật được
await ev(`(() => { const T = TSTB; T.settings.set('rarity_cut_sr', 0); T.settings.set('rarity_cut_ssr', 0);
  const sid = T.db.scalar("SELECT id FROM students WHERE name = 'An'");
  T.evolutions.heldBy(sid).forEach(c => T.evolutions.use(c.grant_id, null));
  T.evolve.open({ id: sid, name: 'An' }); })()`);
await sleep(700);
// Lấy mẫu từng khung hình: mặt đang hướng ra (dấu cos góc lật = m11) và góc rung (thuộc tính rotate)
const frames = await ev(`new Promise(res => {
  const el = document.querySelector('.evo .flip');
  el.click();
  const inner = el.querySelector('.flip-inner');
  const out = []; const t0 = performance.now();
  (function tick() {
    const cs = getComputedStyle(inner);
    out.push({ t: performance.now() - t0, back: new DOMMatrix(cs.transform).m11 >= 0, rotate: cs.rotate,
      hidden: document.querySelector('.evo-result').hidden });
    if (performance.now() - t0 < 2300) requestAnimationFrame(tick); else res(out);
  })();
})`);
check('SSR: class rarity-ssr', await count('.evo.rarity-ssr .flip.picked.rarity-ssr') === 1);
const flipsAt = frames.filter((f, i) => i && f.back !== frames[i - 1].back).map(f => Math.round(f.t));
check('SSR: lật đúng 1 lần, không nháy giữa mặt úp và mặt ngửa', flipsAt.length === 1 && !frames.at(-1).back, flipsAt);
check('SSR: thẻ rung trước khi lật', frames.some(f => f.back && f.rotate !== 'none' && f.rotate !== '0deg'));
check('SSR: kết quả chưa hiện trước ~1,8 giây (hiệu ứng dài hơn R)', frames.filter(f => f.t < 1800).every(f => f.hidden));
check('SSR: kết quả hiện sau ~2 giây', await ev("!document.querySelector('.evo-result').hidden"));
await shot('lat-SSR-xong');
await click('.evo-result [data-close]');

console.log('▸ Màn Thẻ tiến hoá');
await go('the-bai');
check('hiện nhóm có thẻ', await count('[data-rarity-group]') === 3 && await count('[data-rarity-group=SR] .pcard--sr') === 1);

console.log('▸ Badge thẻ học sinh ở màn hẹp');
await ev(`(() => {
  const T = TSTB;
  const sid = T.db.scalar("SELECT id FROM students WHERE name = 'An'");
  T.store.set({ classId: T.db.scalar('SELECT class_id FROM students WHERE id = ?', [sid]) });
  const w = { year: T.store.state.year, month: T.store.state.month, week: T.store.state.week };
  T.cards.list().forEach(c => T.evolutions.grant(sid, c, w));
})()`);
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await go('rung');
await go('the-bai');
const chips = await ev(`(() => {
  const r = [...document.querySelectorAll('table.pick .held-chips .chip')].map(c => c.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
    if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) n++;
  return { n: r.length, overlaps: n };
})()`);
check('màn 390px: các badge thẻ không đè lên nhau', chips.n >= 5 && chips.overlaps === 0, chips);
await ev("document.querySelector('table.pick').scrollIntoView({ block: 'start' })");
await shot('badge-mobile');
await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
