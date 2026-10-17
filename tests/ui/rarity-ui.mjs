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

console.log('▸ Màn Thẻ tiến hoá');
await go('the-bai');
check('chỉ hiện nhóm có thẻ (R, SR)', await count('[data-rarity-group]') === 2 && await count('[data-rarity-group=SR] .pcard--sr') === 1);

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
