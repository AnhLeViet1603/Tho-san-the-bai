// Cộng ATP kèm thông báo; tự mở màn lật thẻ khi có học sinh vừa đạt thêm một mốc tiến hoá
(function (T) {
  'use strict';

  // opts: { amount, groupId, note }. Tự render lại màn hình sau khi cộng.
  T.award = function (studentIds, lessonId, type, opts) {
    if (!studentIds.length) {
      T.ui.toast('Chưa chọn học sinh nào', 'warn');
      return;
    }
    const lesson = T.lessons.get(lessonId);
    const flips = T.evolutions.flipsByClass(lesson.class_id);
    const before = T.atp.totalsByClass(lesson.class_id);
    const amount = T.atp.award(studentIds, lessonId, type, opts);
    const after = T.atp.totalsByClass(lesson.class_id);

    const names = {};
    T.students.list(lesson.class_id, true).forEach(s => { names[s.id] = s.name; });
    const ready = studentIds
      .filter(id => T.evolutions.pending(after[id] || 0, flips[id]) > T.evolutions.pending(before[id] || 0, flips[id]))
      .map(id => ({ id, name: names[id] }));

    const who = studentIds.length === 1 ? names[studentIds[0]] : studentIds.length + ' học sinh';
    T.ui.toast(`${amount >= 0 ? '+' : ''}${amount} ATP · ${T.atp.TYPES[type].label} · ${who}`);
    T.router.refresh();

    // Điểm nhóm: chỉ thông báo, giáo viên về chế độ Cá nhân để lật thẻ cho từng em
    if (ready.length === 1 && !(opts && opts.groupId)) {
      T.evolve.open(ready[0], () => T.router.refresh());
    } else if (ready.length) {
      // Gộp thành một thông báo ngắn dù có bao nhiêu em cùng đạt mốc
      const names = ready.slice(0, 3).map(s => s.name).join(', ')
        + (ready.length > 3 ? ` và ${ready.length - 3} em khác` : '');
      T.ui.toast(`🧬 Đủ ATP để tiến hoá: ${names}.${opts && opts.groupId ? ' Lật thẻ ở chế độ Cá nhân.' : ''}`, 'gold', 5000);
    }
  };

  // Hộp thoại cộng/trừ ATP tuỳ ý; trả về { amount, note } hoặc null
  T.askManual = async function () {
    const v = await T.ui.form('Cộng / trừ ATP', [
      { name: 'amount', label: 'Số ATP (số âm để trừ)', type: 'number', value: 1, required: true },
      { name: 'note', label: 'Ghi chú', placeholder: 'Ví dụ: làm bài tập thêm' }
    ], { okLabel: 'Ghi nhận' });
    if (!v || !v.amount) return null;
    return { amount: Math.trunc(v.amount), note: v.note };
  };
})(window.TSTB);
