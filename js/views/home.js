// Khu rừng: lưới các lớp học
(function (T) {
  'use strict';
  const { esc } = T.ui;

  function render(el) {
    const school = T.schoolYear.range();
    const classes = T.classes.list();
    el.innerHTML = `
      <header class="page-head">
        <div><h1>🌳 Khu rừng tiến hoá</h1><p>Năm học ${school.label} (${T.time.fmtDate(school.start)} – ${T.time.fmtDate(school.end)}) · chọn một lớp để bắt đầu săn ATP.</p></div>
        <a class="btn" href="#/cai-dat">＋ Quản lý lớp</a>
      </header>
      ${classes.length ? `<div class="class-grid">${classes.map(c => `
        <button type="button" class="class-card" data-class="${c.id}" style="--accent:${esc(c.color || '#5fe08a')}">
          <span class="class-ico">${esc(c.icon || '🌿')}</span>
          <b>${esc(c.name)}</b>
          ${c.note ? `<small>${esc(c.note)}</small>` : ''}
          <div class="class-meta">
            <span>🧑‍🎓 ${c.student_count} học sinh</span>
            <span class="atp">⚡ ${c.atp_total} ATP</span>
          </div>
        </button>`).join('')}</div>`
      : T.ui.empty('🌱', 'Khu rừng còn trống', 'Hãy tạo lớp học đầu tiên trong phần Cài đặt.',
        '<a class="btn" href="#/cai-dat">Tới Cài đặt</a>')}`;

    el.onclick = e => {
      const card = e.target.closest('[data-class]');
      if (!card) return;
      T.store.set({ classId: Number(card.dataset.class) });
      T.router.go('tiet');
    };
  }

  T.router.register('rung', { label: 'Khu rừng', icon: '🌳', render });
})(window.TSTB);
