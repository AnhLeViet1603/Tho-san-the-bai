// Trạng thái đang chọn: lớp / năm / tháng / tuần / tiết
(function (T) {
  'use strict';

  const LS_KEY = 'tstb.state';
  const now = T.time.parts(); // hôm nay theo UTC+7
  const state = {
    classId: null,
    year: now.year,
    month: now.month,
    week: Math.min(5, Math.ceil(now.day / 7)),
    period: 1
  };

  function init() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved && saved.classId) state.classId = saved.classId;
    } catch (err) { /* localStorage có thể bị chặn */ }
  }

  function set(patch) {
    Object.assign(state, patch);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ classId: state.classId }));
    } catch (err) { /* bỏ qua */ }
  }

  // Bảo đảm classId trỏ tới một lớp còn tồn tại; trả về lớp đó (hoặc null)
  function currentClass() {
    const list = T.classes.list();
    let cls = list.find(c => c.id === state.classId);
    if (!cls && list.length) {
      cls = list[0];
      set({ classId: cls.id });
    }
    return cls || null;
  }

  T.store = { state, init, set, currentClass };
})(window.TSTB);
