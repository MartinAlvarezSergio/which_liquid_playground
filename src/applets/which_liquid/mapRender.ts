import { PLOT, VIEW_H, VIEW_W } from "./render";
import { BODIES, BUILD_AXES, buildWorld, liquidsAt, type Build } from "./worldBuilder";

const INK = "rgba(235, 232, 226, 0.92)";
const MUTED = "rgba(235, 232, 226, 0.6)";
/** Shading for worlds too small or hot to hold air. */
export const NO_AIR_COLOUR = "rgba(120, 120, 130, 0.35)";

// ─── Scales: distance across, size up, both by factors ───────────────────────

const ld = { min: Math.log10(BUILD_AXES.dMin), max: Math.log10(BUILD_AXES.dMax) };
const lr = { min: Math.log10(BUILD_AXES.rMin), max: Math.log10(BUILD_AXES.rMax) };

export function xOfDistance(d: number): number {
  return PLOT.left + ((Math.log10(d) - ld.min) / (ld.max - ld.min)) * (PLOT.right - PLOT.left);
}

export function yOfSize(r: number): number {
  return PLOT.bottom - ((Math.log10(r) - lr.min) / (lr.max - lr.min)) * (PLOT.bottom - PLOT.top);
}

export function fromMap(x: number, y: number): { distance: number; size: number } | null {
  if (x < PLOT.left || x > PLOT.right || y < PLOT.top || y > PLOT.bottom) {
    return null;
  }
  return {
    distance: 10 ** (ld.min + ((x - PLOT.left) / (PLOT.right - PLOT.left)) * (ld.max - ld.min)),
    size: 10 ** (lr.min + ((PLOT.bottom - y) / (PLOT.bottom - PLOT.top)) * (lr.max - lr.min))
  };
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, colour = INK, size = 13, align: CanvasTextAlign = "center", weight = 600): void {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(5, 7, 13, 0.85)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(s, x, y);
}

/** The map's shading for one setting of the air, painted cell by cell; the last few are kept. */
const shadeCache = new Map<string, HTMLCanvasElement>();
function shading(air: number, greenhouse: number): HTMLCanvasElement {
  const key = `${air.toPrecision(3)}|${greenhouse.toFixed(2)}`;
  const cached = shadeCache.get(key);
  if (cached) {
    return cached;
  }
  const w = PLOT.right - PLOT.left;
  const h = PLOT.bottom - PLOT.top;
  const cell = 3;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const at = fromMap(PLOT.left + x + cell / 2, PLOT.top + y + cell / 2)!;
      const world = buildWorld({ distance: at.distance, size: at.size, air, greenhouse });
      if (world.hold === "loses") {
        g.fillStyle = NO_AIR_COLOUR;
      } else {
        const main = liquidsAt(world.T, world.P).main;
        if (!main) {
          continue;
        }
        g.fillStyle = main.colour;
        g.globalAlpha = 0.55;
      }
      g.fillRect(x, y, cell, cell);
      g.globalAlpha = 1;
    }
  }
  if (shadeCache.size > 12) {
    shadeCache.delete(shadeCache.keys().next().value!);
  }
  shadeCache.set(key, c);
  return c;
}

export type MapView = {
  build: Build;
  /** Show your world's marker (it was built here, not dropped on the phase diagram). */
  showBuild: boolean;
  /** The phase-diagram world that is selected, to ring its body on the map. */
  selected: string;
};

export function renderMap(ctx: CanvasRenderingContext2D, v: MapView): void {
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { left, right, top, bottom } = PLOT;
  ctx.drawImage(shading(v.build.air, v.build.greenhouse), left, top, right - left, bottom - top);

  ctx.lineWidth = 1;
  for (const d of [0.3, 1, 3, 10, 30]) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(xOfDistance(d), top);
    ctx.lineTo(xOfDistance(d), bottom);
    ctx.stroke();
    text(ctx, `${d} AU`, xOfDistance(d), bottom + 14, MUTED, 11, "center", 500);
  }
  text(ctx, "Distance from a Sun-like star →", (left + right) / 2, bottom + 34, MUTED, 12, "center");
  for (const r of [0.2, 0.5, 1, 2]) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(left, yOfSize(r));
    ctx.lineTo(right, yOfSize(r));
    ctx.stroke();
    text(ctx, `${r} ×`, left - 8, yOfSize(r), MUTED, 11, "right", 500);
  }
  ctx.save();
  ctx.translate(left - 70, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, "Size (Earth = 1) →", 0, 0, MUTED, 12);
  ctx.restore();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.strokeRect(left, top, right - left, bottom - top);
  text(ctx, "Where would liquid pool?", left, top - 34, INK, 16, "left");
  text(ctx, "Shading: worlds with your air settings. Dots: the real worlds, with their own air.", left, top - 14, MUTED, 11, "left", 500);

  for (const b of BODIES) {
    const x = xOfDistance(b.distance);
    const y = yOfSize(b.size);
    const on = b.world !== undefined && b.world === v.selected && !v.showBuild;
    ctx.fillStyle = on ? "#ffd36b" : b.world ? "#ffffff" : "rgba(255, 255, 255, 0.55)";
    ctx.beginPath();
    ctx.arc(x, y, on ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      ctx.strokeStyle = "#ffd36b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    text(ctx, b.name, b.labelLeft ? x - 9 : x + 9, y - 11, on ? "#ffd36b" : b.world ? INK : MUTED, 12, b.labelLeft ? "right" : "left");
  }

  if (v.showBuild) {
    const x = xOfDistance(v.build.distance);
    const y = yOfSize(v.build.size);
    ctx.strokeStyle = "#ffd36b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 17, y);
    ctx.lineTo(x - 6, y);
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + 17, y);
    ctx.moveTo(x, y - 17);
    ctx.lineTo(x, y - 6);
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y + 17);
    ctx.stroke();
    text(ctx, "Your world", x + 14, y + 20, "#ffd36b", 13, "left");
  }
}
