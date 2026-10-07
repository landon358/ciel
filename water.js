/* Water ripple over the hero film.
   The film is drawn through a WebGL shader that keeps a small height map of a water surface:
   the cursor (or a finger) drops disturbances into it, a wave equation spreads them, and the
   film is refracted by the surface slope, with a faint gloss highlight on the crests.
   Falls back to the plain <video> when WebGL2 or float render targets are missing,
   or when the visitor prefers reduced motion. Add ?water to the URL for a tuning panel. */
(function () {
  var hero = document.querySelector('[data-water]');
  if (!hero) return;
  var video = hero.querySelector('video');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'water';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
  if (!gl) return;
  var floatOk = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
  if (!floatOk) return;
  gl.getExtension('OES_texture_float_linear');

  var P = {
    strength: 0.11,   // how far the film bends
    radius: 0.04,     // drop size, fraction of the hero width
    damping: 0.987,    // 1 = never calms, lower = calms faster
    gloss: 1,       // crest highlight
    force: 1.4         // drop height
  };

  var VS = '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
  var SIM = '#version 300 es\nprecision highp float; in vec2 uv; out vec4 o; uniform sampler2D s; uniform vec2 px; uniform float damp;\n' +
    'void main(){ vec4 c = texture(s, uv);\n' +
    ' float avg = (texture(s, uv + vec2(px.x,0.)).r + texture(s, uv - vec2(px.x,0.)).r + texture(s, uv + vec2(0.,px.y)).r + texture(s, uv - vec2(0.,px.y)).r) * 0.25;\n' +
    ' float v = (c.g + (avg - c.r) * 2.0) * damp; float h = (c.r + v) * damp; o = vec4(h, v, 0., 1.); }';
  var DROP = '#version 300 es\nprecision highp float; in vec2 uv; out vec4 o; uniform sampler2D s; uniform vec2 at; uniform float rad; uniform float force; uniform float aspect;\n' +
    'void main(){ vec4 c = texture(s, uv); vec2 d = (uv - at) * vec2(aspect, 1.0); float k = max(0.0, 1.0 - length(d) / rad);\n' +
    ' k = 0.5 - cos(k * 3.14159265) * 0.5; o = vec4(c.r + k * force, c.g, 0., 1.); }';
  var DRAW = '#version 300 es\nprecision highp float; in vec2 uv; out vec4 o; uniform sampler2D s; uniform sampler2D film; uniform vec2 px; uniform vec2 scale; uniform float str; uniform float gloss;\n' +
    'void main(){ float hx = texture(s, uv + vec2(px.x,0.)).r - texture(s, uv - vec2(px.x,0.)).r;\n' +
    ' float hy = texture(s, uv + vec2(0.,px.y)).r - texture(s, uv - vec2(0.,px.y)).r;\n' +
    ' vec3 n = normalize(vec3(-hx, -hy, 0.12)); vec2 f = (uv - 0.5) * scale + 0.5; f.y = 1.0 - f.y;\n' +
    ' vec3 col = texture(film, f + n.xy * str).rgb;\n' +
    ' float spec = pow(max(0.0, dot(n, normalize(vec3(-0.4, 0.6, 1.0)))), 60.0) * gloss * smoothstep(0.0, 0.02, abs(hx) + abs(hy));\n' +
    ' o = vec4(col + spec, 1.0); }';

  function prog(fs) {
    function sh(t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p: p, u: u };
  }
  var sim, drop, draw;
  try { sim = prog(SIM); drop = prog(DROP); draw = prog(DRAW); } catch (e) { return; }

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function tex(w, h, internal, format, type) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    return t;
  }
  var film = tex();
  var targets = [], simW = 0, simH = 0, cssW = 0, cssH = 0;

  function makeTargets() {
    targets.forEach(function (t) { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.f); });
    targets = [0, 1].map(function () {
      var t = tex(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
      var f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t: t, f: f };
    });
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw 'fbo';
    targets.forEach(function (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); });
  }
  function resize() {
    var r = hero.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cssW = r.width; cssH = r.height;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    var nw = Math.max(96, Math.round(cssW / 4)), nh = Math.max(96, Math.round(cssH / 4));
    if (nw !== simW || nh !== simH) { simW = nw; simH = nh; makeTargets(); }
  }
  try { resize(); } catch (e) { return; }

  function pass(pr, target, src) {
    gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, target ? simW : canvas.width, target ? simH : canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
    gl.uniform1i(pr.u.s, 0);
    return pr.u;
  }
  function swap() { targets.reverse(); }

  var drops = [];
  function addDrop(x, y, f) { if (drops.length < 24) drops.push([x, 1 - y, f]); }

  /* Pointer: mouse movement leaves a wake; touches ripple where the finger goes */
  var last = null;
  function onMove(e) {
    var r = hero.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    if (last) {
      var dx = (x - last[0]) * cssW, dy = (y - last[1]) * cssH, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 6) return;
      addDrop(x, y, P.force * Math.min(1, d / 40));
    } else addDrop(x, y, P.force * 0.6);
    last = [x, y];
  }
  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerdown', function (e) { last = null; onMove(e); addDrop((e.clientX - hero.getBoundingClientRect().left) / cssW, (e.clientY - hero.getBoundingClientRect().top) / cssH, P.force * 1.4); }, { passive: true });
  hero.addEventListener('pointerleave', function () { last = null; });

  var visible = true, running = false, ready = false;
  new IntersectionObserver(function (es) { visible = es[es.length - 1].isIntersecting; if (visible) start(); }).observe(hero);
  window.addEventListener('resize', function () { try { resize(); } catch (e) {} });

  function frame() {
    if (!visible) { running = false; return; }
    requestAnimationFrame(frame);
    if (video.readyState < 2) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, film);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    if (!ready) { ready = true; hero.classList.add('water_on'); }

    var aspect = cssW / cssH;
    while (drops.length) {
      var d = drops.shift(), u = pass(drop, targets[1], targets[0]);
      gl.uniform2f(u.at, d[0], d[1]); gl.uniform1f(u.rad, P.radius * aspect); gl.uniform1f(u.force, d[2]); gl.uniform1f(u.aspect, aspect);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); swap();
    }
    for (var i = 0; i < 2; i++) {
      var s = pass(sim, targets[1], targets[0]);
      gl.uniform2f(s.px, 1 / simW, 1 / simH); gl.uniform1f(s.damp, P.damping);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); swap();
    }
    var w = pass(draw, null, targets[0]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, film); gl.uniform1i(w.film, 1);
    /* object-fit: cover */
    var va = (video.videoWidth || 16) / (video.videoHeight || 9), ca = canvas.width / canvas.height;
    gl.uniform2f(w.scale, ca > va ? 1 : ca / va, ca > va ? va / ca : 1);
    gl.uniform2f(w.px, 1 / simW, 1 / simH); gl.uniform1f(w.str, P.strength); gl.uniform1f(w.gloss, P.gloss);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function start() { if (!running) { running = true; requestAnimationFrame(frame); } }
  video.insertAdjacentElement('afterend', canvas);
  start();

  /* ?water: on-screen sliders for tuning */
  if (/[?&]water\b/.test(location.search)) {
    var panel = document.createElement('div');
    panel.className = 'water_panel';
    panel.innerHTML = Object.keys(P).map(function (k) {
      var lim = { strength: [0, 0.15, 0.005], radius: [0.01, 0.1, 0.005], damping: [0.95, 0.998, 0.001], gloss: [0, 1, 0.05], force: [0.2, 2, 0.05] }[k];
      return '<label>' + k + ' <span>' + P[k] + '</span><input type="range" data-k="' + k + '" min="' + lim[0] + '" max="' + lim[1] + '" step="' + lim[2] + '" value="' + P[k] + '"></label>';
    }).join('');
    panel.addEventListener('input', function (e) { var k = e.target.dataset.k; P[k] = parseFloat(e.target.value); e.target.previousElementSibling.textContent = P[k]; });
    document.body.appendChild(panel);
  }
})();
