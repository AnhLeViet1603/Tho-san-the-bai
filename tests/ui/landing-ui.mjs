// Test trang giới thiệu trên trình duyệt thật, trọng tâm là phông chữ tiếng Việt.
// Chạy:  node tests/ui/landing-ui.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ROOT, sleep } from './driver.mjs';

const URL = pathToFileURL(path.join(ROOT, 'landing.html')).href;
const FONT = 'Be Vietnam Pro';
// Trình duyệt báo tên đầy đủ theo độ đậm: "Be Vietnam Pro", "Be Vietnam Pro SemiBold", "Be Vietnam Pro ExtraBold"
const isOurs = f => f.isCustomFont && f.familyName.startsWith(FONT);
const b = await launch('landing');
const { ev, send, check } = b;

// Phông mà trình duyệt THỰC SỰ dùng để vẽ từng phần tử có chữ.
// Nếu một ký tự có dấu không có trong phông, trình duyệt sẽ lấy phông hệ thống thay vào
// và chữ sẽ bị lệch nét giữa các ký tự: đó chính là "lỗi font tiếng Việt".
async function fontsInUse() {
  await ev(`(() => { let n = 0; document.querySelectorAll('body *').forEach(el => {
    const own = [...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
    if (own && el.getClientRects().length) el.setAttribute('data-ft', n++); }); })()`);
  const { root } = await send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-ft]' });
  const out = [];
  for (const nodeId of nodeIds) {
    const { fonts = [] } = await send('CSS.getPlatformFontsForNode', { nodeId });
    const { outerHTML } = await send('DOM.getOuterHTML', { nodeId });
    out.push({ html: outerHTML.replace(/\s+/g, ' ').slice(0, 90), fonts });
  }
  return out;
}

console.log('\n1. Tải trang');
await b.viewport(1440, 900);
await send('Page.navigate', { url: URL });
await b.waitFor("document.readyState === 'complete'");
await ev('document.fonts.ready.then(() => true)');
await sleep(400);
check('trang mở được qua file://', /Thợ Săn Thẻ Bài/.test(await ev('document.title')), await ev('document.title'));
check('khai báo ngôn ngữ tiếng Việt và mã hoá UTF-8', await ev("document.documentElement.lang === 'vi' && document.characterSet === 'UTF-8'"));

console.log('\n2. Phông chữ tiếng Việt');
const faces = await ev(`[...document.fonts].map(f => ({ w: f.weight, status: f.status, range: f.unicodeRange.slice(0, 12) }))`);
const failedFaces = faces.filter(f => f.status === 'error');
check('không file phông nào tải lỗi', failedFaces.length === 0, failedFaces);
check('phần phông chứa dấu tiếng Việt đã được tải cho cả 3 độ đậm',
  ['400', '600', '800'].every(w => faces.some(f => f.w === w && f.status === 'loaded' && f.range.startsWith('U+102'))), faces);

const used = await fontsInUse();
check('trang có đủ nội dung chữ để kiểm tra', used.length > 60, used.length);
const bad = used.filter(n => n.fonts.some(f => !isOurs(f) && !/emoji/i.test(f.familyName) && !/Consolas|Courier/i.test(f.familyName)));
check('mọi chữ đều vẽ bằng Be Vietnam Pro, không ký tự nào rơi về phông hệ thống', bad.length === 0,
  bad.slice(0, 5).map(n => ({ html: n.html, fonts: n.fonts.map(f => f.familyName + '×' + f.glyphCount) })));
const glyphs = used.reduce((a, n) => a + n.fonts.filter(isOurs).reduce((x, f) => x + f.glyphCount, 0), 0);
check('đã kiểm tra hơn 2000 ký tự vẽ bằng Be Vietnam Pro', glyphs > 2000, glyphs);

// Mẫu chứa đủ 134 chữ cái có dấu của tiếng Việt, ở cả 3 độ đậm
const SAMPLE = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
await ev(`(() => { const box = document.createElement('div'); box.id = 'vn-sample';
  [400, 600, 800].forEach(w => { const p = document.createElement('p'); p.style.fontWeight = w; p.setAttribute('data-vn', w);
    p.textContent = ${JSON.stringify(SAMPLE + SAMPLE.toUpperCase())}; box.append(p); });
  document.body.append(box); })()`);
