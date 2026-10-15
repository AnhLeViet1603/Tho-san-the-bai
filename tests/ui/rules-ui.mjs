// Test luật lượt lật trên trình duyệt thật: cảnh báo khi đổi mốc ATP, khi hoàn tác ATP đã dùng để lật thẻ,
// màn lật mở từ trước khi ATP bị hoàn tác, và xoá loại thẻ giữ lại lịch sử.
// Chạy:  node tests/ui/rules-ui.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, sleep } from './driver.mjs';

const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
const b = await launch('rules');
const { send, ev, waitFor, check, shot } = b;
const q = JSON.stringify;

const go = async route => { await ev(`location.hash = '#/${route}'`); await sleep(350); };
const click = sel => ev(`document.querySelector(${q(sel)}).click()`);
const text = sel => ev(`(document.querySelector(${q(sel)}) || {}).innerText || ''`);
const confirmText = () => text('.modal-wrap:last-of-type .confirm-msg');
const confirmOk = () => ev("[...document.querySelectorAll('.modal-wrap:last-of-type footer .btn')].pop().click()");
const confirmCancel = () => ev("document.querySelector('.modal-wrap:last-of-type footer .btn').click()");
const modals = () => ev("document.querySelectorAll('.modal-wrap').length");
const flips = id => ev(`TSTB.evolutions.flips(${id})`);
const total = id => ev(`TSTB.atp.totalFor(${id})`);

await send('Page.navigate', { url: APP });
check('ứng dụng mở được', await waitFor("!document.getElementById('app').hidden"));

// Dữ liệu: 1 lớp, An 50 ATP đã lật 1 thẻ, Bình 100 ATP chưa lật (mốc 50)
const [an, binh] = await ev(`(() => {
  const T = TSTB;
  const cid = T.classes.save({ name: '10A1', icon: '🧬', color: '#5fe08a', note: '' });
  T.students.bulkAdd(cid, ['An', 'Bình']);
  T.store.set({ classId: cid });
  const ids = T.students.list(cid).map(s => s.id);
  const lesson = T.lessons.current();
  T.atp.award([ids[0]], lesson.id, 'manual', { amount: 50 });
  T.atp.award([ids[1]], lesson.id, 'manual', { amount: 100 });
  const s = T.store.state;
  T.evolutions.flip(ids[0], T.cards.list()[0], { year: s.year, month: s.month, week: s.week });
  return ids;
})()`);
check('dựng dữ liệu: An đã lật 1 thẻ', await flips(an) === 1);

console.log('▸ Đổi mốc ATP');
await go('cai-dat');
await click('[data-tab="atp"]');
await sleep(200);
await ev("document.querySelector('[name=evolve_threshold]').value = 25");
await click('#atpForm button.btn');
await sleep(200);
const msg = await confirmText();
check('đổi mốc thì hỏi lại kèm ảnh hưởng', /từ 50 thành 25/.test(msg) && /2 học sinh có thêm tổng cộng 3 lượt/.test(msg), msg);
await shot('doi-moc');
await confirmCancel();
await sleep(200);
check('huỷ thì mốc giữ nguyên', await ev('TSTB.evolutions.threshold()') === 50);
await click('#atpForm button.btn');
await sleep(200);
await confirmOk();
await sleep(300);
check('đồng ý thì lưu mốc mới', await ev('TSTB.evolutions.threshold()') === 25);
await ev("TSTB.settings.set('evolve_threshold', 50)");
await go('cai-dat');
await click('[data-tab="atp"]');
await sleep(200);
await click('#atpForm button.btn');
await sleep(300);
check('không đổi mốc thì không hỏi', await modals() === 0);

console.log('▸ Hoàn tác ATP đã dùng để lật thẻ');
await ev(`TSTB.atp.award([${an}], TSTB.lessons.current().id, 'manual', { amount: 0 })`); // lượt vô hại để thử hoàn tác không hỏi
await go('tiet');
await click('[data-head="undo"]');
await sleep(300);
check('hoàn tác lượt không ảnh hưởng thẻ: không hỏi', await modals() === 0);
// Lượt gần nhất giờ là +100 của Bình (chưa lật) → không hỏi; ghi lại cho An để thử trường hợp có hỏi
await ev(`(() => { const T = TSTB; const l = T.lessons.current();
  T.db.run('DELETE FROM atp_events WHERE student_id = ?', [${an}]); T.atp.award([${an}], l.id, 'manual', { amount: 50 }); })()`);
