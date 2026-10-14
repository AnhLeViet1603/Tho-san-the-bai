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
    if (!stolen) await T.db.flush();
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

  // Ghi nốt thay đổi đang chờ khi rời trang
  window.addEventListener('beforeunload', () => { T.db.flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') T.db.flush();
  });
})(window.TSTB);
