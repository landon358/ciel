(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header state
  var header = document.getElementById('header');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Hero film: play only while on screen
  var film = document.getElementById('film');
  if (reduce) { film.removeAttribute('autoplay'); film.pause(); }
  else {
    new IntersectionObserver(function (e) {
      if (e[e.length - 1].isIntersecting) film.play().catch(function () {}); else film.pause();
    }).observe(film);
  }

  // Live time, to the millisecond, with the date spelled out
  var months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var ones = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
    'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
  function ordinal(n) {
    if (n < 20) return ones[n];
    if (n === 20) return 'twentieth';
    if (n === 30) return 'thirtieth';
    return (n < 30 ? 'twenty-' : 'thirty-') + ones[n % 10];
  }
  var elDate = document.getElementById('heroDate'), elHms = document.getElementById('heroHms');
  var elMs = document.getElementById('heroMs'), elAmpm = document.getElementById('heroAmpm');
  var lastDay = -1;
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function tick() {
    var d = new Date();
    if (d.getDate() !== lastDay) { lastDay = d.getDate(); elDate.textContent = months[d.getMonth()] + ' ' + ordinal(lastDay); }
    var h = d.getHours();
    elHms.textContent = pad(h % 12 || 12, 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2);
    elMs.textContent = '.' + pad(d.getMilliseconds(), 3);
    elAmpm.textContent = h < 12 ? 'AM' : 'PM';
    requestAnimationFrame(tick);
  }
  tick();

})();
