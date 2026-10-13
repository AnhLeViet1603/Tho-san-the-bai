// Bảng chia nhóm, hiển thị bên trong tab Tiết học (chế độ Nhóm)
(function (T) {
  'use strict';
  const { esc } = T.ui;

  const TYPES = ['speak', 'score_8_9', 'score_9_plus'];
  const MEDALS = ['🥇', '🥈', '🥉'];

  // ctx: { lesson, students, byId, ready } do views/lesson.js truyền vào
  function render(body, ctx) {
    const { lesson, students, byId } = ctx;
    const groups = T.groups.list(lesson.id);
    const scores = T.groups.scores(lesson.id);
    const assigned = new Set();
    groups.forEach(g => g.members.forEach(id => assigned.add(id)));
    const pool = students.filter(s => !assigned.has(s.id));
    const rank = groups.map(g => scores[g.id] || 0).filter(v => v > 0).sort((a, b) => b - a);

    const chip = s => ctx.ready.has(s.id)
      ? `<span class="chip ready" draggable="true" data-stu="${s.id}" title="Đủ ATP — về chế độ Cá nhân để lật thẻ tiến hoá">🧬 ${esc(s.name)}</span>`
      : `<span class="chip" draggable="true" data-stu="${s.id}">${esc(s.name)}</span>`;

    body.innerHTML = `
      <div class="toolbar">
        <label class="inline">Số nhóm <input type="number" id="groupCount" min="1" max="20" value="${groups.length || 4}"></label>
        <button type="button" class="btn sm" data-act="create">Tạo nhóm</button>
        <button type="button" class="btn sm" data-act="shuffle">🎲 Chia ngẫu nhiên</button>
        <button type="button" class="btn sm ghost" data-act="copy">Chép từ tiết trước</button>
        <button type="button" class="btn sm ghost" data-act="clear">Xoá tất cả nhóm</button>
        <span class="muted bulk">Kéo thả học sinh vào nhóm, rồi cộng ATP cho cả nhóm.</span>
      </div>
      <div class="board">
        <section class="group pool" data-group="">
          <header><b>Chưa có nhóm</b><span class="muted">${pool.length}</span></header>
          <div class="chips">${pool.map(chip).join('') || '<span class="muted">Trống</span>'}</div>
        </section>
        ${groups.map(g => {
          const score = scores[g.id] || 0;
          const medal = score > 0 ? (MEDALS[rank.indexOf(score)] || '') : '';
          return `<section class="group" data-group="${g.id}" style="--accent:${esc(g.color || '#5fe08a')}">
            <header>
              <b data-act="rename" title="Bấm để đổi tên">${medal} ${esc(g.name)}</b>
              <span class="atp">⚡ ${score}</span>
              <button type="button" class="x" data-act="remove" title="Xoá nhóm">✕</button>
            </header>
            <div class="chips">${g.members.filter(id => byId[id]).map(id => chip(byId[id])).join('') || '<span class="muted">Kéo học sinh vào đây</span>'}</div>
            <footer>
              ${TYPES.map(t => `<button type="button" class="btn sm q-${t}" data-give="${t}" title="${T.atp.TYPES[t].label}">
                ${T.atp.TYPES[t].icon} +${T.atp.amountFor(t)}</button>`).join('')}
              <button type="button" class="btn sm ghost" data-give="manual">✎</button>
            </footer>
          </section>`;
        }).join('')}
      </div>`;

    const refresh = () => T.router.refresh();

    // Kéo thả
    body.addEventListener('dragstart', e => {
      const c = e.target.closest('[data-stu]');
      if (c) e.dataTransfer.setData('text/plain', c.dataset.stu);
    });
    body.addEventListener('dragover', e => {
      const g = e.target.closest('.group');
      if (g) { e.preventDefault(); g.classList.add('over'); }
    });
    body.addEventListener('dragleave', e => {
      const g = e.target.closest('.group');
      if (g && !g.contains(e.relatedTarget)) g.classList.remove('over');
    });
    body.addEventListener('drop', e => {
      const g = e.target.closest('.group');
      const sid = Number(e.dataTransfer.getData('text/plain'));
      if (!g || !sid) return;
      e.preventDefault();
      T.groups.setMember(lesson.id, sid, Number(g.dataset.group) || null);
      refresh();
    });

    body.addEventListener('click', async e => {
      const give = e.target.closest('[data-give]');
      if (give) {
        const g = groups.find(x => x.id === Number(give.closest('.group').dataset.group));
        const ids = g.members.filter(id => byId[id]);
        if (!ids.length) { T.ui.toast('Nhóm chưa có thành viên', 'warn'); return; }
        const type = give.dataset.give;
        let opts = { groupId: g.id };
        if (type === 'manual') {
          const m = await T.askManual();
          if (!m) return;
          opts = Object.assign(opts, m);
        }
        return T.award(ids, lesson.id, type, opts);
      }

      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const box = btn.closest('.group');
      const gid = box ? Number(box.dataset.group) : null;
      const count = () => Math.max(1, Math.min(20, Number(body.querySelector('#groupCount').value) || 1));

      if (act === 'create') {
        T.groups.ensureCount(lesson, count());
      } else if (act === 'shuffle') {
        if (!groups.length) T.groups.ensureCount(lesson, count());
        T.groups.shuffle(lesson.id, students.map(s => s.id));
      } else if (act === 'copy') {
        if (!T.groups.copyFromPrevious(lesson)) { T.ui.toast('Chưa có tiết nào khác đã chia nhóm', 'warn'); return; }
      } else if (act === 'clear') {
        if (!groups.length) return;
        if (!(await T.ui.confirm('Xoá tất cả nhóm của tiết này? ATP đã cộng vẫn được giữ cho từng học sinh.', { danger: true }))) return;
        T.groups.clear(lesson.id);
      } else if (act === 'remove') {
        T.groups.remove(gid);
      } else if (act === 'rename') {
        const g = groups.find(x => x.id === gid);
        const v = await T.ui.form('Đổi tên nhóm', [{ name: 'name', label: 'Tên nhóm', value: g.name, required: true }]);
        if (!v) return;
        T.groups.rename(gid, v.name);
      }
      refresh();
    });
  }

  T.groupBoard = { render };
})(window.TSTB);
