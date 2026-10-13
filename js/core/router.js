// Hash router: #/rung, #/tiet, #/nhom, #/the-bai, #/thong-ke, #/cai-dat
(function (T) {
  'use strict';

  const routes = [];
  let current = null;

  function register(name, def) {
    routes.push(Object.assign({ name }, def));
  }

  function parse() {
    const name = location.hash.replace(/^#\/?/, '');
    return routes.find(r => r.name === name) || routes[0];
  }

  function renderNav() {
    document.getElementById('nav').innerHTML = routes.map(r =>
      `<a href="#/${r.name}" class="${r === current ? 'on' : ''}"><span>${r.icon}</span>${T.ui.esc(r.label)}</a>`).join('');
    const cls = T.store.currentClass();
    document.getElementById('sideClass').innerHTML = cls
      ? `<small>Lớp đang chọn</small><b>${T.ui.esc(cls.icon || '🌿')} ${T.ui.esc(cls.name)}</b>`
      : '<small>Chưa có lớp nào</small>';
  }

  function refresh() {
    current = parse();
    if (T.schoolYear.ensure()) {
      T.ui.toast(`Đã sang năm học ${T.schoolYear.range().label}: ATP được tính lại từ 0`, 'gold');
    }
    T.evolutions.purge();
    // Mỗi lần render dùng một node mới để listener của view cũ tự mất
    const el = document.createElement('div');
    el.className = 'view view-' + current.name;
    try {
      current.render(el);
    } catch (err) {
      console.error(err);
      el.innerHTML = T.ui.empty('⚠️', 'Có lỗi khi hiển thị', err.message);
    }
    document.getElementById('view').replaceChildren(el);
    renderNav();
  }

  function go(name) {
    if (location.hash === '#/' + name) refresh();
    else location.hash = '#/' + name;
  }

  function start() {
    window.addEventListener('hashchange', () => {
      document.getElementById('main').scrollTop = 0;
      refresh();
    });
    refresh();
  }

  T.router = { register, refresh, go, start };
})(window.TSTB);
