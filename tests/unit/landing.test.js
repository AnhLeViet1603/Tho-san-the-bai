// Kiểm tra tĩnh trang giới thiệu: mã hoá, chuẩn hoá tiếng Việt, phông chữ và liên kết nội bộ
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f));
const html = read('landing.html').toString('utf8');
const css = read('css/landing.css').toString('utf8');

// Khối phông chứa chữ có dấu tiếng Việt (ạ ả ấ ầ … ỹ ỵ) và các chữ ă đ ĩ ũ ơ ư
const VIET_RANGES = ['U+1EA0-1EF9', 'U+0102-0103', 'U+0110-0111', 'U+0128-0129', 'U+0168-0169', 'U+01A0-01A1', 'U+01AF-01B0'];

test('landing.html và index.html khai báo UTF-8 ngay đầu <head> và ngôn ngữ tiếng Việt', () => {
  for (const file of ['landing.html', 'index.html']) {
    const text = read(file).toString('utf8');
    assert.match(text, /<html lang="vi">/, file);
    const head = text.slice(text.indexOf('<head>'), text.indexOf('<head>') + 120);
    assert.match(head, /<meta charset="utf-8">/i, `${file}: charset phải nằm trong 1024 byte đầu`);
  }
});

test('file là UTF-8 hợp lệ, không BOM, không ký tự thay thế hay chuỗi lỗi mã hoá', () => {
  for (const file of ['landing.html', 'css/landing.css', 'js/landing.js']) {
    const buf = read(file);
    assert.notDeepEqual([...buf.subarray(0, 3)], [0xEF, 0xBB, 0xBF], `${file} có BOM`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf); // ném lỗi nếu byte không hợp lệ
    assert.ok(!text.includes('�'), `${file} chứa ký tự thay thế`);
    assert.doesNotMatch(text, /Ã[\u0080-¿]|áº|á»|Ä‘|Æ°/, `${file} có dấu hiệu UTF-8 bị đọc nhầm thành Latin-1`);
  }
});

test('chữ tiếng Việt ở dạng dựng sẵn (NFC), không dùng dấu rời dễ bị vẽ lệch', () => {
  assert.equal(html, html.normalize('NFC'));
  assert.doesNotMatch(html, /[̀-ͯ]/, 'còn dấu kết hợp đứng rời');
});

test('nội dung có tiếng Việt đủ dấu ở các vị trí chính', () => {
  for (const phrase of ['Thợ Săn Thẻ Bài', 'hành trình tiến hoá', 'Mở ứng dụng', 'Hỏi đáp', 'đặc quyền', 'năng lượng']) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /<title>[^<]*Thợ Săn Thẻ Bài[^<]*<\/title>/);
});

test('phông chữ: mỗi độ đậm 400/600/800 có đủ 3 phần latin, latin-ext, vietnamese', () => {
  const faces = css.match(/@font-face\s*{[^}]+}/g) || [];
  assert.equal(faces.length, 9);
  for (const weight of ['400', '600', '800']) {
    for (const subset of ['latin', 'latin-ext', 'vietnamese']) {
      const face = faces.find(f => f.includes(`be-vietnam-pro-${subset}-${weight}.woff2`));
      assert.ok(face, `thiếu ${subset} ${weight}`);
      assert.match(face, new RegExp(`font-weight:\\s*${weight}`));
      assert.match(face, /font-display:\s*swap/, 'chữ phải hiện ngay bằng phông dự phòng khi phông chưa tải xong');
    }
    const viet = faces.find(f => f.includes(`be-vietnam-pro-vietnamese-${weight}.woff2`));
    VIET_RANGES.forEach(r => assert.ok(viet.includes(r), `vietnamese ${weight} thiếu ${r}`));
  }
});

