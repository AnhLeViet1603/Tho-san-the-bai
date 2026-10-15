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
  const refresh = () => T.router.refresh();

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
    body.innerHTML = `
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
      const id = Number(btn.closest('tr').dataset.id);
      const c = classes.find(x => x.id === id);
      if (act === 'edit') return classForm(c);
      if (act === 'up' || act === 'down') T.classes.move(id, act === 'up' ? -1 : 1);
      if (act === 'students') { T.store.set({ classId: id }); tab = 'students'; }
      if (act === 'del') {
        if (!(await T.ui.confirm(
          `Xoá lớp ${c.name}? Toàn bộ ${c.student_count} học sinh, tiết học và ATP của lớp sẽ bị xoá vĩnh viễn.`,
          { danger: true, okLabel: 'Xoá lớp' }))) return;
        T.classes.remove(id);
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
    const year = T.schoolYear.range().label;
    const totals = T.atp.totalsByClass(cls.id);
    body.innerHTML = `
      <div class="panel-head">
        <h2>Học sinh</h2>
        <select id="stuClass">${T.classes.list().map(c =>
          `<option value="${c.id}" ${c.id === cls.id ? 'selected' : ''}>${esc((c.icon || '🌿') + ' ' + c.name)}</option>`).join('')}</select>
        <button type="button" class="btn" data-act="import">📥 Import Excel</button>
      </div>
      <form class="add-row" id="addStudent">
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
      : T.ui.empty('🧑‍🎓', 'Lớp chưa có học sinh', 'Nhập tên ở trên hoặc import danh sách từ file Excel.')}`;

    body.querySelector('#stuClass').onchange = e => { T.store.set({ classId: Number(e.target.value) }); refresh(); };
    body.querySelector('#addStudent').onsubmit = e => {
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
      const s = students.find(x => x.id === id);
      if (act === 'rename') {
        const v = await T.ui.form('Sửa tên học sinh', [{ name: 'name', label: 'Họ tên', value: s.name, required: true }]);
        if (!v) return;
        T.students.rename(id, v.name);
      } else if (act === 'toggle') {
        T.students.setActive(id, !s.active);
      } else if (act === 'del') {
        if (!(await T.ui.confirm(`Xoá ${s.name}? ATP và lịch sử của em sẽ bị xoá. (Dùng “Ẩn” nếu chỉ muốn tạm ẩn.)`,
          { danger: true, okLabel: 'Xoá' }))) return;
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
    body.querySelector('#atpForm').onsubmit = e => {
      e.preventDefault();
      const els = e.target.elements;
      if (els.school_start.value >= els.school_end.value) {
        T.ui.toast('Ngày kết thúc năm học phải sau ngày bắt đầu', 'error');
        return;
      }
      T.db.tx(() => {
        T.schoolYear.set(els.school_start.value, els.school_end.value);
        ['atp_speak', 'atp_score_8_9', 'atp_score_9_plus'].forEach(k => T.settings.set(k, Math.trunc(Number(els[k].value) || 0)));
        ['evolve_threshold', 'evolve_choices'].forEach(k => T.settings.set(k, Math.max(1, Math.trunc(Number(els[k].value) || 1))));
        T.settings.set('excel_name_column', els.excel_name_column.value.trim().toUpperCase());
        T.settings.set('excel_header_rows', Math.max(0, Math.trunc(Number(els.excel_header_rows.value) || 0)));
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
    body.innerHTML = `
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
        `Xoá thẻ “${c.name}”?${held ? ` ${held} học sinh đang giữ thẻ này sẽ mất thẻ.` : ''} Lịch sử của thẻ cũng bị xoá.`,
        { danger: true, okLabel: 'Xoá' }))) return;
      T.cards.remove(c.id);
      refresh();
    };
  }

  // ---------- Dữ liệu ----------
  function tabData(body) {
    body.innerHTML = `
      <h2>Sao lưu & khôi phục</h2>
      <p class="muted">Dữ liệu được lưu trong trình duyệt này (IndexedDB), gắn với vị trí thư mục của ứng dụng.
        Hãy xuất file <b>.sqlite</b> định kỳ để sao lưu, hoặc khi đổi máy, đổi trình duyệt, di chuyển thư mục.</p>
      <p class="muted" id="persistNote" hidden>⚠ Trình duyệt chưa cho phép giữ dữ liệu lâu dài: khi máy thiếu dung lượng,
        dữ liệu có thể bị tự dọn. Hãy xuất file sao lưu thường xuyên hơn.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-act="export">⬇ Xuất file .sqlite</button>
        <label class="btn ghost">⬆ Nhập file .sqlite<input type="file" id="importDb" accept=".sqlite,.db,.sqlite3" hidden></label>
      </div>
      <h2>Bản chụp tự động</h2>
      <p class="muted">Ứng dụng tự chụp lại dữ liệu mỗi ngày và trước khi nhập file, xoá toàn bộ hay khôi phục; giữ ${T.db.SNAP_MAX} bản gần nhất.
        Bản chụp nằm cùng chỗ với dữ liệu trong trình duyệt nên <b>không thay được file sao lưu</b>: xoá dữ liệu trình duyệt là mất cả hai.</p>
      <div id="snapList"><p class="muted">Đang đọc…</p></div>
      <p class="muted" id="usageNote"></p>
      <h2>Vùng nguy hiểm</h2>
      <p class="muted">Xoá sạch mọi lớp, học sinh, ATP và thẻ bài, đưa ứng dụng về trạng thái ban đầu. Có thể lùi lại bằng bản chụp “Trước khi xoá toàn bộ”.</p>
      <button type="button" class="btn danger" data-act="reset">Xoá toàn bộ dữ liệu</button>`;

    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(ok => {
        const note = body.querySelector('#persistNote');
        if (note) note.hidden = ok;
      }).catch(() => {});
    }
    renderSnapshots(body);

    body.querySelector('#importDb').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!(await T.ui.confirm(`Nhập “${file.name}” sẽ THAY THẾ toàn bộ dữ liệu hiện tại. Tiếp tục?`,
        { danger: true, okLabel: 'Nhập và thay thế' }))) { e.target.value = ''; return; }
      try {
        await T.backup.importFile(file);
        T.ui.toast('Đã khôi phục dữ liệu');
      } catch (err) {
        T.ui.toast(err.message || 'Không nhập được file', 'error');
      }
      refresh();
    };
    body.onclick = async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'export') return T.backup.exportFile();
      if (btn.dataset.act === 'restore') return restore(btn.dataset.key, btn.dataset.label);
      if (!(await T.ui.confirm('Xoá TOÀN BỘ dữ liệu? Ứng dụng sẽ chụp lại dữ liệu hiện tại trước khi xoá.', { danger: true, okLabel: 'Tiếp tục' }))) return;
      if (!(await T.ui.confirm('Xác nhận lần cuối: bạn đã sao lưu hoặc chắc chắn muốn xoá hết?', { danger: true, okLabel: 'Xoá hết' }))) return;
      try {
        await T.db.reset();
        T.ui.toast('Đã xoá toàn bộ dữ liệu');
      } catch (err) {
        T.ui.toast(err.message || 'Không xoá được dữ liệu', 'error');
      }
      refresh();
    };

    async function restore(key, label) {
      if (!(await T.ui.confirm(`Khôi phục bản chụp “${label}”? Dữ liệu hiện tại sẽ được chụp lại trước khi thay.`,
        { danger: true, okLabel: 'Khôi phục' }))) return;
      try {
        await T.db.restoreSnapshot(key);
        T.ui.toast('Đã khôi phục bản chụp');
      } catch (err) {
        T.ui.toast(err.message || 'Không khôi phục được', 'error');
      }
      refresh();
    }
  }

  const SNAP_REASONS = {
    daily: 'Tự động hằng ngày',
    'before-import': 'Trước khi nhập file',
    'before-reset': 'Trước khi xoá toàn bộ',
    'before-restore': 'Trước khi khôi phục',
    'before-migrate': 'Trước khi nâng cấp dữ liệu'
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
    BODIES[tab](el.querySelector('#setBody'));
  }

  T.router.register('cai-dat', { label: 'Cài đặt', icon: '⚙️', render });
})(window.TSTB);
