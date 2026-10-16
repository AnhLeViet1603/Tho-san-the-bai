// Khởi động ứng dụng
(async function (T) {
  'use strict';

  // Màn che toàn trang khi tab này không được ghi dữ liệu; resolve khi bấm nút
  function blockScreen(title, message, label) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'tab-block';
      el.innerHTML = `<div class="tab-block-box">
          <div class="boot-ico">🧬</div>
          <h2>${T.ui.esc(title)}</h2>
          <p>${T.ui.esc(message)}</p>
          <button type="button" class="btn">${T.ui.esc(label)}</button>
        </div>`;
      el.querySelector('button').onclick = () => { el.remove(); resolve(); };
      document.body.append(el);
    });
  }

  // Tab khác vừa nhận quyền ghi: lưu nốt (nếu còn kịp) rồi dừng ghi
  async function onLost({ stolen }) {
    if (!stolen) {
      await T.db.flush();
      await T.fileSink.flush();
    }
    T.db.detach();
    document.querySelectorAll('.modal-wrap').forEach(m => m.remove());
    await blockScreen('Ứng dụng đang mở ở tab khác',
      'Tab này đã dừng lưu dữ liệu để không ghi đè lên tab kia.', 'Dùng ở tab này');
    location.reload();
  }

  try {
    if (!await T.tabLock.acquire(onLost)) {
      document.getElementById('boot').hidden = true;
      await blockScreen('Ứng dụng đang mở ở tab khác',
        'Mỗi lúc chỉ dùng được ở một tab để không mất dữ liệu. Chuyển sang đây thì tab kia sẽ dừng lại.',
        'Dùng ở tab này');
      document.getElementById('boot').hidden = false;
      await T.tabLock.takeover(onLost);
    }
    await T.db.init();
  } catch (err) {
    console.error(err);
    document.getElementById('bootMsg').textContent = 'Không khởi động được: ' + err.message;
    return;
  }

  T.store.init();
  document.getElementById('boot').remove();
  document.getElementById('app').hidden = false;
  T.router.start();

  // Kiểm tra toàn vẹn dữ liệu; có lỗi thì nhắc vào Cài đặt → Dữ liệu để xem và sửa
  try {
    if (!T.integrity.check().ok) T.ui.toast('Phát hiện dữ liệu lỗi. Vào Cài đặt → Dữ liệu để xem và sửa.', 'warn', 8000);
  } catch (err) {
    console.error(err);
  }

  // Chỉ báo trạng thái lưu ở thanh bên
  const SAVE_TEXT = {
    saved: '✓ Đã lưu',
    pending: '… Đang lưu',
    saving: '… Đang lưu',
    error: '⚠ Chưa lưu được, đang thử lại'
  };
  const saveEl = document.getElementById('saveState');
  T.db.onStatus(s => {
    saveEl.dataset.state = s;
    saveEl.textContent = SAVE_TEXT[s];
  });

  // Tự lưu ra file: thanh bên chỉ hiện khi cần người dùng bấm (xin lại quyền) hoặc khi lỗi
  const fileEl = document.getElementById('fileState');
  T.fileSink.onChange(s => {
    fileEl.dataset.state = s.status;
    fileEl.hidden = s.status !== 'needs-permission' && s.status !== 'error';
    fileEl.textContent = s.status === 'error' ? '📁 Tự lưu ra file bị lỗi — xem Cài đặt' : '📁 Bấm để tiếp tục tự lưu ra file';
    fileEl.title = s.status === 'error' ? s.error : 'Trình duyệt cần bạn cho phép ghi lại vào file ' + (s.name || '');
  });
  fileEl.onclick = async () => {
    if (T.fileSink.state().status === 'error') { T.settingsView.open('data', 'backup'); return; }
    if (await T.fileSink.resume()) T.ui.toast('Đã tiếp tục tự lưu ra file');
  };
  T.fileSink.init().catch(err => console.error(err));

  // Lần đầu mở trên trình duyệt này (hoặc dữ liệu trình duyệt vừa bị xoá): mời nhập file sao lưu
  // thay vì âm thầm bắt đầu với dữ liệu trống
  if (T.db.fresh()) welcome();

  function welcome() {
    const m = T.ui.modal({
      title: '🧬 Chào mừng tới Thợ Săn Thẻ Bài',
      body: `<div class="welcome">
        <p>Trình duyệt này chưa có dữ liệu của ứng dụng.</p>
        <p><b>Đã từng dùng rồi?</b> (ở máy khác, trình duyệt khác, hoặc dữ liệu trình duyệt vừa bị xoá) — hãy nhập
          <b>file sao lưu</b> hoặc <b>file tự lưu</b> (.sqlite) để lấy lại toàn bộ lớp, học sinh, ATP và thẻ.</p>
        <p class="muted">Dùng lần đầu thì chọn “Bắt đầu mới” rồi tạo lớp trong Cài đặt.</p>
      </div>`,
      actions: [
        { label: 'Bắt đầu mới', kind: 'ghost', onClick: close => close() },
        { label: '📥 Nhập file sao lưu', onClick: async close => {
          const file = await T.backup.chooseFile();
          if (!file) return;
          try {
            await T.backup.importFile(file);
            T.audit.log('data.import', `Nhập file ${file.name} (lần đầu mở trên trình duyệt này)`);
            T.ui.toast('Đã nhập dữ liệu từ ' + file.name);
            close();
            T.router.refresh();
          } catch (err) {
            T.ui.toast(err.message || 'Không nhập được file', 'error');
          }
        } }
      ]
    });
    m.el.classList.add('welcome-modal');
  }

  // Xin trình duyệt không tự dọn dữ liệu khi máy thiếu dung lượng
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Ghi nốt thay đổi đang chờ khi rời trang; còn thay đổi chưa lưu thì trình duyệt hỏi lại
  window.addEventListener('beforeunload', e => {
    if (!T.db.dirty()) return;
    T.db.flush();
    e.preventDefault();
    e.returnValue = '';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') T.db.flush().then(() => T.fileSink.flush());
  });
})(window.TSTB);
