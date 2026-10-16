// Xuất / nhập file .sqlite, nhắc sao lưu định kỳ
(function (T) {
  'use strict';

  const REMIND_AFTER = 7 * 86400000; // nhắc khi quá 7 ngày chưa sao lưu
  const SNOOZE_KEY = 'tstb.backupSnooze';

  function exportFile() {
    const blob = new Blob([T.db.exportBytes()], { type: 'application/x-sqlite3' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tho-san-the-bai-${T.time.today()}.sqlite`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    T.settings.set('last_export_at', Date.now());
  }

  async function importFile(file) {
    await T.db.importBytes(new Uint8Array(await file.arrayBuffer()));
  }

  // Mở hộp chọn file .sqlite; resolve File, hoặc null nếu người dùng huỷ
  function chooseFile() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sqlite,.db,.sqlite3';
      input.onchange = () => resolve(input.files[0] || null);
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  // Lần sao lưu gần nhất (ms): xuất file hoặc tự lưu ra file; 0 nếu chưa từng.
  // Lần tự lưu lấy từ file-sink (lưu ngoài DB), không ghi vào settings để tránh vòng lặp ghi DB → ghi file → ghi DB.
  function lastBackup() {
    const sink = T.fileSink ? T.fileSink.state() : {};
    return Math.max(T.settings.num('last_export_at', 0), sink.lastWrite || 0);
  }

  // Lúc bắt đầu có dữ liệu cần giữ: lớp được tạo sớm nhất (kể cả lớp trong thùng rác); null nếu chưa có lớp nào
  function dataSince() {
    const first = T.db.scalar('SELECT MIN(created_at) FROM classes');
    return first ? Date.parse(first.replace(' ', 'T') + 'Z') : null;
  }

  function snoozedToday() {
    try { return localStorage.getItem(SNOOZE_KEY) === T.time.today(); } catch (err) { return false; }
  }

  // Có cần nhắc sao lưu không? null nếu không; ngược lại { last, days } (last = 0: chưa từng sao lưu)
  function reminder(now = Date.now()) {
    const since = dataSince();
    if (!since) return null;                                   // chưa có dữ liệu gì đáng giữ
    if (T.fileSink && T.fileSink.state().status === 'ok') return null; // đang tự lưu ra file
    const last = lastBackup();
    if (now - Math.max(last, since) < REMIND_AFTER) return null;
    if (snoozedToday()) return null;
    return { last, days: Math.floor((now - (last || since)) / 86400000) };
  }

  // "Để mai": không nhắc nữa trong hôm nay (theo giờ Việt Nam)
  function snooze() {
    try { localStorage.setItem(SNOOZE_KEY, T.time.today()); } catch (err) { /* bỏ qua */ }
  }

  // Khung nhắc (HTML) hoặc '' nếu không cần nhắc; nút data-backup="export" | "snooze" | "auto"
  function reminderHtml() {
    const r = reminder();
    if (!r) return '';
    const when = r.last ? `${r.days} ngày chưa sao lưu (lần gần nhất ${T.time.fmt(r.last)})` : `Đã dùng ${r.days} ngày mà chưa sao lưu lần nào`;
    const canAuto = T.fileSink && T.fileSink.state().status !== 'unsupported';
    return `<div class="backup-reminder" role="status">
      <div><b>💾 ${when}.</b> Dữ liệu chỉ nằm trong trình duyệt này: xoá dữ liệu trình duyệt hay hỏng máy là mất.
        Hãy xuất một file sao lưu và cất ở chỗ khác (OneDrive, USB…).</div>
      <div class="btn-row">
        <button type="button" class="btn" data-backup="export">⬇ Xuất ngay</button>
        ${canAuto ? '<button type="button" class="btn ghost" data-backup="auto">📁 Bật tự lưu ra file</button>' : ''}
        <button type="button" class="btn ghost" data-backup="snooze">Để mai</button>
      </div>
    </div>`;
  }

  // Xử lý click trong khung nhắc; gọi từ onclick của trang. Trả về true nếu đã xử lý.
  function onReminderClick(e) {
    const b = e.target.closest('[data-backup]');
    if (!b) return false;
    if (b.dataset.backup === 'auto') { T.settingsView.open('data', 'backup'); return true; }
    if (b.dataset.backup === 'export') { exportFile(); T.ui.toast('Đã xuất file sao lưu'); }
    if (b.dataset.backup === 'snooze') snooze();
    T.router.refresh();
    return true;
  }

  T.backup = { exportFile, importFile, chooseFile, lastBackup, reminder, snooze, reminderHtml, onReminderClick, REMIND_AFTER };
})(window.TSTB);
