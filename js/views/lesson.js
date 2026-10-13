// Tiết học: chấm ATP theo cá nhân hoặc theo nhóm
(function (T) {
  'use strict';
  const { esc } = T.ui;

  const QUICK = ['speak', 'score_8_9', 'score_9_plus'];
  let mode = 'solo'; // 'solo' | 'group'
  let selected = new Set();
  let search = '';
  let lastLesson = null;

  function studentHtml(s, ctx) {
    const total = ctx.totals[s.id] || 0;
    const inLesson = ctx.inLesson[s.id] || 0;
    const held = ctx.held[s.id] || [];
    const left = ctx.pendingOf(s.id);
    // Tiến độ tới mốc tiến hoá kế tiếp trong năm
    const into = ((total % ctx.threshold) + ctx.threshold) % ctx.threshold;
    const pct = left ? 100 : (into / ctx.threshold) * 100;
    const status = left
      ? `<button type="button" class="btn sm evo-btn" data-act="evolve">🧬 Lật thẻ tiến hoá${left > 1 ? ` (×${left})` : ''}</button>`
      : `<small class="stu-next">Còn ${ctx.threshold - into} ATP để tiến hoá</small>`;
    return `<div class="stu ${selected.has(s.id) ? 'sel' : ''}" data-id="${s.id}" data-name="${esc(s.name.toLowerCase())}">
      <div class="stu-top">
        <label>
          <input type="checkbox" data-act="sel" ${selected.has(s.id) ? 'checked' : ''}>
          <span class="stu-name">${esc(s.name)}</span>
        </label>
        <button type="button" class="evo-own ${held.length ? '' : 'none'}" data-act="board"
          title="${esc(held.map(c => c.name).join(', ') || 'Chưa có thẻ')}">🃏 ${held.length}</button>
      </div>
      <div class="stu-atp"><b>${total}</b> ATP ${inLesson ? `<small>${inLesson > 0 ? '+' : ''}${inLesson} tiết này</small>` : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${status}
      <div class="stu-btns">
        ${QUICK.map(t => `<button type="button" class="btn sm q-${t}" data-act="${t}" title="${T.atp.TYPES[t].label}">
          ${T.atp.TYPES[t].icon} +${T.atp.amountFor(t)}</button>`).join('')}
        <button type="button" class="btn sm ghost" data-act="manual" title="Cộng / trừ tuỳ ý">✎</button>
      </div>
    </div>`;
  }

  function showHistory(lesson) {
    const rows = T.atp.history(lesson.id);
    const body = document.createElement('div');
    body.innerHTML = rows.length
      ? `<table class="table"><thead><tr><th>Học sinh</th><th>Loại</th><th>ATP</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${esc(r.student_name)}</td>
          <td>${T.atp.TYPES[r.type].icon} ${T.atp.TYPES[r.type].label}${r.group_name ? ` <span class="muted">· ${esc(r.group_name)}</span>` : ''}</td>
          <td class="atp">${r.amount > 0 ? '+' : ''}${r.amount}</td>
          <td class="muted">${esc(r.note)}</td>
          <td><button type="button" class="btn sm ghost" data-del="${r.id}">Xoá</button></td>
        </tr>`).join('')}</tbody></table>`
      : '<p class="muted">Tiết này chưa có lượt cộng ATP nào.</p>';
    const m = T.ui.modal({ title: 'Lịch sử · ' + T.lessons.label(lesson), body, wide: true, onClose: () => T.router.refresh() });
    body.onclick = e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      T.atp.removeEvent(Number(b.dataset.del));
      m.close();
      showHistory(lesson);
    };
  }

  // Chế độ cá nhân
  function renderSolo(body, ctx) {
    body.innerHTML = `
      <div class="toolbar">
        <input type="search" class="search" placeholder="🔍 Tìm học sinh…" value="${esc(search)}">
        <button type="button" class="btn sm ghost" data-act="all">Chọn tất cả</button>
        <button type="button" class="btn sm ghost" data-act="none">Bỏ chọn</button>
        <span class="bulk">
          <span class="muted" id="selCount"></span>
          ${QUICK.map(t => `<button type="button" class="btn sm q-${t}" data-bulk="${t}">${T.atp.TYPES[t].icon} ${T.atp.TYPES[t].label}</button>`).join('')}
          <button type="button" class="btn sm ghost" data-bulk="manual">✎ Tuỳ ý</button>
        </span>
      </div>
      <div class="stu-grid">${ctx.students.map(s => studentHtml(s, ctx)).join('')}</div>`;

    const applySearch = () => {
      const k = search.trim().toLowerCase();
      body.querySelectorAll('.stu').forEach(n => { n.hidden = !!k && !n.dataset.name.includes(k); });
    };
    const updateCount = () => {
      body.querySelector('#selCount').textContent =
        selected.size ? `Đã chọn ${selected.size}:` : 'Chọn nhiều em để cộng cùng lúc:';
    };
    applySearch();
    updateCount();

    const input = body.querySelector('.search');
    input.oninput = () => { search = input.value; applySearch(); };

    async function give(ids, type) {
      let opts;
      if (type === 'manual') {
        opts = await T.askManual();
        if (!opts) return;
      }
      T.award(ids, ctx.lesson.id, type, opts);
    }

    body.addEventListener('change', e => {
      if (e.target.dataset.act !== 'sel') return;
      const box = e.target.closest('.stu');
      const id = Number(box.dataset.id);
      if (e.target.checked) selected.add(id); else selected.delete(id);
      box.classList.toggle('sel', e.target.checked);
      updateCount();
    });

    body.addEventListener('click', e => {
      const bulk = e.target.closest('[data-bulk]');
      if (bulk) { give(Array.from(selected), bulk.dataset.bulk); return; }

      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'all' || act === 'none') {
        selected = new Set(act === 'all'
          ? Array.from(body.querySelectorAll('.stu:not([hidden])')).map(n => Number(n.dataset.id)) : []);
        return T.router.refresh();
      }
      const id = Number(btn.closest('.stu').dataset.id);
      if (act === 'evolve') return ctx.openEvolve(id);
      if (act === 'board') return T.evolve.board(ctx.byId[id], () => T.router.refresh());
      give([id], act);
    });
  }

  function render(el) {
    const cls = T.store.currentClass();
    if (!cls) {
      el.innerHTML = T.ui.empty('🌱', 'Chưa có lớp học', 'Tạo lớp và thêm học sinh trong phần Cài đặt.',
        '<a class="btn" href="#/cai-dat">Tới Cài đặt</a>');
      return;
    }
    const lesson = T.lessons.current();
    if (lastLesson !== lesson.id) { selected = new Set(); lastLesson = lesson.id; }

    const students = T.students.list(cls.id);
    const byId = {};
    students.forEach(s => { byId[s.id] = s; });
    const totals = T.atp.totalsByClass(cls.id);
    const inLesson = T.atp.totalsByLesson(lesson.id);
    const held = T.evolutions.heldByClass(cls.id);
    const flips = T.evolutions.flipsByClass(cls.id);
    const school = T.schoolYear.range();
    const threshold = T.evolutions.threshold();
    const pendingOf = id => T.evolutions.pending(totals[id] || 0, flips[id]);
    const ready = new Set(students.filter(s => pendingOf(s.id) > 0).map(s => s.id));
    const lessonSum = Object.values(inLesson).reduce((a, b) => a + b, 0);

    el.innerHTML = `
      <header class="page-head">
        <div><h1>⚡ ${esc(cls.icon || '🌿')} ${esc(cls.name)}</h1>
          <p>${T.lessons.label(lesson)} · <span class="atp">${lessonSum} ATP</span> trong tiết
            · cứ <span class="atp">${threshold} ATP</span> trong năm học ${school.label} được lật 1 thẻ</p></div>
        <div class="head-actions">
          <div class="seg">
            <button type="button" data-mode="solo" class="${mode === 'solo' ? 'on' : ''}">🧑‍🎓 Cá nhân</button>
            <button type="button" data-mode="group" class="${mode === 'group' ? 'on' : ''}">🐾 Nhóm</button>
          </div>
          <button type="button" class="btn ghost" data-head="history">📜 Lịch sử</button>
          <button type="button" class="btn ghost" data-head="undo">↩ Hoàn tác</button>
        </div>
      </header>
      ${T.picker.html()}
      ${T.time.today() < school.start ? `<div class="notice">⚠️ Năm học ${school.label} bắt đầu từ ${T.time.fmtDate(school.start)}.
        ATP ghi trước ngày đó không được tính vào năm học — chỉnh ngày trong <a href="#/cai-dat">Cài đặt</a> nếu cần.</div>` : ''}
      <div class="lesson-body"></div>`;

    T.picker.bind(el);

    el.querySelector('.page-head').onclick = e => {
      const m = e.target.closest('[data-mode]');
      if (m) { mode = m.dataset.mode; return T.router.refresh(); }
      const b = e.target.closest('[data-head]');
      if (!b) return;
      if (b.dataset.head === 'history') return showHistory(lesson);
      const n = T.atp.undoLast(lesson.id);
      T.ui.toast(n ? `Đã hoàn tác ${n} lượt cộng` : 'Không có gì để hoàn tác', n ? '' : 'warn');
      T.router.refresh();
    };

    const body = el.querySelector('.lesson-body');
    if (!students.length) {
      body.innerHTML = T.ui.empty('🧑‍🎓', 'Lớp chưa có học sinh', 'Thêm học sinh hoặc import từ Excel trong phần Cài đặt.',
        '<a class="btn" href="#/cai-dat">Tới Cài đặt</a>');
      return;
    }
    const ctx = {
      cls, lesson, students, byId, totals, inLesson, held, threshold, ready, pendingOf,
      openEvolve: id => T.evolve.open(byId[id], () => T.router.refresh())
    };
    if (mode === 'group') T.groupBoard.render(body, ctx);
    else renderSolo(body, ctx);
  }

  T.router.register('tiet', { label: 'Tiết học', icon: '⚡', render });
})(window.TSTB);
