// Số phiên bản: sửa ở đây khi phát hành, footer của ứng dụng và trang giới thiệu tự cập nhật
window.TSTB = window.TSTB || {};
(function (T) {
  'use strict';

  T.version = '1.2.0';
  document.querySelectorAll('[data-version]').forEach(el => { el.textContent = 'v' + T.version; });
})(window.TSTB);
