// Khởi động ứng dụng
(async function (T) {
  'use strict';

  try {
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
