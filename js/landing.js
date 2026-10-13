// Trang giới thiệu: lật thử thẻ và hiệu ứng hiện dần khi cuộn
(function () {
  'use strict';

  document.querySelectorAll('.flip').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('open'));
  });

  const blocks = document.querySelectorAll('.block, .final');
  if (!('IntersectionObserver' in window)) return;
  // Chỉ ẩn khi chắc chắn có thể hiện lại, để nội dung không bao giờ bị kẹt ở trạng thái ẩn
  document.documentElement.classList.add('reveal-on');
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08 });
  blocks.forEach(b => io.observe(b));
})();