await go('tiet');
await click('[data-head="undo"]');
await sleep(300);
check('hoàn tác làm An thiếu ATP cho thẻ đã lật: hỏi lại, nêu tên', /An sẽ không còn đủ ATP/.test(await confirmText()), await confirmText());
await shot('hoan-tac');
await confirmCancel();
await sleep(200);
check('huỷ thì lượt cộng còn nguyên', await total(an) === 50);
await click('[data-head="undo"]');
await sleep(300);
await confirmOk();
await sleep(300);
check('đồng ý thì hoàn tác, thẻ đã lật giữ nguyên', await total(an) === 0 && await flips(an) === 1);

console.log('▸ Xoá trong Lịch sử ATP');
await ev(`TSTB.atp.award([${an}], TSTB.lessons.current().id, 'manual', { amount: 50 })`);
await go('tiet');
await click('[data-head="history"]');
await sleep(300);
await ev(`[...document.querySelectorAll('.modal [data-del]')].find(b => /An/.test(b.closest('tr').innerText)).click()`);
await sleep(300);
check('xoá lượt cộng trong Lịch sử cũng hỏi lại', /An sẽ không còn đủ ATP/.test(await confirmText()));
await confirmCancel();
await sleep(200);
check('huỷ thì không xoá', await total(an) === 50);
await ev("document.querySelectorAll('.modal-wrap').forEach(m => m.remove())");

console.log('▸ Màn lật mở từ trước khi ATP bị hoàn tác');
await ev(`TSTB.evolve.open(TSTB.students.list(TSTB.store.state.classId).find(s => s.id === ${binh}))`);
await sleep(400);
check('màn lật mở cho Bình', await ev("document.querySelectorAll('.flip').length") > 0);
await ev(`TSTB.db.run('DELETE FROM atp_events WHERE student_id = ?', [${binh}])`); // ATP bị hoàn tác ở chỗ khác
await click('.flip');
await sleep(400);
check('lật không được, báo lý do', /không còn lượt lật/.test(await ev("document.getElementById('toasts').innerText")));
check('không có thẻ nào được phát', await flips(binh) === 0);
await ev("document.querySelectorAll('.evo, .modal-wrap').forEach(m => m.remove())");

console.log('▸ Xoá loại thẻ');
const cardId = await ev('TSTB.cards.list()[0].id');
await go('cai-dat');
await click('[data-tab="cards"]');
await sleep(200);
await click(`[data-card="${cardId}"] [data-act="del"]`);
await sleep(200);
check('hỏi lại: nói rõ vẫn tính là đã lật, lịch sử giữ lại', /vẫn tính là đã lật/.test(await confirmText()) && /Lịch sử của thẻ được giữ lại/.test(await confirmText()), await confirmText());
await confirmOk();
await sleep(300);
check('loại thẻ biến khỏi bộ thẻ', !(await ev(`TSTB.cards.list().some(c => c.id === ${cardId})`)));
check('An không được lật bù', await flips(an) === 1 && await ev(`TSTB.evolutions.pending(TSTB.atp.totalFor(${an}), TSTB.evolutions.flips(${an}))`) === 0);
await go('the-bai');
check('Lịch sử thẻ vẫn hiện lá của loại đã xoá', /An/.test(await ev("document.querySelector('.view').innerText.split('Lịch sử thẻ')[1] || ''")));

console.log('▸ Dữ liệu lỗi');
// Xoá học sinh bằng SQL, bỏ qua dây chuyền → ATP và thẻ của em thành mồ côi
await ev(`TSTB.db.run('DELETE FROM students WHERE id = ?', [${an}]), TSTB.db.flush()`);
await send('Page.reload');
await sleep(300);
await waitFor("!document.getElementById('app').hidden");
check('mở ứng dụng thì nhắc có dữ liệu lỗi', await waitFor("/Phát hiện dữ liệu lỗi/.test(document.getElementById('toasts').innerText)", 3000));
await go('cai-dat');
await click('[data-tab="data"]');
await sleep(300);
const box = await text('.integrity-box');
check('Cài đặt → Dữ liệu liệt kê lỗi kèm số lượng', /Lượt cộng ATP của học sinh/.test(box) && /Thẻ của học sinh/.test(box), box);
await shot('du-lieu-loi');
await click('[data-act="repair"]');
await sleep(200);
await confirmOk();
await waitFor("!document.querySelector('.integrity-box')", 3000);
check('sửa xong: hết khung báo lỗi, dữ liệu sạch', await ev('TSTB.integrity.check().ok'));
check('có bản chụp "Trước khi sửa dữ liệu lỗi"', await waitFor("/Trước khi sửa dữ liệu lỗi/.test(document.getElementById('snapList').innerText)", 3000));
check('dữ liệu của Bình giữ nguyên', await ev(`TSTB.db.scalar('SELECT COUNT(*) FROM students WHERE id = ?', [${binh}])`) === 1);

check('không có lỗi JS', !b.pageErrors.length, b.pageErrors);
b.finish();
