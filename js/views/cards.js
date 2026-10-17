// Thẻ tiến hoá: bộ thẻ, thẻ từng học sinh đang giữ và lịch sử dùng thẻ
(function (T) {
  'use strict';
  const { esc } = T.ui;

  const dateText = ms => (ms ? T.time.fmt(ms) : '');

  const RESULT = {
    used: '<span class="atp">Đã dùng</span>',
    expired: '<span class="muted">Hết hạn, tự xoá</span>',
    removed: '<span class="muted">Giáo viên xoá</span>',
    revoked: '<span class="muted">Giáo viên xoá, trả lại lượt lật</span>'
  };

  // Lý do không hoàn tác được (T.evolutions.restoreBlock)
  const BLOCKED = {
    held: 'học sinh đang giữ một lá cùng loại',
    archived: 'loại thẻ này đang ở thùng rác (Cài đặt → Thẻ tiến hoá → Thùng rác)',
    'no-flip': 'học sinh đã dùng lượt được trả lại để lật thẻ khác',
    expired: 'thẻ đã hết hạn',
    missing: 'không tìm thấy lượt này'
  };

  function render(el) {
    const year = T.schoolYear.range().label;
    const cls = T.store.currentClass();
    const classes = T.classes.list();
    const students = cls ? T.students.list(cls.id) : [];
    const cards = T.cards.list();
    const held = cls ? T.evolutions.heldByClass(cls.id) : {};
    const flips = cls ? T.evolutions.flipsByClass(cls.id) : {};
    const totals = cls ? T.atp.totalsByClass(cls.id) : {};
    const history = cls ? T.evolutions.history(cls.id, 30) : [];
    const threshold = T.evolutions.threshold();

    el.innerHTML = `
      <header class="page-head">
        <div><h1>🃏 Thẻ tiến hoá</h1>
          <p>Cứ <span class="atp">${threshold} ATP</span> trong năm học, học sinh được lật 1 thẻ.
            Mỗi loại thẻ chỉ giữ 1 lá, có hạn dùng và không dùng được trong tuần vừa nhận.</p></div>
        <a class="btn ghost" href="#/cai-dat">Sửa bộ thẻ</a>
      </header>
      ${cards.length ? T.ui.cardGroups(cards, { skipEmpty: true, foot: c => `<span class="muted">${T.cards.expiryLabel(c)}</span>` })
      : T.ui.empty('🃏', 'Chưa có thẻ tiến hoá', 'Thêm thẻ trong phần Cài đặt → Thẻ tiến hoá.')}
      ${cls ? `<div class="panel">
        <div class="panel-head">
          <h2>Thẻ của học sinh <small class="muted">· năm học ${year} · bấm vào một em để xem, dùng hoặc sửa thẻ</small></h2>
          <select id="cardClass">${classes.map(c =>
            `<option value="${c.id}" ${c.id === cls.id ? 'selected' : ''}>${esc((c.icon || '🌿') + ' ' + c.name)}</option>`).join('')}</select>
        </div>
        ${students.length ? `<table class="table pick"><thead><tr><th>Học sinh</th><th>ATP năm học</th><th>Thẻ đang giữ</th><th></th></tr></thead>
          <tbody>${students.map(s => {
            const mine = held[s.id] || [];
            const left = T.evolutions.pending(totals[s.id] || 0, flips[s.id]);
            return `<tr data-id="${s.id}">
              <td><b>${esc(s.name)}</b></td><td class="atp">${totals[s.id] || 0}</td>
              <td>${mine.length ? `<div class="held-chips">${mine.map(c =>
                `<span class="chip" title="${esc(c.description)} · ${T.evolutions.expiryText(c)}">${esc(c.icon || '🃏')} ${esc(c.name)}</span>`).join('')}</div>`
                : '<span class="muted">—</span>'}</td>
              <td class="row-actions">${left ? `<button type="button" class="btn sm evo-btn" data-act="evolve">🧬 Lật thẻ${left > 1 ? ` (×${left})` : ''}</button>` : ''}</td>
            </tr>`;
          }).join('')}</tbody></table>`
        : '<p class="muted">Lớp này chưa có học sinh.</p>'}
      </div>
      ${history.length ? `<div class="panel">
        <h2>Lịch sử thẻ <small class="muted">· ${history.length} lượt gần nhất</small></h2>
        <table class="table"><thead><tr><th>Học sinh</th><th>Thẻ</th><th>Kết quả</th><th>Ngày</th><th></th></tr></thead>
          <tbody>${history.map(h => `<tr data-grant="${h.grant_id}">
            <td>${esc(h.student_name)}</td><td>${esc(h.icon || '🃏')} ${esc(h.name)}</td>
            <td>${RESULT[h.status] || ''}</td>
            <td class="muted">${dateText(h.used_at || h.expires_at)}</td>
            <td class="row-actions">${h.status !== 'expired' ? '<button type="button" class="btn sm ghost" data-act="unuse">Hoàn tác</button>' : ''}</td>
          </tr>`).join('')}</tbody></table>
      </div>` : ''}` : ''}`;

    const sel = el.querySelector('#cardClass');
    if (sel) sel.onchange = () => { T.store.set({ classId: Number(sel.value) }); T.router.refresh(); };

    const refresh = () => T.router.refresh();
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (btn && btn.dataset.act === 'unuse') {
        const id = Number(btn.closest('tr').dataset.grant);
        const why = T.evolutions.restoreBlock(id);
        if (why) T.ui.toast('Không hoàn tác được: ' + BLOCKED[why], 'warn');
        else T.evolutions.unuse(id);
        return refresh();
      }
      const row = e.target.closest('tr[data-id]');
      if (!row) return;
      const s = students.find(x => x.id === Number(row.dataset.id));
      if (btn && btn.dataset.act === 'evolve') return T.evolve.open(s, refresh);
      T.evolve.board(s, refresh);
    });
  }

  T.router.register('the-bai', { label: 'Thẻ tiến hoá', icon: '🃏', render });
})(window.TSTB);
