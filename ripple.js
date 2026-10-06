(function () {
  // Slow topographic flow behind the contact page
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fit(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    return dpr;
  }

  var rc = document.getElementById('ripple');
  var rctx = rc.getContext('2d');
  var RN = 90, rField, rCols, rRows, rCell, rVisible = false, rLast = 0;
  function fitRipple() {
    fit(rc);
    if (!rc.width || !rc.height) { rField = null; return; }
    rCell = rc.width / RN;
    rCols = RN; rRows = Math.ceil(rc.height / rCell);
    rField = new Float32Array((rCols + 1) * (rRows + 1));
  }
  fitRipple();
  window.addEventListener('resize', fitRipple);
  new IntersectionObserver(function (e) { rVisible = e[e.length - 1].isIntersecting; }).observe(rc);

  function rippleContour(level) {
    var w = rCols + 1;
    for (var j = 0; j < rRows; j++) {
      for (var i = 0; i < rCols; i++) {
        var a = rField[j * w + i], b = rField[j * w + i + 1], c = rField[(j + 1) * w + i + 1], d = rField[(j + 1) * w + i];
        var idx = (a > level) | ((b > level) << 1) | ((c > level) << 2) | ((d > level) << 3);
        if (idx === 0 || idx === 15) continue;
        var x = i * rCell, y = j * rCell, s = rCell;
        var T = [x + s * (level - a) / (b - a), y], Rt = [x + s, y + s * (level - b) / (c - b)];
        var B = [x + s * (level - d) / (c - d), y + s], L = [x, y + s * (level - a) / (d - a)];
        var segs = ({ 1: [L, T], 14: [L, T], 2: [T, Rt], 13: [T, Rt], 3: [L, Rt], 12: [L, Rt], 4: [Rt, B], 11: [Rt, B], 6: [T, B], 9: [T, B], 7: [L, B], 8: [L, B], 5: [L, T, Rt, B], 10: [T, Rt, B, L] })[idx];
        for (var k = 0; k < segs.length; k += 2) { rctx.moveTo(segs[k][0], segs[k][1]); rctx.lineTo(segs[k + 1][0], segs[k + 1][1]); }
      }
    }
  }

  function drawRipple(now) {
    var t = reduce ? 0 : now / 7000, w = rCols + 1;
    for (var j = 0; j <= rRows; j++) {
      for (var i = 0; i <= rCols; i++) {
        var x = i / rCols * 4, y = j / rCols * 4;
        rField[j * w + i] = Math.sin(x + Math.sin(y * 0.8 + t) * 1.2) + Math.cos(y * 1.1 - Math.cos(x * 0.7 - t) * 1.1) + 0.5 * Math.sin((x + y) * 0.6 + t * 1.3);
      }
    }
    rctx.clearRect(0, 0, rc.width, rc.height);
    rctx.lineWidth = Math.max(1, rc.width / 1400);
    for (var lv = -2; lv <= 2; lv += 0.28) {
      rctx.beginPath();
      rippleContour(lv);
      rctx.strokeStyle = 'rgba(243,238,233,' + (0.12 + 0.1 * Math.cos(lv)) + ')';
      rctx.stroke();
    }
  }
  function rLoop(now) {
    requestAnimationFrame(rLoop);
    if (!rVisible || !rField || (reduce && rLast) || now - rLast < 50) return;
    rLast = now;
    drawRipple(now);
  }
  requestAnimationFrame(rLoop);
})();
