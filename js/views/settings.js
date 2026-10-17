// Cài đặt tổng: lớp, học sinh, ATP & Excel, thẻ bài, dữ liệu
(function (T) {
  'use strict';
  const { esc } = T.ui;

  const TABS = [
    ['classes', '🌿 Lớp học'],
    ['students', '🧑‍🎓 Học sinh'],
    ['atp', '⚡ ATP, tiến hoá & Excel'],
    ['cards', '🃏 Thẻ tiến hoá'],
    ['data', '💾 Dữ liệu']
  ];
  let tab = 'classes';
  // Tab con đang mở của từng tab (nhớ trong phiên làm việc)
  const sub = { classes: 'active', students: 'active', cards: 'active', data: 'backup' };
  const refresh = () => T.router.refresh();

  // Thanh tab con: bấm thì đổi sub[key] và vẽ lại (xử lý ở render())
  const subTabs = (key, items) => T.ui.subTabs(items, sub[key], key + ':');

  // Mở thẳng một tab / tab con của Cài đặt từ chỗ khác (ví dụ thanh bên → Dữ liệu › Sao lưu)
  function open(nextTab, nextSub) {
    tab = nextTab;
    if (nextSub) sub[nextTab] = nextSub;
    if (location.hash === '#/cai-dat') refresh(); else location.hash = '#/cai-dat';
  }

  // ---------- Lớp học ----------
  async function classForm(c) {
    const v = await T.ui.form(c ? 'Sửa lớp' : 'Thêm lớp', [
      { name: 'name', label: 'Tên lớp', value: c && c.name, required: true, placeholder: 'Ví dụ: 10A1' },
      { name: 'icon', label: 'Icon', type: 'emoji', value: (c && c.icon) || '🌿', choices: T.classes.ICONS },
      { name: 'color', label: 'Màu', type: 'color', value: (c && c.color) || '#5fe08a' },
      { name: 'note', label: 'Ghi chú', value: c && c.note, placeholder: 'Ví dụ: Sinh học 10 – sáng thứ 3' }
    ]);
    if (!v) return;
    const id = T.classes.save(Object.assign({ id: c && c.id }, v));
    if (!c) T.store.set({ classId: id });
    refresh();
  }

  function tabClasses(body) {
    const year = T.schoolYear.range().label;
    const classes = T.classes.list();
    const trash = T.classes.trash();
    const tabs = subTabs('classes', [['active', `🌿 Đang dùng (${classes.length})`], ['trash', `🗑 Thùng rác (${trash.length})`]]);
    body.innerHTML = sub.classes === 'trash' ? `${tabs}
      ${trash.length ? `<p class="muted">Lớp trong thùng rác không hiện ở đâu cả (kể cả Thống kê) nhưng dữ liệu còn nguyên. Khôi phục để dùng lại.</p>
        <table class="table trash-table"><thead><tr><th>Lớp</th><th>Sĩ số</th><th>Xoá lúc</th><th></th></tr></thead>
        <tbody>${trash.map(c => `<tr>
          <td>${esc(c.icon || '🌿')} <b>${esc(c.name)}</b></td><td>${c.student_count}</td><td>${T.time.fmt(c.archived_at)}</td>
          <td class="row-actions">
            <button type="button" class="btn sm ghost" data-act="restore-class" data-cid="${c.id}">↺ Khôi phục</button>
            <button type="button" class="btn sm danger" data-act="purge-class" data-cid="${c.id}">Xoá vĩnh viễn</button>
          </td></tr>`).join('')}</tbody></table>`
      : T.ui.empty('🗑', 'Thùng rác trống', 'Lớp bị xoá sẽ nằm ở đây và khôi phục được.')}` : `${tabs}
      <div class="panel-head"><h2>Lớp học</h2><button type="button" class="btn" data-act="add">＋ Thêm lớp</button></div>
      ${classes.length ? `<table class="table"><thead><tr><th></th><th>Tên lớp</th><th>Sĩ số</th><th>ATP ${year}</th><th>Ghi chú</th><th></th></tr></thead>
        <tbody>${classes.map((c, i) => `<tr data-id="${c.id}">
          <td><span class="dot" style="background:${esc(c.color || '#5fe08a')}"></span> ${esc(c.icon || '🌿')}</td>
          <td><b>${esc(c.name)}</b></td><td>${c.student_count}</td><td class="atp">${c.atp_total}</td>
          <td class="muted">${esc(c.note)}</td>
          <td class="row-actions">
            <button type="button" class="btn sm ghost" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn sm ghost" data-act="down" ${i === classes.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn sm ghost" data-act="students">Học sinh</button>
            <button type="button" class="btn sm ghost" data-act="edit">Sửa</button>
            <button type="button" class="btn sm danger" data-act="del">Xoá</button>
          </td></tr>`).join('')}</tbody></table>`
      : T.ui.empty('🌱', 'Chưa có lớp nào', 'Bấm “Thêm lớp” để gieo hạt giống đầu tiên.')}`;

    body.onclick = async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'add') return classForm(null);
      if (act === 'restore-class') {
        T.classes.restore(Number(btn.dataset.cid));
        T.ui.toast('Đã khôi phục lớp');
        return refresh();
      }
      if (act === 'purge-class') {
        const t = trash.find(x => x.id === Number(btn.dataset.cid));
        if (!(await T.ui.confirm(`Xoá VĨNH VIỄN lớp ${t.name}? Toàn bộ ${t.student_count} học sinh, tiết học, ATP và thẻ của lớp sẽ mất hẳn.`,
          { danger: true, okLabel: 'Xoá vĩnh viễn' }))) return;
        T.classes.remove(t.id);
        return refresh();
      }
      const id = Number(btn.closest('tr').dataset.id);
      const c = classes.find(x => x.id === id);
      if (act === 'edit') return classForm(c);
      if (act === 'up' || act === 'down') T.classes.move(id, act === 'up' ? -1 : 1);
      if (act === 'students') { T.store.set({ classId: id }); tab = 'students'; }
      if (act === 'del') {
        if (!(await T.ui.confirm(
          `Chuyển lớp ${c.name} vào thùng rác? Lớp sẽ ẩn khỏi mọi màn hình; dữ liệu còn nguyên và khôi phục được ở tab “Thùng rác”.`,
          { danger: true, okLabel: 'Chuyển vào thùng rác' }))) return;
        T.classes.archive(id);
      }
      refresh();
    };
  }

  // ---------- Học sinh ----------
  function tabStudents(body) {
    const cls = T.store.currentClass();
    if (!cls) {
      body.innerHTML = T.ui.empty('🌱', 'Chưa có lớp nào', 'Hãy tạo lớp trước khi thêm học sinh.');
      return;
    }
    const students = T.students.list(cls.id, true);
    const trash = T.students.trash(cls.id);
    const year = T.schoolYear.range().label;
    const totals = T.atp.totalsByClass(cls.id);
    const tabs = subTabs('students', [['active', `🧑‍🎓 Danh sách (${students.length})`], ['trash', `🗑 Thùng rác (${trash.length})`]]);
    const trashHtml = trash.length ? `<p class="muted">Học sinh trong thùng rác không hiện ở đâu cả (kể cả Thống kê) nhưng ATP,
        thẻ và nhóm của em còn nguyên. Khôi phục để dùng lại.</p>
      <table class="table student-trash-table"><thead><tr><th>Họ tên</th><th>ATP ${year}</th><th>Lượt lật</th><th>Xoá lúc</th><th></th></tr></thead>
        <tbody>${trash.map(s => `<tr data-id="${s.id}">
          <td>${esc(s.name)}</td><td class="atp">${totals[s.id] || 0}</td><td>${s.flips}</td><td>${T.time.fmt(s.archived_at)}</td>
          <td class="row-actions">
            <button type="button" class="btn sm ghost" data-act="restore-student">↺ Khôi phục</button>
            <button type="button" class="btn sm danger" data-act="purge-student">Xoá vĩnh viễn</button>
          </td></tr>`).join('')}</tbody></table>`
      : T.ui.empty('🗑', 'Thùng rác trống', 'Học sinh bị xoá sẽ nằm ở đây và khôi phục được.');
    body.innerHTML = `
      <div class="panel-head">
        <h2>Học sinh</h2>
        <select id="stuClass">${T.classes.list().map(c =>
          `<option value="${c.id}" ${c.id === cls.id ? 'selected' : ''}>${esc((c.icon || '🌿') + ' ' + c.name)}</option>`).join('')}</select>
        <button type="button" class="btn" data-act="import">📥 Import Excel</button>
      </div>
      ${tabs}
      ${sub.students === 'trash' ? trashHtml : `<form class="add-row" id="addStudent">
        <input name="name" placeholder="Nhập tên học sinh rồi Enter…" required>
        <button class="btn">＋ Thêm</button>
      </form>
      ${students.length ? `<table class="table"><thead><tr><th>#</th><th>Họ tên</th><th>ATP ${year}</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${students.map((s, i) => `<tr data-id="${s.id}" class="${s.active ? '' : 'off'}">
          <td>${i + 1}</td><td>${esc(s.name)}</td><td class="atp">${totals[s.id] || 0}</td>
          <td>${s.active ? 'Đang học' : '<span class="muted">Đã ẩn</span>'}</td>
          <td class="row-actions">
            <button type="button" class="btn sm ghost" data-act="rename">Sửa</button>
            <button type="button" class="btn sm ghost" data-act="toggle">${s.active ? 'Ẩn' : 'Hiện'}</button>
            <button type="button" class="btn sm danger" data-act="del">Xoá</button>
          </td></tr>`).join('')}</tbody></table>`
      : T.ui.empty('🧑‍🎓', 'Lớp chưa có học sinh', 'Nhập tên ở trên hoặc import danh sách từ file Excel.')}`}`;

    body.querySelector('#stuClass').onchange = e => { T.store.set({ classId: Number(e.target.value) }); refresh(); };
    const addForm = body.querySelector('#addStudent');
    if (addForm) addForm.onsubmit = e => {
      e.preventDefault();
      const name = e.target.elements.name.value.replace(/\s+/g, ' ').trim();
      if (!name) return;
      T.students.add(cls.id, name);
      refresh();
      setTimeout(() => { const i = document.querySelector('#addStudent input'); if (i) i.focus(); });
    };
    body.onclick = async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'import') return T.excelImport.open(cls.id, refresh);
      const id = Number(btn.closest('tr').dataset.id);
      if (act === 'restore-student') {
        T.students.restore(id);
        T.ui.toast('Đã khôi phục học sinh');
        return refresh();
      }
      if (act === 'purge-student') {
        const t = trash.find(x => x.id === id);
        if (!(await T.ui.confirm(`Xoá VĨNH VIỄN ${t.name}? ATP, thẻ và lịch sử của em sẽ mất hẳn.`,
          { danger: true, okLabel: 'Xoá vĩnh viễn' }))) return;
        T.students.purge(id);
        return refresh();
      }
      const s = students.find(x => x.id === id);
      if (act === 'rename') {
        const v = await T.ui.form('Sửa tên học sinh', [{ name: 'name', label: 'Họ tên', value: s.name, required: true }]);
        if (!v) return;
        T.students.rename(id, v.name);
      } else if (act === 'toggle') {
        T.students.setActive(id, !s.active);
      } else if (act === 'del') {
        if (!(await T.ui.confirm(`Chuyển ${s.name} vào thùng rác? Em sẽ biến khỏi mọi màn hình và thống kê; ATP, thẻ còn nguyên ` +
          'và khôi phục được ở tab “Thùng rác”. (Dùng “Ẩn” nếu em chỉ tạm nghỉ: vẫn hiện trong danh sách này.)',
          { danger: true, okLabel: 'Chuyển vào thùng rác' }))) return;
        T.students.remove(id);
      }
      refresh();
    };
  }

  // ---------- ATP & Excel ----------
  function tabAtp(body) {
    const school = T.schoolYear.get();
    const num = (key, label, hint) => `<div class="field"><span>${label}</span>
      <input type="number" name="${key}" value="${T.settings.num(key, 0)}" required><small>${hint}</small></div>`;
    body.innerHTML = `
      <form id="atpForm" class="form">
        <h2>Năng lượng ATP</h2>
        <div class="row3">
          ${num('atp_speak', '🗣️ ATP cho phát biểu', 'Mỗi lượt phát biểu')}
          ${num('atp_score_8_9', '⭐ ATP cho điểm 8–9', 'Mỗi lần đạt điểm 8–9')}
          ${num('atp_score_9_plus', '🌟 ATP cho điểm 9+', 'Mỗi lần đạt điểm trên 9')}
        </div>
        <p class="muted">Thay đổi chỉ áp dụng cho các lượt cộng mới, lịch sử cũ được giữ nguyên.</p>
        <h2>Năm học</h2>
        <div class="row3">
          <div class="field"><span>📅 Ngày bắt đầu năm học</span>
            <input type="date" name="school_start" required value="${school.start}"></div>
          <div class="field"><span>📅 Ngày kết thúc năm học</span>
            <input type="date" name="school_end" required value="${school.end}"></div>
        </div>
        <p class="muted">ATP và lượt lật thẻ chỉ tính các lượt ghi trong khoảng này (ngày theo giờ Việt Nam, UTC+7).
          Qua ngày kết thúc, ứng dụng tự chuyển sang năm học kế tiếp và ATP được tính lại từ 0; dữ liệu cũ vẫn xem được ở Thống kê.</p>
        <h2>Tiến hoá</h2>
        <div class="row3">
          <div class="field"><span>🧬 Mốc ATP tiến hoá</span>
            <input type="number" name="evolve_threshold" min="1" required value="${T.evolutions.threshold()}">
            <small>Cứ mỗi mốc này trong năm học, học sinh được lật 1 thẻ</small></div>
          <div class="field"><span>🃏 Số thẻ úp để chọn (n)</span>
            <input type="number" name="evolve_choices" min="1" required value="${T.evolutions.choices()}">
            <small>Lấy ngẫu nhiên n thẻ học sinh chưa giữ, em lật 1 thẻ</small></div>
        </div>
        <h2>Import Excel</h2>
        <div class="row3">
          <div class="field"><span>Cột lấy tên học sinh</span>
            <input name="excel_name_column" maxlength="3" pattern="[A-Za-z]{1,3}" required
              value="${esc(T.settings.get('excel_name_column', 'A'))}"><small>Chữ cái của cột: A, B, C…</small></div>
          <div class="field"><span>Số dòng tiêu đề bỏ qua</span>
            <input type="number" name="excel_header_rows" min="0" required value="${T.settings.num('excel_header_rows', 1)}">
            <small>Số dòng đầu không phải tên học sinh</small></div>
        </div>
        <div><button class="btn">Lưu cài đặt</button></div>
      </form>`;
    body.querySelector('#atpForm').onsubmit = async e => {
      e.preventDefault();
      const els = e.target.elements;
      if (els.school_start.value >= els.school_end.value) {
        T.ui.toast('Ngày kết thúc năm học phải sau ngày bắt đầu', 'error');
        return;
      }
      const nextThreshold = Math.max(1, Math.trunc(Number(els.evolve_threshold.value) || 1));
      if (nextThreshold !== T.evolutions.threshold()) {
        const imp = T.evolutions.thresholdImpact(nextThreshold);
        const parts = [];
        if (imp.more) parts.push(`${imp.more} học sinh có thêm tổng cộng ${imp.extra} lượt lật thẻ`);
        if (imp.over) parts.push(`${imp.over} học sinh thành ra đã lật nhiều thẻ hơn số lượt được hưởng (thẻ đã lật vẫn giữ nguyên, các em chỉ lật tiếp khi đủ ATP)`);
        if (parts.length && !(await T.ui.confirm(
          `Đổi mốc ATP từ ${T.evolutions.threshold()} thành ${nextThreshold} sẽ tính lại lượt lật cho cả năm học: ${parts.join('; ')}. Vẫn lưu?`,
          { title: 'Đổi mốc ATP tiến hoá', okLabel: 'Vẫn lưu' }))) return;
      }
      const LOGGED = { atp_speak: 'ATP phát biểu', atp_score_8_9: 'ATP điểm 8–9', atp_score_9_plus: 'ATP điểm 9+',
        evolve_threshold: 'Mốc ATP tiến hoá', evolve_choices: 'Số thẻ úp', school_start: 'Bắt đầu năm học', school_end: 'Kết thúc năm học' };
      const snapshot = () => Object.assign(
        Object.fromEntries(Object.keys(LOGGED).filter(k => !k.startsWith('school_')).map(k => [k, T.settings.get(k)])),
        { school_start: T.schoolYear.get().start, school_end: T.schoolYear.get().end });
      const before = snapshot();
      T.db.tx(() => {
        T.schoolYear.set(els.school_start.value, els.school_end.value);
        ['atp_speak', 'atp_score_8_9', 'atp_score_9_plus'].forEach(k => T.settings.set(k, Math.trunc(Number(els[k].value) || 0)));
        ['evolve_threshold', 'evolve_choices'].forEach(k => T.settings.set(k, Math.max(1, Math.trunc(Number(els[k].value) || 1))));
        T.settings.set('excel_name_column', els.excel_name_column.value.trim().toUpperCase());
        T.settings.set('excel_header_rows', Math.max(0, Math.trunc(Number(els.excel_header_rows.value) || 0)));
        const after = snapshot();
        const changed = Object.keys(LOGGED).filter(k => String(before[k]) !== String(after[k]));
        if (changed.length) {
          T.audit.log('settings', 'Đổi cài đặt: ' + changed.map(k => `${LOGGED[k]} ${before[k]} → ${after[k]}`).join(', '),
            { before, after });
        }
      });
      T.ui.toast('Đã lưu cài đặt');
      refresh();
    };
  }

  // ---------- Thẻ bài ----------
  async function cardForm(c) {
    const v = await T.ui.form(c ? 'Sửa thẻ tiến hoá' : 'Thêm thẻ tiến hoá', [
      { name: 'name', label: 'Tên thẻ', value: c && c.name, required: true },
      { name: 'description', label: 'Đặc quyền của thẻ', type: 'textarea', value: c && c.description, placeholder: 'Ví dụ: +1 điểm vào bài kiểm tra 15 phút' },
      { name: 'expire_days', label: 'Hạn sử dụng (ngày)', type: 'number', min: 0,
        value: c ? c.expire_days : T.settings.num('card_expire_days', 30), required: true,
        hint: 'Tính từ lúc lật được thẻ; quá hạn mà chưa dùng thì thẻ tự mất. Nhập 0 nếu không giới hạn.' },
      { name: 'icon', label: 'Biểu tượng (dùng khi chưa có ảnh)', type: 'emoji', value: (c && c.icon) || '🃏', choices: T.cards.ICONS },
      { name: 'image_data', label: 'Ảnh lá bài', type: 'image', value: c && c.image_data, hint: 'Ảnh sẽ được thu nhỏ và lưu ngay trong dữ liệu.' }
    ], { wide: true });
    if (!v) return;
    T.cards.save(Object.assign({ id: c && c.id }, v));
    refresh();
  }

  function tabCards(body) {
    const cards = T.cards.list();
    const trash = T.cards.trash();
    const tabs = subTabs('cards', [['active', `🃏 Bộ thẻ (${cards.length})`], ['trash', `🗑 Thùng rác (${trash.length})`]]);
    if (sub.cards === 'trash') return cardTrash(body, tabs, trash);
    body.innerHTML = `${tabs}
      <div class="panel-head"><h2>Thẻ tiến hoá</h2><button type="button" class="btn" data-act="add">＋ Thêm thẻ</button></div>
      <p class="muted">Mỗi thẻ là một đặc quyền thưởng có hạn dùng. Học sinh đạt mốc ATP tiến hoá sẽ lật ngẫu nhiên 1 thẻ trong bộ này.</p>
      <form class="expiry-box" id="expiryForm">
        <div class="field"><span>⏳ Hạn sử dụng thẻ (ngày)</span>
          <input type="number" name="days" min="0" required value="${T.settings.num('card_expire_days', 30)}"></div>
        <button class="btn">Lưu & áp dụng cho tất cả thẻ</button>
        <small class="muted">Tính từ ngày lật được thẻ, hết hạn vào cuối ngày thứ N (giờ Việt Nam); quá hạn chưa dùng thì thẻ tự mất.
          Nhập 0 nếu không giới hạn. Áp dụng cho các lần lật sau, thẻ học sinh đang giữ vẫn theo hạn cũ.
          Muốn đặt hạn riêng cho một thẻ, bấm “Sửa / đổi ảnh” trên thẻ đó.</small>
      </form>
      ${cards.length ? `<div class="pcard-grid">${cards.map(c => T.ui.cardHtml(c, {
        footer: `<span class="muted">${T.cards.expiryLabel(c)}</span>
          <button type="button" class="btn sm ghost" data-act="edit">Sửa / đổi ảnh</button>
          <button type="button" class="btn sm danger" data-act="del">Xoá</button>`
      })).join('')}</div>`
      : T.ui.empty('🃏', 'Chưa có thẻ tiến hoá', 'Thêm thẻ kèm đặc quyền để học sinh có thể lật.')}`;
    body.querySelector('#expiryForm').onsubmit = e => {
      e.preventDefault();
      const days = Math.max(0, Math.trunc(Number(e.target.elements.days.value) || 0));
      T.db.tx(() => {
        T.settings.set('card_expire_days', days);
        T.db.run('UPDATE cards SET expire_days = ?', [days]);
      });
      T.ui.toast(days ? `Tất cả thẻ có hạn dùng ${days} ngày` : 'Tất cả thẻ không còn hạn dùng');
      refresh();
    };
    body.onclick = async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'add') return cardForm(null);
      const c = cards.find(x => x.id === Number(btn.closest('[data-card]').dataset.card));
      if (btn.dataset.act === 'edit') return cardForm(c);
      const held = T.cards.holders(c.id);
      if (!(await T.ui.confirm(
        `Chuyển thẻ “${c.name}” vào thùng rác?${held ? ` ${held} học sinh đang giữ thẻ này sẽ bị thu lại, nhưng vẫn tính là đã lật (không được lật bù).` : ''} ` +
        'Lịch sử của thẻ được giữ lại; khôi phục ở tab “Thùng rác” thì các lá bị thu được trả lại.',
        { danger: true, okLabel: 'Chuyển vào thùng rác' }))) return;
      T.cards.remove(c.id);
      refresh();
    };
  }

  function cardTrash(body, tabs, trash) {
    body.innerHTML = `${tabs}
      ${trash.length ? `<p class="muted">Loại thẻ trong thùng rác không lật ra được nữa. Khôi phục thì thẻ trở lại bộ thẻ và
        các lá bị thu lúc xoá được trả lại cho học sinh. Chỉ xoá vĩnh viễn được loại thẻ chưa từng phát cho ai.</p>
        <table class="table card-trash-table"><thead><tr><th>Thẻ</th><th>Đã phát</th><th>Xoá lúc</th><th></th></tr></thead>
        <tbody>${trash.map(c => `<tr data-cid="${c.id}">
          <td>${esc(c.icon || '🃏')} <b>${esc(c.name)}</b></td>
          <td>${c.issued} lá${c.returnable ? ` <span class="muted">· ${c.returnable} lá sẽ được trả lại</span>` : ''}</td>
          <td>${c.archived_at ? T.time.fmt(c.archived_at) : ''}</td>
          <td class="row-actions">
            <button type="button" class="btn sm ghost" data-act="restore-card">↺ Khôi phục</button>
            ${c.issued ? '' : '<button type="button" class="btn sm danger" data-act="purge-card">Xoá vĩnh viễn</button>'}
          </td></tr>`).join('')}</tbody></table>`
      : T.ui.empty('🗑', 'Thùng rác trống', 'Thẻ bị xoá khỏi bộ thẻ sẽ nằm ở đây và khôi phục được.')}`;
    body.onclick = async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const c = trash.find(x => x.id === Number(btn.closest('tr').dataset.cid));
      if (btn.dataset.act === 'restore-card') {
        if (!(await T.ui.confirm(`Khôi phục thẻ “${c.name}” vào bộ thẻ?` +
          (c.returnable ? ` ${c.returnable} lá bị thu lúc xoá sẽ được trả lại cho học sinh.` : ''), { okLabel: 'Khôi phục' }))) return;
        const n = T.cards.restore(c.id);
        T.ui.toast(`Đã khôi phục thẻ ${c.name}` + (n ? `, trả lại ${n} lá` : ''));
      } else if (btn.dataset.act === 'purge-card') {
        if (!(await T.ui.confirm(`Xoá VĨNH VIỄN thẻ “${c.name}”?`, { danger: true, okLabel: 'Xoá vĩnh viễn' }))) return;
        T.cards.purge(c.id);
      }
      refresh();
    };
  }

  // ---------- Dữ liệu ----------
  function tabData(body) {
    const tabs = subTabs('data', [['backup', '⬇ Sao lưu'], ['snaps', '📸 Bản chụp'], ['audit', '📜 Nhật ký'], ['danger', '⚠ Xoá dữ liệu']]);
    const SECTIONS = {
      backup: () => `${T.backup.reminderHtml()}
      <h2>Sao lưu & khôi phục</h2>
      <p class="muted">Dữ liệu được lưu trong trình duyệt này (IndexedDB), gắn với vị trí thư mục của ứng dụng.
        Hãy xuất file <b>.sqlite</b> định kỳ để sao lưu, hoặc khi đổi máy, đổi trình duyệt, di chuyển thư mục.</p>
      <p class="muted" id="persistNote" hidden>⚠ Trình duyệt chưa cho phép giữ dữ liệu lâu dài: khi máy thiếu dung lượng,
        dữ liệu có thể bị tự dọn. Hãy xuất file sao lưu thường xuyên hơn.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-act="export">⬇ Xuất file .sqlite</button>
        <label class="btn ghost">⬆ Nhập file .sqlite<input type="file" id="importDb" accept=".sqlite,.db,.sqlite3" hidden></label>
      </div>
      <h2>📁 Tự lưu ra file</h2>
      <div id="fileSinkBox">${fileSinkHtml(T.fileSink.state())}</div>`,
      snaps: () => `
      <h2>Bản chụp tự động</h2>
      <p class="muted">Ứng dụng tự chụp lại dữ liệu mỗi ngày và trước khi nhập file, xoá toàn bộ hay khôi phục; giữ ${T.db.SNAP_MAX} bản gần nhất.
        Bản chụp nằm cùng chỗ với dữ liệu trong trình duyệt nên <b>không thay được file sao lưu</b>: xoá dữ liệu trình duyệt là mất cả hai.</p>
      <div id="snapList"><p class="muted">Đang đọc…</p></div>
      <p class="muted" id="usageNote"></p>`,
      audit: () => `
      <h2>Nhật ký thao tác</h2>
      <p class="muted">Các lần xoá, sửa, hoàn tác và đổi cài đặt gần đây — để tra lại khi có thắc mắc về điểm hay thẻ.</p>
      ${auditHtml()}`,
      danger: () => `
      <h2>Vùng nguy hiểm</h2>
      <p class="muted">Xoá sạch mọi lớp, học sinh, ATP và thẻ bài, đưa ứng dụng về trạng thái ban đầu. Có thể lùi lại bằng bản chụp “Trước khi xoá toàn bộ”.</p>
      <button type="button" class="btn danger" data-act="reset">Xoá toàn bộ dữ liệu</button>`
    };
    // Khung báo dữ liệu lỗi nằm trên thanh tab con để luôn thấy
    body.innerHTML = `<div id="integrityBox"></div>${tabs}${SECTIONS[sub.data]()}`;

    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(ok => {
        const note = body.querySelector('#persistNote');
        if (note) note.hidden = ok;
      }).catch(() => {});
    }
    if (sub.data === 'snaps') renderSnapshots(body);
    renderIntegrity(body);

    // Cập nhật mục tự lưu khi trạng thái đổi (khởi động xong, xin lại quyền ở thanh bên…); rời trang thì thôi nghe
    let offSink = null;
    offSink = T.fileSink.onChange(s => {
      const box = body.querySelector('#fileSinkBox');
      if (!box || !box.isConnected) { if (offSink) offSink(); return; }
      box.innerHTML = fileSinkHtml(s);
    });

    const importInput = body.querySelector('#importDb');
    if (importInput) importInput.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!(await T.ui.confirm(`Nhập “${file.name}” sẽ THAY THẾ toàn bộ dữ liệu hiện tại. Tiếp tục?`,
        { danger: true, okLabel: 'Nhập và thay thế' }))) { e.target.value = ''; return; }
      try {
        await T.backup.importFile(file);
        T.audit.log('data.import', `Nhập file ${file.name} (thay toàn bộ dữ liệu)`);
        T.ui.toast('Đã khôi phục dữ liệu');
      } catch (err) {
        T.ui.toast(err.message || 'Không nhập được file', 'error');
      }
      refresh();
    };
    body.onclick = async e => {
      if (T.backup.onReminderClick(e)) return;
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'export') { T.backup.exportFile(); return refresh(); }
      if (btn.dataset.act === 'restore') return restore(btn.dataset.key, btn.dataset.label);
      if (btn.dataset.act === 'repair') return repair();
      if (btn.dataset.act.startsWith('sink-')) return sinkAction(btn.dataset.act);
      if (btn.dataset.act !== 'reset') return;
      if (!(await T.ui.confirm('Xoá TOÀN BỘ dữ liệu? Ứng dụng sẽ chụp lại dữ liệu hiện tại trước khi xoá.', { danger: true, okLabel: 'Tiếp tục' }))) return;
      if (!(await T.ui.confirm('Xác nhận lần cuối: bạn đã sao lưu hoặc chắc chắn muốn xoá hết?', { danger: true, okLabel: 'Xoá hết' }))) return;
      try {
        await T.db.reset();
        T.audit.log('data.reset', 'Xoá toàn bộ dữ liệu');
        T.ui.toast('Đã xoá toàn bộ dữ liệu');
      } catch (err) {
        T.ui.toast(err.message || 'Không xoá được dữ liệu', 'error');
      }
      refresh();
    };

    async function sinkAction(act) {
      try {
        if (act === 'sink-pick' && await T.fileSink.pick()) T.ui.toast('Đã bật tự lưu ra file');
        if (act === 'sink-now') { await T.fileSink.flush(true); T.ui.toast('Đã ghi ra file'); }
        if (act === 'sink-resume' && await T.fileSink.resume()) T.ui.toast('Đã tiếp tục tự lưu ra file');
        if (act === 'sink-off') {
          if (!(await T.ui.confirm('Tắt tự lưu ra file? File đã ghi trên ổ đĩa vẫn giữ nguyên, chỉ là không được cập nhật nữa.',
            { okLabel: 'Tắt' }))) return;
          await T.fileSink.disable();
        }
      } catch (err) {
        T.ui.toast(err.message || 'Không thực hiện được', 'error');
      }
      refresh();
    }

    async function repair() {
      if (!(await T.ui.confirm('Xoá các bản ghi mồ côi và đưa giá trị lạ về mặc định? Dữ liệu hiện tại sẽ được chụp lại trước khi sửa.',
        { okLabel: 'Sửa dữ liệu' }))) return;
      try {
        const n = await T.integrity.repair();
        T.audit.log('data.repair', `Sửa ${n} bản ghi lỗi`);
        T.ui.toast(`Đã sửa ${n} bản ghi`);
      } catch (err) {
        T.ui.toast(err.message || 'Không sửa được dữ liệu', 'error');
      }
      refresh();
    }

    async function restore(key, label) {
      if (!(await T.ui.confirm(`Khôi phục bản chụp “${label}”? Dữ liệu hiện tại sẽ được chụp lại trước khi thay.`,
        { danger: true, okLabel: 'Khôi phục' }))) return;
      try {
        await T.db.restoreSnapshot(key);
        T.audit.log('data.restore', `Khôi phục bản chụp ${label}`);
        T.ui.toast('Đã khôi phục bản chụp');
      } catch (err) {
        T.ui.toast(err.message || 'Không khôi phục được', 'error');
      }
      refresh();
    }
  }

  // Mục "Tự lưu ra file" theo trạng thái của T.fileSink
  function fileSinkHtml(s) {
    const tip = `<p class="muted">Nên đặt file trong thư mục <b>OneDrive / Google Drive</b> (có thêm bản trên mạng)
      hoặc trên <b>USB</b>. Khi trình duyệt hỏi lại quyền, chọn <b>“Cho phép mọi lần truy cập”</b> để không phải bấm lại.
      Mỗi máy nên dùng một file riêng.</p>`;
    const when = s.lastWrite ? `lần ghi gần nhất ${stamp(s.lastWrite)}` : 'chưa ghi lần nào';
    if (s.status === 'unsupported') {
      return `<p class="muted">Trình duyệt này không cho trang web ghi file trên ổ đĩa (chỉ Chrome / Edge trên máy tính có).
        Hãy dùng “Xuất file .sqlite” để sao lưu định kỳ.</p>`;
    }
    if (s.status === 'off') {
      return `<p class="muted">Ứng dụng tự ghi toàn bộ dữ liệu vào một file bạn chọn sau mỗi thay đổi (tối đa 30 giây một lần).
        File nằm ngoài trình duyệt nên còn nguyên kể cả khi dữ liệu trình duyệt bị xoá; khi đó chỉ cần “Nhập file .sqlite”.</p>
        ${tip}<button type="button" class="btn" data-act="sink-pick">📁 Chọn file để tự lưu</button>`;
    }
    const name = `<b>${esc(s.name || '')}</b>`;
    if (s.status === 'needs-permission') {
      return `<p class="file-sink-warn">⚠ Đã tạm dừng ghi vào ${name}: trình duyệt cần bạn cho phép lại (${when}).</p>${tip}
        <div class="btn-row"><button type="button" class="btn" data-act="sink-resume">Tiếp tục tự lưu</button>
        <button type="button" class="btn ghost" data-act="sink-pick">Chọn file khác</button>
        <button type="button" class="btn ghost" data-act="sink-off">Tắt</button></div>`;
    }
    if (s.status === 'error') {
      return `<p class="file-sink-warn">⚠ Không ghi được vào ${name}: ${esc(s.error)}</p>
        <div class="btn-row"><button type="button" class="btn" data-act="sink-pick">Chọn lại file</button>
        <button type="button" class="btn ghost" data-act="sink-off">Tắt</button></div>`;
    }
    return `<p>✓ Đang tự lưu vào ${name} · ${when}.</p>
      <div class="btn-row"><button type="button" class="btn ghost" data-act="sink-now">Ghi ngay</button>
      <button type="button" class="btn ghost" data-act="sink-pick">Đổi file</button>
      <button type="button" class="btn ghost" data-act="sink-off">Tắt</button></div>`;
  }

  function auditHtml() {
    const rows = T.audit.list(50);
    if (!rows.length) return '<p class="muted">Chưa có thao tác nào.</p>';
    return `<div class="audit-scroll"><table class="table audit-table"><thead><tr><th>Thời điểm</th><th>Thao tác</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td class="nowrap">${stamp(r.at)}</td><td>${esc(r.summary)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderIntegrity(body) {
    const box = body.querySelector('#integrityBox');
    let r;
    try { r = T.integrity.check(); } catch (err) { r = { ok: false, fileError: err.message, issues: [] }; }
    if (r.ok) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="integrity-box">
      <h2>⚠ Dữ liệu có lỗi</h2>
      ${r.fileError ? `<p>File dữ liệu bị hỏng (${esc(r.fileError)}). Không tự sửa được: hãy khôi phục một bản chụp ở tab “Bản chụp”
        hoặc nhập file sao lưu ở tab “Sao lưu”.</p>` : ''}
      ${r.issues.length ? `<ul>${r.issues.map(i => `<li>${esc(i.label)}: <b>${i.count}</b></li>`).join('')}</ul>
        <p class="muted">Những bản ghi này không còn gắn với dữ liệu nào đang dùng (thường do phiên bản cũ hoặc file bị chỉnh tay).</p>
        <button type="button" class="btn" data-act="repair">🧹 Sửa dữ liệu lỗi</button>` : ''}
    </div>`;
  }

  const SNAP_REASONS = {
    daily: 'Tự động hằng ngày',
    'before-import': 'Trước khi nhập file',
    'before-reset': 'Trước khi xoá toàn bộ',
    'before-restore': 'Trước khi khôi phục',
    'before-migrate': 'Trước khi nâng cấp dữ liệu',
    'before-repair': 'Trước khi sửa dữ liệu lỗi'
  };
  const mb = n => (n / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: n < 10485760 ? 2 : 0 }) + ' MB';
  const stamp = ms => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

  async function renderSnapshots(body) {
    const box = body.querySelector('#snapList');
    let snaps;
    try {
      snaps = await T.db.listSnapshots();
    } catch (err) {
      box.innerHTML = `<p class="muted">Không đọc được bản chụp: ${T.ui.esc(err.message)}</p>`;
      return;
    }
    box.innerHTML = snaps.length ? `<table class="table snap-table"><thead><tr><th>Thời điểm</th><th>Lý do</th><th>Dung lượng</th><th></th></tr></thead>
      <tbody>${snaps.map(s => {
        const label = `${stamp(s.at)} · ${SNAP_REASONS[s.reason] || s.reason}`;
        return `<tr><td>${stamp(s.at)}</td><td>${T.ui.esc(SNAP_REASONS[s.reason] || s.reason)}</td><td>${mb(s.size)}</td>
          <td class="row-actions"><button type="button" class="btn sm ghost" data-act="restore"
            data-key="${T.ui.esc(s.key)}" data-label="${T.ui.esc(label)}">↺ Khôi phục</button></td></tr>`;
      }).join('')}</tbody></table>` : '<p class="muted">Chưa có bản chụp nào.</p>';
    const u = await T.db.usage();
    const note = body.querySelector('#usageNote');
    if (u && u.quota && note) note.textContent = `Đang dùng ${mb(u.usage)} / ${mb(u.quota)} bộ nhớ trình duyệt cấp cho ứng dụng.`;
  }

  const BODIES = { classes: tabClasses, students: tabStudents, atp: tabAtp, cards: tabCards, data: tabData };

  function render(el) {
    el.innerHTML = `
      <header class="page-head"><div><h1>⚙️ Cài đặt</h1><p>Quản lý lớp, học sinh, mức ATP, thẻ bài và dữ liệu.</p></div></header>
      <div class="tabs">${TABS.map(([k, label]) =>
        `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${label}</button>`).join('')}</div>
      <section class="panel" id="setBody"></section>`;
    el.querySelector('.tabs').onclick = e => {
      const b = e.target.closest('[data-tab]');
      if (b) { tab = b.dataset.tab; refresh(); }
    };
    const body = el.querySelector('#setBody');
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-sub]');
      if (!b) return;
      e.stopPropagation(); // không để onclick của tab hiểu nhầm là một thao tác
      const [key, value] = b.dataset.sub.split(':');
      sub[key] = value;
      refresh();
    }, true);
    BODIES[tab](body);
  }

  T.settingsView = { open };

  T.router.register('cai-dat', { label: 'Cài đặt', icon: '⚙️', render });
})(window.TSTB);
