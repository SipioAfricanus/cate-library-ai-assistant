// Canvas setup and the design-space -> surface mapping.
//
// The mascot is authored once in a fixed "design box" (see DESIGN in art/ram.js) and
// fitted into whatever surface it's asked to fill: a 300px website panel, a 200px desktop
// overlay, or a 460px inspection view. Nothing in the art ever deals in pixels.
//
// alpha:true is not optional here for the same reason it wasn't in the 3D version -- the
// website panel shows a CSS gradient through the canvas, and the desktop overlay window is
// transparent. Nothing may ever paint an opaque background.

/**
 * @param onResize  called after the surface is re-sized by the ResizeObserver (never for the
 *                  initial synchronous measure, which happens before the caller can paint).
 *
 * THIS CALLBACK IS LOAD-BEARING, not a convenience. Assigning canvas.width/height CLEARS the
 * bitmap, so any resize wipes the current frame. A running instance repaints on its next
 * animation frame and nobody notices -- but a PAUSED one never does, and is left blank
 * forever. That's not hypothetical: the harness's filmstrip is built from paused instances
 * painted once at construction, when their containers still measured zero. The observer then
 * fired with the real size, erased all eight, and they stayed empty. The same would strand a
 * desktop pet that resizes while paused.
 */
export function createSurface(canvas, container, onResize) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let dpr = 1;
  let cssW = 1;
  let cssH = 1;
  let ready = false;

  function resize() {
    const host = container || canvas.parentElement || canvas;
    cssW = host.clientWidth || 1;
    cssH = host.clientHeight || 1;
    // Cap DPR at 2: beyond that the pixel cost climbs fast for no visible gain on the
    // flat-vector art, and this runs all day on library machines.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    if (ready) onResize?.();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container || canvas);
  resize();
  // Only now is the caller in a position to repaint, so arm the callback after the first
  // measure. ResizeObserver's own first delivery is async and lands after this.
  ready = true;

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
