// Mở Edge/Chrome headless với hồ sơ tạm và trả về bộ hàm điều khiển qua DevTools Protocol
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

export async function launch(name) {
  const exe = process.env.BROWSER_PATH || BROWSERS.find(p => fs.existsSync(p));
  if (!exe) throw new Error('Không tìm thấy Edge/Chrome. Đặt biến môi trường BROWSER_PATH.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tstb-${name}-`));
  const shots = path.join(tmp, 'screenshots');
  fs.mkdirSync(shots);
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(tmp, 'profile')}`, 'about:blank'], { stdio: 'ignore' });

  let tabs;
  for (let i = 0; i < 100 && !tabs; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
  }
  if (!tabs) throw new Error('Không kết nối được trình duyệt');
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let seq = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') {
      pageErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) => new Promise(resolve => {
    pending.set(++seq, d => resolve(d.result || {}));
    ws.send(JSON.stringify({ id: seq, method, params }));
  });

  async function ev(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function waitFor(expression, ms = 8000) {
    for (let t = 0; t < ms; t += 100) { if (await ev(expression)) return true; await sleep(100); }
    return false;
  }
  async function shot(file) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, file + '.png'), Buffer.from(r.data, 'base64'));
  }
  const viewport = (width, height) =>
    send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  await send('Runtime.enable');
  await send('DOM.enable');
  await send('CSS.enable');

  // Bộ đếm kết quả
  const results = [];
  function check(label, ok, detail) {
    results.push({ label, ok: !!ok });
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok || detail === undefined ? '' : '  → ' + JSON.stringify(detail)}`);
  }
  function finish() {
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt. Ảnh chụp: ${shots}`);
    failed.forEach(f => console.log(`  ✗ ${f.label}`));
    ws.close();
    proc.kill();
    process.exit(failed.length ? 1 : 0);
  }

  return { send, ev, waitFor, shot, viewport, check, finish, pageErrors, shots };
}