test('các khối unicode-range không chồng lên nhau ở vùng chữ tiếng Việt', () => {
  const faces = (css.match(/@font-face\s*{[^}]+}/g) || []).filter(f => /font-weight:\s*400/.test(f));
  const covers = (face, cp) => face.match(/unicode-range:([^;]+)/)[1].split(',').some(part => {
    const m = part.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
    const lo = parseInt(m[1], 16);
    return cp >= lo && cp <= (m[2] ? parseInt(m[2], 16) : lo);
  });
  for (const ch of 'ăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹĂĐƠƯẠỆỘỢỰỸ') {
    const hit = faces.filter(f => covers(f, ch.codePointAt(0)));
    assert.equal(hit.length, 1, `"${ch}" phải thuộc đúng một phần phông`);
    assert.match(hit[0], /vietnamese/, `"${ch}" phải lấy từ phần vietnamese`);
  }
  for (const ch of 'aâêôàáãèéìíòóõùúýAÂÊÔÀÁ 0123456789.,:–·?!') {
    assert.equal(faces.filter(f => covers(f, ch.codePointAt(0))).length, 1, `"${ch}"`);
  }
});

test('mọi ký tự chữ trên trang đều nằm trong vùng phông đã khai báo', () => {
  const ranges = [...css.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)]
    .map(m => [parseInt(m[1], 16), m[2] ? parseInt(m[2], 16) : parseInt(m[1], 16)]);
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  const missing = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || /\p{Extended_Pictographic}/u.test(ch) || cp === 0xFE0F || cp === 0x200D) continue; // emoji dùng phông emoji
    if (!ranges.some(([lo, hi]) => cp >= lo && cp <= hi)) missing.add(`${ch} (U+${cp.toString(16).toUpperCase()})`);
  }
  assert.deepEqual([...missing], []);
});

test('file phông tồn tại, đúng định dạng WOFF2 và kèm giấy phép', () => {
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map(m => m[1]);
  assert.equal(urls.length, 9);
  for (const url of urls) {
    const file = path.join(ROOT, 'css', url);
    assert.ok(fs.existsSync(file), url);
    assert.equal(fs.readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', url);
  }
  assert.match(read('assets/fonts/OFL.txt').toString('utf8'), /SIL Open Font License/);
});

test('chuỗi phông dự phòng chỉ gồm phông hỗ trợ tiếng Việt và kết thúc bằng họ chung', () => {
  const stack = css.match(/--font:\s*([^;]+);/)[1];
  assert.match(stack, /^"Be Vietnam Pro"/);
  assert.match(stack, /sans-serif\s*$/);
  for (const risky of ['Impact', 'Comic Sans', 'Papyrus', 'Brush Script', 'Lobster', 'Bebas']) {
    assert.ok(!stack.includes(risky), `${risky} thiếu dấu tiếng Việt`);
  }
});

test('tiêu đề có khoảng dòng đủ rộng cho dấu chồng (Ấ, Ễ, Ộ)', () => {
  const rule = css.match(/h1, h2, h3\s*{[^}]+}/)[0];
  assert.ok(Number(rule.match(/line-height:\s*([\d.]+)/)[1]) >= 1.2);
  assert.doesNotMatch(css, /text-transform:\s*uppercase/, 'in hoa tự động dễ làm dấu chạm dòng trên');
});

test('trang chạy offline: không tham chiếu tài nguyên ngoài, mọi file nội bộ đều tồn tại', () => {
  assert.doesNotMatch(html + css, /(src|href)="https?:|url\(["']?https?:|@import/);
  const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map(m => m[1]);
  assert.ok(refs.includes('index.html'));
  refs.forEach(ref => assert.ok(fs.existsSync(path.join(ROOT, ref)), ref));
});

test('liên kết trong trang trỏ tới id có thật; ảnh có mô tả tiếng Việt và kích thước', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  [...html.matchAll(/href="#([^"]+)"/g)].forEach(m => assert.ok(ids.has(m[1]), '#' + m[1]));
  const imgs = html.match(/<img[^>]+>/g) || [];
  assert.equal(imgs.length, 3);
  imgs.forEach(img => {
    assert.match(img, /alt="[^"]{10,}"/);
    assert.match(img, /width="\d+" height="\d+"/, 'thiếu kích thước sẽ làm trang nhảy khi ảnh tải xong');
  });
});

test('ứng dụng có đường dẫn quay lại trang giới thiệu', () => {
  assert.match(read('index.html').toString('utf8'), /<a class="brand" href="landing\.html"/);
});
