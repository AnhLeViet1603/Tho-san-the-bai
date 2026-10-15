// Tự lưu ra file trên ổ đĩa (File System Access API): sau mỗi lần lưu vào IndexedDB, ghi đè toàn bộ dữ liệu
// vào MỘT file người dùng đã chọn (nên đặt trong OneDrive / Google Drive hoặc USB). File này nằm ngoài trình duyệt
// nên còn nguyên khi dữ liệu trình duyệt bị xoá; nhập lại bằng "Nhập file .sqlite".
// createWritable() ghi ra file tạm rồi mới thay file cũ: mất điện giữa chừng thì file cũ vẫn nguyên.
(function (T) {
  'use strict';

  const KEY = 'file-sink';         // handle của file đã chọn, lưu trong IndexedDB
  const GATHER = 30000;            // gom các thay đổi, ghi file tối đa 30s một lần
  const SUGGESTED = 'tho-san-the-bai.sqlite';

  let picker = null;               // showSaveFilePicker (test truyền bản giả)
  let handle = null;
  let status = 'off';              // unsupported | off | ok | needs-permission | error
  let error = '';
  let lastWrite = null;
  let pending = false;             // có thay đổi đã lưu IndexedDB mà chưa ghi ra file
  let timer = null;
  let writing = null;
  let offSaved = null;
  const listeners = [];

  function setStatus(next, err) {
    status = next;
    error = err || '';
    const info = state();
    listeners.slice().forEach(fn => fn(info)); // bản sao: listener có thể tự huỷ đăng ký giữa chừng
  }

  const state = () => ({ status, error, name: handle ? handle.name : null, lastWrite });

  // fn({ status, error, name, lastWrite }) mỗi khi trạng thái đổi; trả về hàm huỷ đăng ký
  function onChange(fn) {
    listeners.push(fn);
    fn(state());
    return () => listeners.splice(listeners.indexOf(fn), 1);
  }

  // opts.picker: thay showSaveFilePicker (test); trình duyệt không có API thì status = 'unsupported'
  async function init(opts = {}) {
    clearTimeout(timer);
    timer = null;
    handle = null;
    pending = false;
    lastWrite = null;
    picker = 'picker' in opts ? opts.picker
      : (typeof window.showSaveFilePicker === 'function' ? window.showSaveFilePicker.bind(window) : null);
    if (offSaved) offSaved();
    offSaved = T.db.onSaved(changed);
    if (!picker) return setStatus('unsupported');
    try {
      const saved = await T.db.kv.get(KEY);
      if (!saved) return setStatus('off');
      handle = saved.handle;
      lastWrite = saved.lastWrite || null;
    } catch (err) {
      console.error(err);
      return setStatus('off');
    }
    await refreshPermission();
  }

  // Kiểm tra quyền mà không hỏi người dùng
  async function refreshPermission() {
    if (!handle) return setStatus('off');
    try {
      const p = await handle.queryPermission({ mode: 'readwrite' });
      setStatus(p === 'granted' ? 'ok' : 'needs-permission');
    } catch (err) {
      setStatus('error', err.message);
    }
  }

  // Dữ liệu vừa được lưu vào IndexedDB: hẹn ghi ra file
  function changed() {
    pending = true;
    if (status !== 'ok' || timer) return;
    timer = setTimeout(() => { timer = null; flush(); }, GATHER);
  }

  async function remember() {
    await T.db.kv.set(KEY, { handle, lastWrite });
  }

  // Ghi ngay nếu còn thay đổi chưa ghi (force: ghi kể cả khi không có thay đổi). Không bao giờ reject.
  async function flush(force) {
    clearTimeout(timer);
    timer = null;
    if (writing) {
      await writing;
      if (!pending && !force) return;
    }
    if (status !== 'ok' || !handle || !T.db.writable() || (!pending && !force)) return;
    pending = false;
    writing = (async () => {
      try {
        const w = await handle.createWritable();
        try {
          await w.write(T.db.exportBytes());
          await w.close();
        } catch (err) {
          if (w.abort) await w.abort().catch(() => {});
          throw err;
        }
        lastWrite = Date.now();
        await remember().catch(err => console.error(err));
        setStatus('ok');
      } catch (err) {
        console.error(err);
        pending = true;
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) setStatus('needs-permission');
        else if (err && err.name === 'NotFoundError') setStatus('error', 'Không tìm thấy file (đã bị xoá, đổi tên hoặc chuyển chỗ). Hãy chọn lại file.');
        else setStatus('error', (err && err.message) || 'Không ghi được file');
      }
    })();
    try { await writing; } finally { writing = null; }
  }

  // Chọn (hoặc đổi) file tự lưu rồi ghi ngay. Phải gọi từ một cú bấm. Trả về false nếu người dùng huỷ.
  async function pick() {
    let next;
    try {
      next = await picker({
        suggestedName: SUGGESTED,
        types: [{ description: 'Dữ liệu Thợ Săn Thẻ Bài', accept: { 'application/x-sqlite3': ['.sqlite'] } }]
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
      throw err;
    }
    handle = next;
    lastWrite = null;
    await remember();
    setStatus('ok');
    await flush(true);
    return true;
  }

  // Xin lại quyền ghi (trình duyệt sẽ hỏi). Phải gọi từ một cú bấm.
  async function resume() {
    if (!handle) return false;
    try {
      const p = await handle.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') { setStatus('needs-permission'); return false; }
    } catch (err) {
      setStatus('error', err.message);
      return false;
    }
    setStatus('ok');
    await flush(true);
    return status === 'ok';
  }

  // Ngừng tự lưu và quên file (file trên ổ đĩa giữ nguyên)
  async function disable() {
    clearTimeout(timer);
    timer = null;
    handle = null;
    lastWrite = null;
    pending = false;
    await T.db.kv.del(KEY).catch(err => console.error(err));
    setStatus(picker ? 'off' : 'unsupported');
  }

  T.fileSink = { init, onChange, state, flush, pick, resume, disable, refreshPermission, GATHER };
})(window.TSTB);
