// Dashboard thống kê: filter + biểu đồ tròn / cột
(function (T) {
  'use strict';
  const { esc } = T.ui;

  const PALETTE = ['#5fe08a', '#ffc94a', '#59d0e0', '#ff8f6b', '#c39bff', '#ff7fb6', '#9be15d', '#6fa8ff', '#f4e285', '#7ee0c3'];
  const f = { classIds: [], scope: 'school', year: '', month: '', week: '', period: '', type: '', source: '', studentId: '' };
  let timeUnit = 'week';
  let charts = [];
  let sortKey = 'total';
  let cardSort = 'total';
  // Màu theo khung độ hiếm (components.css: .pcard--r|sr|ssr)
  const RARITY_COLOR = { R: '#5fe08a', SR: '#a874ff', SSR: '#ffc94a' };
  // Tab con đang mở (nhớ trong phiên làm việc); bộ lọc f dùng chung cho cả 3 tab
  const TABS = [['overview', '📋 Tổng quan'], ['atp', '⚡ ATP'], ['cards', '🃏 Thẻ']];
  let tab = 'overview';

  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  function select(key, label, items) {
    return `<label>${label}<select data-f="${key}"><option value="">Tất cả</option>${items.map(([v, text]) =>
      `<option value="${esc(v)}" ${String(f[key]) === String(v) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  }

  // opts: { label (tên số liệu trong tooltip, mặc định ATP), multi, horizontal, color, colors(row) → màu từng cột/miếng,
  //   series: [[khoá, nhãn, màu], …] → cột chồng, mỗi series một dataset lấy row[khoá] }
  function draw(el, id, type, rows, opts = {}) {
    const box = el.querySelector('#' + id);
    const data = rows.filter(r => type !== 'pie' || r.total > 0);
    if (!data.length) {
      box.innerHTML = '<p class="muted chart-empty">Chưa có dữ liệu</p>';
      return;
    }
    const canvas = document.createElement('canvas');
    box.append(canvas);
    const pie = type === 'pie';
    charts.push(new Chart(canvas, {
      type: pie ? 'doughnut' : 'bar',
      data: {
        labels: data.map(r => r.key),
        datasets: opts.series
          ? opts.series.map(([key, label, color]) => ({
            label, data: data.map(r => r[key] || 0), backgroundColor: color, borderWidth: 0, borderRadius: 4
          }))
          : [{
            label: opts.label || 'ATP',
            data: data.map(r => r.total),
            backgroundColor: opts.colors ? data.map(opts.colors)
              : pie || opts.multi ? data.map((_, i) => PALETTE[i % PALETTE.length]) : (opts.color || PALETTE[0]),
            borderColor: pie ? '#0d2317' : 'transparent',
            borderWidth: pie ? 2 : 0,
            borderRadius: pie ? 0 : 6
          }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: opts.horizontal ? 'y' : 'x',
        plugins: { legend: { display: pie || !!opts.series, position: 'bottom' } },
        scales: pie ? {} : {
          x: { grid: { display: !!opts.horizontal }, beginAtZero: true, stacked: !!opts.series },
          y: { grid: { display: !opts.horizontal }, beginAtZero: true, stacked: !!opts.series }
        }
      }
    }));
  }

  function render(el) {
    charts.forEach(c => c.destroy());
    charts = [];
    Chart.defaults.color = '#cfe8d5';
    Chart.defaults.borderColor = 'rgba(160, 230, 180, .12)';
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

    const classes = T.classes.list();
    f.classIds = f.classIds.filter(id => classes.some(c => c.id === id));
    const stuClasses = f.classIds.length ? f.classIds : classes.map(c => c.id);
    const students = stuClasses.flatMap(id => T.students.list(id, true));
    if (f.studentId && !students.some(s => s.id === Number(f.studentId))) f.studentId = '';

    // Tab Thẻ: Loại/Nguồn/Tiết không áp dụng cho thẻ nên ẩn
    const atpOnly = tab !== 'cards';

    el.innerHTML = `
      <header class="page-head">
        <div><h1>📊 Thống kê hệ sinh thái</h1><p>Lọc theo lớp, thời gian, loại hoạt động và học sinh.</p></div>
        <button type="button" class="btn ghost" id="resetFilter">Xoá bộ lọc</button>
      </header>
      ${T.ui.subTabs(TABS, tab)}
      <div class="panel filters">
        <div class="class-chips">
          <span class="muted">Lớp:</span>
          ${classes.map(c => `<label class="check-chip"><input type="checkbox" data-class="${c.id}" ${f.classIds.includes(c.id) ? 'checked' : ''}>
            <span>${esc((c.icon || '🌿') + ' ' + c.name)}</span></label>`).join('') || '<span class="muted">Chưa có lớp</span>'}
        </div>
        <div class="picker">
          <label>Phạm vi<select data-f="scope">
            <option value="school" ${f.scope === 'school' ? 'selected' : ''}>Năm học ${T.schoolYear.range().label}</option>
            <option value="" ${f.scope ? '' : 'selected'}>Toàn bộ thời gian</option>
          </select></label>
          ${select('year', 'Năm', T.stats.years().map(y => [y, String(y)]))}
          ${select('month', 'Tháng', range(1, 12).map(v => [v, 'Tháng ' + v]))}
          ${select('week', 'Tuần', range(1, 5).map(v => [v, 'Tuần ' + v]))}
          ${atpOnly ? select('period', 'Tiết', range(1, 10).map(v => [v, 'Tiết ' + v])) : ''}
          ${atpOnly ? select('type', 'Loại', Object.entries(T.atp.TYPES).map(([k, v]) => [k, v.label])) : ''}
          ${atpOnly ? select('source', 'Nguồn', [['solo', 'Cá nhân'], ['group', 'Theo nhóm']]) : ''}
          ${select('studentId', 'Học sinh', students.map(s => [s.id, s.name]))}
        </div>
      </div>
      <div id="statsBody" class="stats-body"></div>`;

    const body = el.querySelector('#statsBody');
    if (tab === 'atp') renderAtp(body);
    else if (tab === 'cards') renderCards(body);
    else renderOverview(body);

    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.f) f[t.dataset.f] = t.value;
      else if (t.dataset.class) {
        const id = Number(t.dataset.class);
        f.classIds = t.checked ? f.classIds.concat(id) : f.classIds.filter(x => x !== id);
      } else if (t.id === 'timeUnit') timeUnit = t.value;
      else return;
      T.router.refresh();
    });
    el.addEventListener('click', e => {
      const subBtn = e.target.closest('[data-sub]');
      if (subBtn) { tab = subBtn.dataset.sub; T.router.refresh(); return; }
      const sort = e.target.closest('[data-sort]');
      if (sort) { sortKey = sort.dataset.sort; T.router.refresh(); return; }
      const cSort = e.target.closest('[data-card-sort]');
      if (cSort) { cardSort = cSort.dataset.cardSort; T.router.refresh(); return; }
      if (e.target.id === 'resetFilter') {
        Object.assign(f, { classIds: [], scope: 'school', year: '', month: '', week: '', period: '', type: '', source: '', studentId: '' });
        T.router.refresh();
      }
    });
  }

  // ---------- Tổng quan: KPI + bảng xếp hạng ----------
  function renderOverview(body) {
    const sum = T.stats.summary(f);
    const evo = T.stats.evolution(f);
    const ranking = T.stats.ranking(f);
    ranking.sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name, 'vi') : b[sortKey] - a[sortKey]);
    const th = (key, label) => `<th data-sort="${key}" class="${sortKey === key ? 'on' : ''}">${label}</th>`;

    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Tổng ATP</small><b class="atp">⚡ ${sum.total}</b></div>
        <div class="kpi"><small>Lượt phát biểu</small><b>🗣️ ${sum.speak}</b></div>
        <div class="kpi"><small>Điểm 8–9</small><b>⭐ ${sum.score_8_9}</b></div>
        <div class="kpi"><small>Điểm 9+</small><b>🌟 ${sum.score_9_plus}</b></div>
        <div class="kpi"><small>Thẻ đã lật / đã dùng</small><b>🧬 ${evo.flips} / ${evo.used}</b></div>
        <div class="kpi"><small>Học sinh có ATP / số tiết</small><b>${sum.students} / ${sum.lessons}</b></div>
      </div>

      <div class="panel">
        <h3>Bảng xếp hạng <small class="muted">(${ranking.length} học sinh · bấm tiêu đề cột để sắp xếp)</small></h3>
        ${ranking.length ? `<div class="table-wrap"><table class="table sortable"><thead><tr><th>#</th>
          ${th('name', 'Học sinh')}<th>Lớp</th>${th('speak', 'Phát biểu')}${th('score_8_9', 'Điểm 8–9')}
          ${th('score_9_plus', 'Điểm 9+')}${th('total', 'ATP')}${th('cards', 'Thẻ đang giữ')}</tr></thead>
          <tbody>${ranking.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.class_name)}</td>
            <td>${r.speak}</td><td>${r.score_8_9}</td><td>${r.score_9_plus}</td>
            <td class="atp">${r.total}</td><td>🃏 ${r.cards}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Không có dữ liệu phù hợp với bộ lọc.</p>'}
      </div>`;
  }

  // ---------- ATP: 6 biểu đồ ----------
  // Lưới 3 cột, mỗi hàng đủ 3 ô: 3 biểu đồ thường · rộng 2 + thường · cả hàng
  function renderAtp(body) {
    body.innerHTML = `
      <div class="charts">
        <div class="panel chart"><h3>Tỉ trọng ATP theo loại</h3><div class="chart-box" id="cType"></div></div>
        <div class="panel chart"><h3>Tỉ trọng ATP theo lớp</h3><div class="chart-box" id="cClassPie"></div></div>
        <div class="panel chart"><h3>So sánh các lớp</h3><div class="chart-box" id="cClassBar"></div></div>
        <div class="panel chart wide"><h3>ATP theo thời gian
          <select id="timeUnit"><option value="week" ${timeUnit === 'week' ? 'selected' : ''}>Theo tuần</option>
          <option value="month" ${timeUnit === 'month' ? 'selected' : ''}>Theo tháng</option></select></h3>
          <div class="chart-box" id="cTime"></div></div>
        <div class="panel chart"><h3>ATP theo nhóm</h3><div class="chart-box" id="cGroup"></div></div>
        <div class="panel chart full"><h3>Top 10 học sinh</h3><div class="chart-box" id="cTop"></div></div>
      </div>`;

    const typeRows = T.stats.byType(f).map(r => ({ key: T.atp.TYPES[r.key].label, total: r.total }));
    const classRows = T.stats.byClass(f);
    draw(body, 'cType', 'pie', typeRows);
    draw(body, 'cClassPie', 'pie', classRows);
    draw(body, 'cTime', 'bar', T.stats.byTime(f, timeUnit));
    draw(body, 'cClassBar', 'bar', classRows, { multi: true });
    draw(body, 'cTop', 'bar', T.stats.topStudents(f, 10), { horizontal: true, color: PALETTE[1] });
    draw(body, 'cGroup', 'bar', T.stats.byGroup(f), { multi: true });
  }

  // ---------- Thẻ: thẻ tiến hoá đã lật, theo loại và độ hiếm ----------
  function renderCards(body) {
    const evo = T.stats.evolution(f);
    const rarity = T.stats.byRarity(f);
    const count = r => rarity.find(x => x.key === r).total;
    const students = T.stats.rarityByStudent(f);
    students.sort((a, b) => cardSort === 'name' ? a.name.localeCompare(b.name, 'vi') : b[cardSort] - a[cardSort]);
    const th = (key, label) => `<th data-card-sort="${key}" class="${cardSort === key ? 'on' : ''}">${label}</th>`;
    const series = T.cards.RARITIES.map(r => [r, r, RARITY_COLOR[r]]);

    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Thẻ đã lật / đã dùng</small><b>🧬 ${evo.flips} / ${evo.used}</b></div>
        <div class="kpi"><small>SR đã phát</small><b class="rarity-sr-text">💜 ${count('SR')}</b></div>
        <div class="kpi"><small>SSR đã phát</small><b class="atp">🌟 ${count('SSR')}</b></div>
      </div>
      <div class="charts">
        <div class="panel chart"><h3>Phân bố độ hiếm</h3><div class="chart-box" id="cRarity"></div></div>
        <div class="panel chart wide"><h3>Độ hiếm theo lớp</h3><div class="chart-box" id="cRarityClass"></div></div>
        <div class="panel chart full"><h3>Thẻ tiến hoá đã lật <small class="muted">(${evo.flips} lá · ${evo.used} đã dùng)</small></h3>
          <p class="muted chart-note">Màu theo độ hiếm: xanh R · tím SR · vàng SSR.</p>
          <div class="chart-box" id="cCards"></div></div>
      </div>
      <div class="panel">
        <h3>Thẻ theo học sinh <small class="muted">(${students.length} học sinh · bấm tiêu đề cột để sắp xếp)</small></h3>
        ${students.length ? `<div class="table-wrap"><table class="table sortable rarity-table"><thead><tr><th>#</th>
          ${th('name', 'Học sinh')}<th>Lớp</th>${th('R', 'R')}${th('SR', 'SR')}${th('SSR', 'SSR')}${th('total', 'Tổng')}</tr></thead>
          <tbody>${students.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.class_name)}</td>
            <td>${s.R}</td><td>${s.SR}</td><td>${s.SSR}</td><td><b>${s.total}</b></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Không có dữ liệu phù hợp với bộ lọc.</p>'}
      </div>`;

    draw(body, 'cCards', 'pie', evo.rows, { label: 'Số lá', colors: r => RARITY_COLOR[T.cards.rarityOf(r.rarity)] });
    draw(body, 'cRarity', 'pie', rarity, { label: 'Số lá', colors: r => RARITY_COLOR[r.key] });
    draw(body, 'cRarityClass', 'bar', T.stats.rarityByClass(f), { series });
  }

  T.router.register('thong-ke', { label: 'Thống kê', icon: '📊', render });
})(window.TSTB);
