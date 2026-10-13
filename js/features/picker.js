// Thanh chọn Lớp · Năm · Tháng · Tuần · Tiết (dùng chung cho Tiết học và Chia nhóm)
(function (T) {
  'use strict';

  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  function select(key, label, items, cur) {
    return `<label>${label}<select data-pick="${key}">${items.map(([v, text]) =>
      `<option value="${v}" ${v === cur ? 'selected' : ''}>${T.ui.esc(text)}</option>`).join('')}</select></label>`;
  }

  function html() {
    const s = T.store.state;
    const y = T.time.parts().year;
    const years = Array.from(new Set([y - 1, y, y + 1, s.year])).sort();
    return `<div class="picker">
      ${select('classId', 'Lớp', T.classes.list().map(c => [c.id, (c.icon || '🌿') + ' ' + c.name]), s.classId)}
      ${select('year', 'Năm', years.map(v => [v, String(v)]), s.year)}
      ${select('month', 'Tháng', range(1, 12).map(v => [v, 'Tháng ' + v]), s.month)}
      ${select('week', 'Tuần', range(1, 5).map(v => [v, 'Tuần ' + v]), s.week)}
      ${select('period', 'Tiết', range(1, 10).map(v => [v, 'Tiết ' + v]), s.period)}
    </div>`;
  }

  function bind(el) {
    el.querySelectorAll('[data-pick]').forEach(sel => {
      sel.onchange = () => {
        T.store.set({ [sel.dataset.pick]: Number(sel.value) });
        T.router.refresh();
      };
    });
  }

  T.picker = { html, bind };
})(window.TSTB);
