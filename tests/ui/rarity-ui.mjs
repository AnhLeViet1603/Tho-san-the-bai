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
check('thẻ mẫu đều là R', await count('[data-rarity-group=R] .pcard') === 5 && await count('.pcard--sr, .pcard--ssr') === 0);

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

console.log('▸ Màn Thẻ tiến hoá');
await go('the-bai');
check('hiện nhóm có thẻ', await count('[data-rarity-group]') === 3 && await count('[data-rarity-group=SR] .pcard--sr') === 1);

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