await ev('document.fonts.ready.then(() => true)');
await sleep(300);
const { root } = await send('DOM.getDocument', { depth: 0 });
for (const w of [400, 600, 800]) {
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-vn="${w}"]` });
  const { fonts = [] } = await send('CSS.getPlatformFontsForNode', { nodeId });
  const total = fonts.reduce((a, f) => a + f.glyphCount, 0);
  const ours = fonts.filter(isOurs).reduce((a, f) => a + f.glyphCount, 0);
  check(`độ đậm ${w}: đủ ${SAMPLE.length * 2} chữ có dấu (thường + hoa) đều có trong phông`,
    fonts.length > 0 && ours === total && total === SAMPLE.length * 2, fonts.map(f => f.familyName + '×' + f.glyphCount));
}
await ev("document.getElementById('vn-sample').remove()");

check('chữ trên trang ở dạng dựng sẵn (NFC), không dùng dấu rời', await ev("document.body.innerText === document.body.innerText.normalize('NFC')"));
check('không có ký tự lỗi mã hoá', await ev("!/\\uFFFD|Ã.|áº|á»|Ä‘/.test(document.body.innerText)"));

console.log('\n3. Dấu tiếng Việt không bị cắt');
const clipped = await ev(`[...document.querySelectorAll('h1, h2, h3, .btn, summary, .brand, .face b')].filter(el => {
  const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
  return (lh && lh < 1.2) || el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
}).map(el => el.tagName + ': ' + el.innerText.slice(0, 40))`);
check('tiêu đề và nút đủ khoảng dòng, không tràn khung', clipped.length === 0, clipped);

console.log('\n4. Bố cục và tương tác');
check('ảnh minh hoạ tải được', await ev("[...document.images].length === 3 && [...document.images].every(i => { i.loading = 'eager'; return true; })")
  && await b.waitFor("[...document.images].every(i => i.complete && i.naturalWidth > 0)"));
check('không tải gì từ Internet (chạy offline)', await ev("performance.getEntriesByType('resource').every(r => r.name.startsWith('file:'))"),
  await ev("performance.getEntriesByType('resource').filter(r => !r.name.startsWith('file:')).map(r => r.name)"));
await ev("document.querySelector('.flip').click()");
check('bấm thẻ ở đầu trang thì thẻ lật', await ev("document.querySelector('.flip').classList.contains('open')"));
await ev("document.querySelector('#hoi-dap summary').click()");
check('mở được câu hỏi trong Hỏi đáp', await ev("document.querySelector('#hoi-dap details').open"));
await ev('window.scrollTo(0, document.body.scrollHeight)');
await sleep(900);
check('nội dung hiện đầy đủ khi cuộn tới cuối', await ev("[...document.querySelectorAll('.block, .final')].every(e => getComputedStyle(e).opacity === '1')"));
await ev('window.scrollTo(0, 0)');
await sleep(300);
await b.shot('landing-1440');

for (const [w, h] of [[1440, 900], [820, 1000], [390, 800]]) {
  await b.viewport(w, h);
  await sleep(300);
  const over = await ev('document.documentElement.scrollWidth - innerWidth');
  check(`không tràn ngang ở chiều rộng ${w}px`, over <= 0, over);
  const off = await ev(`[...document.querySelectorAll('h1, h2, h3, p, .btn, .flip, img')].filter(e => { const r = e.getBoundingClientRect();
    return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.tagName + ': ' + (e.innerText || e.alt || '').slice(0, 30))`);
  check(`không phần tử nào lọt ra ngoài màn hình ở ${w}px`, off.length === 0, off);
}
await b.shot('landing-390');
await b.viewport(1440, 900);

console.log('\n5. Liên kết');
const links = await ev("[...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))");
const anchors = links.filter(h => h.startsWith('#'));
check('mọi liên kết trong trang trỏ tới mục có thật', await ev(`${JSON.stringify(anchors)}.every(h => document.querySelector(h))`), anchors);
check('có nút mở ứng dụng', links.filter(h => h === 'index.html').length >= 2, links);
await ev("document.querySelector('a.btn[href=\"index.html\"]').click()");
check('nút "Mở ứng dụng" dẫn tới ứng dụng và ứng dụng khởi động được',
  await b.waitFor("!!document.getElementById('app') && !document.getElementById('app').hidden", 20000));
await ev("document.querySelector('a.brand').click()");
check('từ ứng dụng bấm logo quay lại được trang giới thiệu', await b.waitFor("/landing\\.html/.test(location.href) && document.readyState === 'complete'"));

console.log('\nChung');
check('không có lỗi JavaScript', b.pageErrors.length === 0, b.pageErrors);
b.finish();
