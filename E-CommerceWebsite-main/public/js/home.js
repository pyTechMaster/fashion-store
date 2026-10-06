/* Hero slider: auto-plays, dots at the bottom (active dot is a long pill), pauses on hover. No library needed. */
(function () {
  var box = document.getElementById('containerSlider');
  if (!box) return;
  var slides = Array.prototype.slice.call(box.querySelectorAll('.slidingImage'));
  if (slides.length < 2) return;
  var cur = 0, timer = null;
  var dots = document.createElement('div');
  dots.className = 'heroDots';
  var btns = slides.map(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    b.addEventListener('click', function () { go(i); start(); });
    dots.appendChild(b);
    return b;
  });
  box.appendChild(dots);
  function go(n) {
    cur = (n + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle('active', i === cur); btns[i].classList.toggle('active', i === cur); });
  }
  function start() { stop(); timer = setInterval(function () { go(cur + 1); }, 4500); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  box.addEventListener('mouseenter', stop);
  box.addEventListener('mouseleave', start);
  /* swipe on touch screens */
  var x0 = null;
  box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (x0 !== null) { var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); }
    x0 = null; start();
  });
  box.classList.add('heroReady');
  go(0); start();
})();
