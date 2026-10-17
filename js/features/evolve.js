// Lật thẻ tiến hoá (chọn 1 trong n thẻ úp) và bảng thẻ của một học sinh
(function (T) {
  'use strict';
  const { esc } = T.ui;

  // Lý do không lật được (màn lật mở từ trước, dữ liệu đã đổi ở chỗ khác)
  const FLIP_FAIL = {
    'no-flip': s => `${s.name} không còn lượt lật thẻ (ATP vừa thay đổi)`,
    held: (s, c) => `${s.name} đang giữ thẻ ${c.name} rồi`,
    archived: (s, c) => `Thẻ ${c.name} vừa bị xoá khỏi bộ thẻ. Hãy lật lại.`
  };

  // Tuần của tiết đang chọn: dùng cho luật "không dùng trong tuần nhận thẻ"
  const now = () => {
    const s = T.store.state;
    return { year: s.year, month: s.month, week: s.week };
  };

  // student: { id, name }. done() được gọi khi đóng màn lật thẻ.
  function open(student, done) {
    const when = now();
    const left = T.evolutions.pending(T.atp.totalFor(student.id), T.evolutions.flips(student.id));
    if (!left) {
      T.ui.toast(`${student.name} chưa có lượt lật thẻ nào`, 'warn');
      return;
    }
    if (!T.cards.list().length) {
      T.ui.toast('Chưa có thẻ tiến hoá nào. Hãy thêm thẻ trong Cài đặt.', 'warn');
      return;
    }
    // Các lá úp chia theo tỉ lệ độ hiếm; có thể trùng loại khi một cấp ít thẻ
    const picks = T.rarity.deal(student.id, T.evolutions.choices());
    if (!picks.length) {
      T.ui.toast(`${student.name} đang giữ đủ mọi loại thẻ. Hãy dùng bớt thẻ rồi lật tiếp.`, 'warn');
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'evo';
    wrap.innerHTML = `
      <div class="evo-head">
        <h2>🧬 ${esc(student.name)} tiến hoá!</h2>
        <p>Chọn 1 trong ${picks.length} thẻ để lật${left > 1 ? ` · còn ${left} lượt lật` : ''}.</p>
      </div>
      <div class="evo-row">${picks.map((c, i) => `
        <div class="flip" role="button" tabindex="0" data-i="${i}" style="--delay:${i * 90}ms">
          <div class="flip-inner">
            <div class="flip-back"><i>🧬</i><b>?</b></div>
            <div class="flip-front">${T.ui.cardHtml(c)}</div>
          </div>
        </div>`).join('')}</div>
      <div class="evo-result" hidden>
        <small>Đặc quyền của ${esc(student.name)}</small>
        <h2></h2>
        <p></p>
        <small class="evo-note"></small>
        <button type="button" class="btn" data-close>Nhận thẻ</button>
      </div>
      <button type="button" class="btn ghost evo-later" data-close>Để sau</button>`;

    let picked = false;
    const close = () => { wrap.remove(); if (done) done(); };

    function pick(el) {
      if (picked) return;
      picked = true;
      const card = picks[Number(el.dataset.i)];
      const result = T.evolutions.flip(student.id, card, when);
      if (result !== 'ok') {
        T.ui.toast(FLIP_FAIL[result](student, card), 'warn');
        return close();
      }

      // Đưa thẻ được chọn về giữa màn hình và phóng to
      const r = el.getBoundingClientRect();
      const scale = Math.min(1.9, (innerHeight * 0.56) / r.height, (innerWidth * 0.8) / r.width);
      el.style.setProperty('--tx', (innerWidth / 2 - (r.left + r.width / 2)) + 'px');
      el.style.setProperty('--ty', (innerHeight * 0.4 - (r.top + r.height / 2)) + 'px');
      el.style.setProperty('--s', scale);
      wrap.classList.add('revealed');
      el.classList.add('picked');
      wrap.querySelectorAll('.flip').forEach(f => { if (f !== el) f.classList.add('dim'); });

      setTimeout(() => {
        const res = wrap.querySelector('.evo-result');
        res.querySelector('h2').textContent = card.name;
        res.querySelector('p').textContent = card.description || '';
        res.querySelector('.evo-note').textContent =
          `${T.cards.expiryLabel(card)} · dùng được từ tuần sau`;
        res.hidden = false;
      }, 1100);
    }

    wrap.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return close();
      const el = e.target.closest('.flip');
      if (el) pick(el);
    });
    wrap.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('flip')) {
        e.preventDefault();
        pick(e.target);
      }
    });
    document.body.append(wrap);
  }

  // Bảng thẻ học sinh đang có: bấm một thẻ để sử dụng cho học sinh đó
  function board(student, done) {
    const body = document.createElement('div');
    body.className = 'card-board';
    let cards = [];

    function draw() {
      const when = now();
      cards = T.evolutions.heldBy(student.id);
      body.innerHTML = cards.length
        ? `<p class="muted">Bấm vào một thẻ để sử dụng đặc quyền cho ${esc(student.name)}.
            Thẻ không dùng được trong tuần vừa nhận. Dùng ✎ để sửa hạn hoặc đổi thẻ, 🗑 để xoá thẻ.</p>
          <div class="pcard-grid">${cards.map(c => {
            const locked = T.evolutions.sameWeek(c, when);
            return `<div class="card-pick ${locked ? 'locked' : ''}" data-grant="${c.grant_id}" role="button" tabindex="0">
              ${T.ui.cardHtml(c, { footer: `<span class="muted">${T.evolutions.expiryText(c)}</span>
                ${locked ? '<span class="lock-tag">🔒 Dùng được từ tuần sau</span>' : '<span class="use-tag">Bấm để dùng</span>'}
                <span class="card-tools">
                  <button type="button" class="btn sm ghost" data-tool="edit" title="Sửa hạn / đổi thẻ">✎ Sửa</button>
                  <button type="button" class="btn sm ghost" data-tool="remove" title="Xoá thẻ">🗑 Xoá</button>
                </span>` })}
            </div>`;
          }).join('')}</div>`
        : T.ui.empty('🃏', 'Chưa có thẻ nào', `${student.name} chưa giữ thẻ tiến hoá nào.`);
    }

    async function use(el) {
      const c = cards.find(x => x.grant_id === Number(el.dataset.grant));
      if (el.classList.contains('locked')) {
        T.ui.toast('Thẻ vừa nhận trong tuần này, sang tuần sau mới dùng được', 'warn');
        return;
      }
      if (!(await T.ui.confirm(`Dùng thẻ “${c.name}” cho ${student.name}? Thẻ sẽ biến mất sau khi dùng.`,
        { okLabel: 'Dùng thẻ' }))) return;
      T.evolutions.use(c.grant_id, null);
      T.ui.toast(`${student.name} đã dùng thẻ ${c.name}`, 'gold');
      draw();
    }

    // Sửa một lá đang giữ: đổi sang loại thẻ khác và / hoặc đặt lại ngày hết hạn
    async function edit(c) {
      const before = c.expires_at ? T.time.dateOf(c.expires_at) : '';
      const options = [c].concat(T.evolutions.available(student.id))
        .map(k => ({ value: k.id, label: `${k.icon || '🃏'} ${k.name}` }));
      const out = await T.ui.form(`Sửa thẻ của ${student.name}`, [
        { name: 'card', label: 'Loại thẻ', type: 'select', value: c.id, options,
          hint: 'Chỉ đổi được sang loại thẻ em chưa giữ. Lượt lật và tuần nhận thẻ giữ nguyên.' },
        { name: 'expires', label: 'Hết hạn vào cuối ngày', type: 'date', value: before, min: T.time.today(),
          hint: 'Để trống = không hết hạn. Nếu đổi loại thẻ mà không sửa ngày, hạn tính lại theo thẻ mới kể từ hôm nay.' }
      ]);
      if (!out) return;
      const cardId = Number(out.card);
      const swapped = cardId !== c.id;
      if (swapped && !T.evolutions.swap(c.grant_id, cardId)) {
        T.ui.toast('Không đổi được: học sinh đang giữ một lá cùng loại', 'warn');
        return draw();
      }
      if (out.expires !== before && !T.evolutions.setExpiry(c.grant_id, out.expires)) {
        T.ui.toast('Ngày hết hạn không hợp lệ hoặc đã qua', 'warn');
        return draw();
      }
      if (swapped || out.expires !== before) T.ui.toast(`Đã cập nhật thẻ của ${student.name}`);
      draw();
    }

    async function remove(c) {
      const out = await T.ui.form(`Xoá thẻ “${c.name}” của ${student.name}`, [
        { name: 'mode', label: 'Lượt lật thẻ', type: 'select', value: 'revoke', options: [
          { value: 'revoke', label: 'Trả lại lượt lật – em được lật thẻ khác' },
          { value: 'discard', label: 'Không trả lại lượt lật' }
        ], hint: 'Xoá mà không trả lượt lật thì vẫn hoàn tác được trong Lịch sử thẻ.' }
      ], { okLabel: 'Xoá thẻ' });
      if (!out) return;
      if (out.mode === 'discard') T.evolutions.discard(c.grant_id);
      else T.evolutions.revoke(c.grant_id);
      T.ui.toast(`Đã xoá thẻ ${c.name} của ${student.name}`);
      draw();
    }

    body.addEventListener('click', e => {
      const el = e.target.closest('[data-grant]');
      if (!el) return;
      const tool = e.target.closest('[data-tool]');
      if (!tool) return use(el);
      const c = cards.find(x => x.grant_id === Number(el.dataset.grant));
      if (tool.dataset.tool === 'edit') edit(c); else remove(c);
    });
    draw();
    T.ui.modal({ title: `🃏 Thẻ của ${student.name}`, body, wide: true, onClose: done });
  }

  T.evolve = { open, board };
})(window.TSTB);
