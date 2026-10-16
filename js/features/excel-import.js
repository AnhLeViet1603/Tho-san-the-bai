// Import tên học sinh từ file Excel
(function (T) {
  'use strict';
  const { esc } = T.ui;

  // Lấy tên từ một cột, bỏ dòng tiêu đề và ô trống
  function extract(ws, colLetter, headerRows) {
    if (!ws || !ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const c = XLSX.utils.decode_col(colLetter);
    const names = [];
    for (let r = Math.max(range.s.r, headerRows); r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const text = cell ? String(cell.w != null ? cell.w : (cell.v != null ? cell.v : '')) : '';
      const name = text.replace(/\s+/g, ' ').trim();
      if (name) names.push(name);
    }
    return names;
  }

  function open(classId, done) {
    const cls = T.classes.get(classId);
    let wb = null;
    let names = [];

    const body = document.createElement('div');
    body.className = 'form';
    body.innerHTML = `
      <div class="field"><span>File Excel (.xlsx, .xls, .csv)</span>
        <input type="file" accept=".xlsx,.xls,.csv" data-f="file"></div>
      <div class="row3">
        <div class="field"><span>Sheet</span><select data-f="sheet" disabled></select></div>
        <div class="field"><span>Cột lấy tên</span>
          <input data-f="col" maxlength="3" value="${esc(T.settings.get('excel_name_column', 'A'))}"></div>
        <div class="field"><span>Số dòng tiêu đề</span>
          <input data-f="head" type="number" min="0" value="${T.settings.num('excel_header_rows', 1)}"></div>
      </div>
      <div class="field"><span>Chế độ</span>
        <select data-f="mode">
          <option value="add">Thêm vào danh sách hiện có (bỏ qua tên trùng)</option>
          <option value="replace">Thay thế toàn bộ danh sách</option>
        </select></div>
      <div class="preview" data-f="preview">Chọn file để xem trước.</div>`;
    const $ = k => body.querySelector(`[data-f="${k}"]`);

    function refresh() {
      const box = $('preview');
      if (!wb) return;
      const col = $('col').value.trim().toUpperCase();
      if (!/^[A-Z]{1,3}$/.test(col)) {
        names = [];
        box.innerHTML = '<span class="warn-text">Cột không hợp lệ. Nhập chữ cái như A, B, C…</span>';
        return;
      }
      const raw = extract(wb.Sheets[$('sheet').value], col, Math.max(0, Number($('head').value) || 0));
      const seen = new Set();
      if ($('mode').value === 'add') {
        T.students.list(classId, true).forEach(s => seen.add(s.name.toLowerCase()));
      }
      let skipped = 0;
      names = raw.filter(n => {
        const k = n.toLowerCase();
        if (seen.has(k)) { skipped++; return false; }
        seen.add(k);
        return true;
      });
      box.innerHTML = names.length
        ? `<b>${names.length} học sinh sẽ được thêm</b>${skipped ? ` <span class="muted">(bỏ qua ${skipped} tên trùng)</span>` : ''}
           <ol>${names.slice(0, 60).map(n => `<li>${esc(n)}</li>`).join('')}</ol>
           ${names.length > 60 ? `<span class="muted">… và ${names.length - 60} tên khác</span>` : ''}`
        : `<span class="warn-text">Không tìm thấy tên nào ở cột ${esc(col)}${skipped ? ` (${skipped} tên đã có sẵn)` : ''}.</span>`;
    }

    $('file').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      } catch (err) {
        wb = null;
        $('preview').innerHTML = '<span class="warn-text">Không đọc được file này.</span>';
        return;
      }
      $('sheet').innerHTML = wb.SheetNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      $('sheet').disabled = wb.SheetNames.length < 2;
      refresh();
    };
    ['sheet', 'mode'].forEach(k => { $(k).onchange = refresh; });
    ['col', 'head'].forEach(k => { $(k).oninput = refresh; });

    T.ui.modal({
      title: `Import học sinh — ${cls.name}`,
      body,
      wide: true,
      actions: [
        { label: 'Huỷ', kind: 'ghost', onClick: close => close() },
        {
          label: 'Import',
          onClick: async close => {
            if (!names.length) { T.ui.toast('Chưa có tên nào để import', 'warn'); return; }
            const replace = $('mode').value === 'replace';
            if (replace && !(await T.ui.confirm(
              `Thay thế sẽ chuyển toàn bộ học sinh hiện có của lớp ${cls.name} vào thùng rác (ATP, thẻ của các em còn nguyên, ` +
              'khôi phục được ở Cài đặt → Học sinh → Thùng rác). Tiếp tục?',
              { danger: true, okLabel: 'Thay thế' }))) return;
            T.db.tx(() => {
              if (replace) T.students.removeAll(classId);
              T.students.bulkAdd(classId, names);
            });
            T.ui.toast(`Đã import ${names.length} học sinh`);
            close();
            done();
          }
        }
      ]
    });
  }

  T.excelImport = { open, extract };
})(window.TSTB);
