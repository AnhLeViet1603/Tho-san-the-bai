// Helper giao diện: escape, toast, modal, form, thẻ bài
window.TSTB = window.TSTB || {};
(function (T) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);

  const MAX_TOASTS = 3;

  function toast(msg, kind, ms) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.append(el);
    // Không để thông báo chồng lên nhau che màn hình
    while (box.children.length > MAX_TOASTS) box.firstElementChild.remove();
    const life = ms || 2600;
    setTimeout(() => el.classList.add('out'), life);
    setTimeout(() => el.remove(), life + 400);
  }

  // actions: [{ label, kind, onClick(close) }]
  function modal({ title, body, actions = [], wide, onClose }) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML =
      `<div class="modal ${wide ? 'wide' : ''}">
        <header><h3>${esc(title)}</h3><button type="button" class="x" data-x>✕</button></header>
        <div class="modal-body"></div>
        <footer></footer>
      </div>`;
    const bodyEl = wrap.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.append(body);

    let closed = false;
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close() {
      if (closed) return;
      closed = true;
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }

    const footer = wrap.querySelector('footer');
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.kind || '');
      b.textContent = a.label;
      b.onclick = () => a.onClick(close);
      footer.append(b);
    });
    if (!actions.length) footer.remove();

    wrap.querySelector('[data-x]').onclick = close;
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(wrap);
    return { el: wrap, body: bodyEl, close };
  }

  function confirm(message, opts = {}) {
    return new Promise(resolve => {
      modal({
        title: opts.title || 'Xác nhận',
        body: `<p class="confirm-msg">${esc(message)}</p>`,
        onClose: () => resolve(false),
        actions: [
          { label: 'Huỷ', kind: 'ghost', onClick: close => close() },
          { label: opts.okLabel || 'Đồng ý', kind: opts.danger ? 'danger' : '', onClick: close => { resolve(true); close(); } }
        ]
      });
    });
  }

  // Thu nhỏ ảnh về tối đa `max` px rồi trả về data URL
  function resizeImage(file, max = 600) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Không đọc được ảnh'));
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k);
          cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/webp', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // fields: [{ name, label, type, value, required, min, step, placeholder, hint, options, choices }]
  // type: text | number | color | textarea | select | emoji | image
  function form(title, fields, opts = {}) {
    return new Promise(resolve => {
      const images = {};
      const el = document.createElement('form');
      el.className = 'form';
      el.innerHTML = fields.map(f => {
        const v = f.value == null ? '' : f.value;
        let ctl;
        if (f.type === 'select') {
          ctl = `<select name="${f.name}">${f.options.map(o =>
            `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
        } else if (f.type === 'textarea') {
          ctl = `<textarea name="${f.name}" rows="3" placeholder="${esc(f.placeholder)}">${esc(v)}</textarea>`;
        } else if (f.type === 'emoji') {
          ctl = `<input name="${f.name}" value="${esc(v)}" maxlength="8" class="emoji-input">
            <div class="emoji-grid">${f.choices.map(e => `<button type="button" data-emoji="${f.name}">${e}</button>`).join('')}</div>`;
        } else if (f.type === 'image') {
          images[f.name] = v;
          ctl = `<div class="img-field" data-img="${f.name}">
            <div class="img-prev">${v ? `<img src="${esc(v)}" alt="">` : '<span>Chưa có ảnh</span>'}</div>
            <div class="img-btns">
              <input type="file" accept="image/*">
              <button type="button" class="btn sm ghost" data-clear>Bỏ ảnh</button>
            </div>
          </div>`;
        } else {
          ctl = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}"
            ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''}
            placeholder="${esc(f.placeholder)}">`;
        }
        return `<div class="field"><span>${esc(f.label)}</span>${ctl}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
      }).join('')
        // Nút gửi ẩn: form có từ 2 ô nhập trở lên chỉ gửi khi nhấn Enter nếu có nút submit
        + '<button type="submit" hidden></button>';

      el.addEventListener('click', e => {
        const em = e.target.closest('[data-emoji]');
        if (em) el.elements[em.dataset.emoji].value = em.textContent;
        const clr = e.target.closest('[data-clear]');
        if (clr) {
          const box = clr.closest('[data-img]');
          images[box.dataset.img] = '';
          box.querySelector('.img-prev').innerHTML = '<span>Chưa có ảnh</span>';
          box.querySelector('input[type=file]').value = '';
        }
      });
      el.addEventListener('change', async e => {
        const box = e.target.closest('[data-img]');
        if (!box || !e.target.files || !e.target.files[0]) return;
        try {
          const url = await resizeImage(e.target.files[0]);
          images[box.dataset.img] = url;
          box.querySelector('.img-prev').innerHTML = `<img src="${url}" alt="">`;
        } catch (err) {
          toast(err.message || 'Không đọc được ảnh', 'error');
        }
      });

      const submit = close => {
        if (!el.reportValidity()) return;
        const out = {};
        fields.forEach(f => {
          if (f.type === 'image') out[f.name] = images[f.name] || '';
          else if (f.type === 'number') out[f.name] = Number(el.elements[f.name].value || 0);
          else out[f.name] = el.elements[f.name].value.trim();
        });
        resolve(out);
        close();
      };

      const m = modal({
        title,
        body: el,
        wide: opts.wide,
        onClose: () => resolve(null),
        actions: [
          { label: 'Huỷ', kind: 'ghost', onClick: close => close() },
          { label: opts.okLabel || 'Lưu', onClick: submit }
        ]
      });
      el.addEventListener('submit', e => { e.preventDefault(); submit(m.close); });
      const first = el.querySelector('input:not([type=file]), textarea, select');
      if (first) { first.focus(); if (first.select) first.select(); }
    });
  }

  // HTML một lá bài (mặt trước, khung theo độ hiếm). opts: { footer }
  function cardHtml(card, opts = {}) {
    const art = card.image_data
      ? `<img src="${esc(card.image_data)}" alt="">`
      : `<span class="pcard-emoji">${esc(card.icon || '🃏')}</span>`;
    const r = T.cards.rarityOf(card.rarity);
    return `<div class="pcard pcard--${r.toLowerCase()}" data-card="${card.id}">
      <div class="pcard-art">${art}<span class="rbadge rbadge--${r.toLowerCase()}">${r}</span></div>
      <div class="pcard-info">
        <b>${esc(card.name)}</b>
        ${card.description ? `<p>${esc(card.description)}</p>` : ''}
      </div>
      ${opts.footer ? `<div class="pcard-foot">${opts.footer}</div>` : ''}
    </div>`;
  }

  // Bộ thẻ chia theo độ hiếm R → SSR, mỗi nhóm có tiêu đề + số thẻ.
  // opts: { foot(card) → footer của từng lá, head(rarity) → HTML thêm vào tiêu đề nhóm, skipEmpty }
  function cardGroups(cards, opts = {}) {
    return T.cards.RARITIES.map(r => {
      const mine = cards.filter(c => T.cards.rarityOf(c.rarity) === r);
      if (!mine.length && opts.skipEmpty) return '';
      return `<section class="rarity-group" data-rarity-group="${r}">
        <div class="rarity-head"><h3><span class="rbadge rbadge--${r.toLowerCase()}">${r}</span>
          ${esc(T.cards.rarityLabel(r).split(' · ')[1])} <small class="muted">(${mine.length} thẻ)</small></h3>
          ${opts.head ? opts.head(r) : ''}</div>
        ${mine.length ? `<div class="pcard-grid">${mine.map(c => cardHtml(c, { footer: opts.foot && opts.foot(c) })).join('')}</div>`
        : `<p class="muted">Chưa có thẻ ${r}.</p>`}
      </section>`;
    }).join('');
  }

  const empty = (icon, title, text, action) =>
    `<div class="empty"><div class="empty-ico">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action || ''}</div>`;

  // Thanh tab con: items = [[khoá, nhãn], …]; nút mang data-sub="<prefix><khoá>", màn gọi tự bắt sự kiện bấm
  const subTabs = (items, current, prefix = '') => `<div class="subtabs" role="tablist">${items.map(([k, label]) =>
    `<button type="button" role="tab" data-sub="${prefix}${k}" class="${current === k ? 'on' : ''}"
      aria-selected="${current === k}">${label}</button>`).join('')}</div>`;

  T.ui = { esc, toast, modal, confirm, form, resizeImage, cardHtml, cardGroups, empty, subTabs };
})(window.TSTB);
