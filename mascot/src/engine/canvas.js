// Canvas setup and the design-space -> surface mapping.
//
// The mascot is authored once in a fixed "design box" (see DESIGN in art/ram.js) and
// fitted into whatever surface it's asked to fill: a 300px website panel, a 200px desktop
// overlay, or a 460px inspection view. Nothing in the art ever deals in pixels.
//
// alpha:true is not optional here for the same reason it wasn't in the 3D version -- the
// website panel shows a CSS gradient through the canvas, and the desktop overlay window is
// transparent. Nothing may ever paint an opaque background.

export function createSurface(canvas, container) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let dpr = 1;
  let cssW = 1;
  let cssH = 1;

  function resize() {
    const host = container || canvas.parentElement || canvas;
    cssW = host.clientWidth || 1;
    cssH = host.clientHeight || 1;
    // Cap DPR at 2: beyond that the pixel cost climbs fast for no visible gain on the
    // flat-vector art, and this runs all day on library machines.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container || canvas);
  resize();

  return {
    ctx,
    get width() { return cssW; },
    get height() { return cssH; },
    get dpr() { return dpr; },

    clear() {
      // Identity first: the previous frame left the fit matrix in place, and clearRect
      // honours the current transform.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },

    /**
     * Matrix mapping the design box onto the surface: uniform "contain" scale, centred
     * horizontally, and anchored so the design box's baseline sits near the bottom --
     * a mascot that drifts vertically as the panel resizes looks unmoored.
     */
    fitMatrix(design, { padding = 0.04, anchorY = 1 } = {}) {
      const pad = 1 - padding * 2;
      const scale = Math.min(cssW / design.w, cssH / design.h) * pad * dpr;
      const drawnW = design.w * scale;
      const drawnH = design.h * scale;
      const surfW = cssW * dpr;
      const surfH = cssH * dpr;
      return {
        a: scale, b: 0, c: 0, d: scale,
        e: (surfW - drawnW) / 2,
        f: (surfH - drawnH) * anchorY,
      };
    },
    dispose() { ro.disconnect(); },
  };
}
