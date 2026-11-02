import { ATM, AXES, boilingPressure, phaseOf, SUBSTANCES, sublimationPressure, type Phase, type Substance, type World } from "./model";

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const PLOT = { left: 430, right: 895, top: 60, bottom: 630 };

const INK = "rgba(235, 232, 226, 0.92)";
const MUTED = "rgba(235, 232, 226, 0.6)";

export const PHASE_LABEL: Record<Phase, string> = { solid: "Solid", liquid: "Liquid", gas: "Gas", supercritical: "Supercritical" };
export const PHASE_COLOUR: Record<Phase, string> = { solid: "#b9d4f0", liquid: "#6fe39a", gas: "rgba(235, 232, 226, 0.6)", supercritical: "#c59bff" };

// ─── Scales and formatting ───────────────────────────────────────────────────

const lt = { min: Math.log10(AXES.Tmin), max: Math.log10(AXES.Tmax) };
const lp = { min: Math.log10(AXES.Pmin), max: Math.log10(AXES.Pmax) };

export function xOf(T: number): number {
  return PLOT.left + ((Math.log10(T) - lt.min) / (lt.max - lt.min)) * (PLOT.right - PLOT.left);
}

export function yOf(P: number): number {
  return PLOT.bottom - ((Math.log10(P) - lp.min) / (lp.max - lp.min)) * (PLOT.bottom - PLOT.top);
}

export function fromScreen(x: number, y: number): { T: number; P: number } | null {
  if (x < PLOT.left || x > PLOT.right || y < PLOT.top || y > PLOT.bottom) {
    return null;
  }
  return {
    T: 10 ** (lt.min + ((x - PLOT.left) / (PLOT.right - PLOT.left)) * (lt.max - lt.min)),
    P: 10 ** (lp.min + ((PLOT.bottom - y) / (PLOT.bottom - PLOT.top)) * (lp.max - lp.min))
  };
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function power(p: number): string {
  return `10${String(p).replace("-", "⁻").replace(/\d/g, (d) => SUP[Number(d)])}`;
}

export function fmtBar(P: number): string {
  const bar = P / 1e5;
  if (bar >= 0.01 && bar < 1e5) return `${bar >= 10 ? Math.round(bar).toLocaleString("en-US") : +bar.toPrecision(2)} bar`;
  const p = Math.floor(Math.log10(bar));
  const m = bar / 10 ** p;
  return `${m < 1.05 ? "" : `${m.toFixed(0)} × `}${power(p)} bar`;
}

export function fmtTemp(T: number): string {
  return `${Math.round(T - 273.15)} °C (${Math.round(T)} K)`;
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, colour = INK, size = 13, align: CanvasTextAlign = "center", weight = 600): void {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(5, 7, 13, 0.8)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(s, x, y);
}

const REGION_FILL: Record<Phase, string> = {
  solid: "rgba(185, 212, 240, 0.32)",
  liquid: "rgba(111, 227, 154, 0.38)",
  gas: "rgba(0, 0, 0, 0)",
  supercritical: "rgba(197, 155, 255, 0.22)"
};

/** The selected substance's phase regions, painted cell by cell, cached per substance. */
const regionCache = new Map<string, HTMLCanvasElement>();
function regions(s: Substance): HTMLCanvasElement {
  const cached = regionCache.get(s.id);
  if (cached) {
    return cached;
  }
  const w = PLOT.right - PLOT.left;
  const h = PLOT.bottom - PLOT.top;
  const scale = 2;
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext("2d")!;
  const cell = 2;
  for (let y = 0; y < h * scale; y += cell) {
    for (let x = 0; x < w * scale; x += cell) {
      const tp = fromScreen(PLOT.left + (x + cell / 2) / scale, PLOT.top + (y + cell / 2) / scale)!;
      const fill = REGION_FILL[phaseOf(s, tp.T, tp.P)];
      if (fill !== REGION_FILL.gas) {
        g.fillStyle = fill;
        g.fillRect(x, y, cell, cell);
      }
    }
  }
  regionCache.set(s.id, c);
  return c;
}

function curve(ctx: CanvasRenderingContext2D, T0: number, T1: number, P: (T: number) => number): void {
  ctx.beginPath();
  for (let k = 0; k <= 80; k += 1) {
    const T = T0 * (T1 / T0) ** (k / 80);
    const x = xOf(T);
    const y = Math.max(PLOT.top, Math.min(PLOT.bottom, yOf(P(T))));
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * The lines between phases. In full: all three, the supercritical edges and the triple and critical
 * points. Otherwise just the outline of the liquid region, for comparing substances.
 */
function lines(ctx: CanvasRenderingContext2D, s: Substance, colour: string, width: number, full: boolean): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  if (full) {
    curve(ctx, Math.max(AXES.Tmin, s.triple.T * 0.3), s.triple.T, (T) => sublimationPressure(s, T));
  }
  curve(ctx, s.triple.T, s.critical.T, (T) => boilingPressure(s, T));
  ctx.beginPath();
  ctx.moveTo(xOf(s.triple.T), yOf(s.triple.P));
  ctx.lineTo(xOf(s.triple.T), PLOT.top);
  ctx.stroke();
  if (!full) {
    return;
  }
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(xOf(s.critical.T), yOf(s.critical.P));
  ctx.lineTo(xOf(s.critical.T), PLOT.top);
  ctx.moveTo(xOf(s.critical.T), yOf(s.critical.P));
  ctx.lineTo(PLOT.right, yOf(s.critical.P));
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [p, name] of [
    [s.triple, "triple point"],
    [s.critical, "critical point"]
  ] as const) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(xOf(p.T), yOf(p.P), 4, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, name, xOf(p.T) + 8, yOf(p.P) + 12, MUTED, 11, "left", 500);
  }
}

/** A point inside the plot for each region's label, kept clear of the edges. */
function labelSpot(s: Substance, phase: Phase): { x: number; y: number } {
  const clampX = (x: number): number => Math.max(PLOT.left + 50, Math.min(PLOT.right - 60, x));
  const clampY = (y: number): number => Math.max(PLOT.top + 18, Math.min(PLOT.bottom - 18, y));
  const mid = Math.sqrt(s.triple.T * s.critical.T);
  switch (phase) {
    case "solid":
      return { x: clampX(xOf(s.triple.T / 1.5)), y: clampY(yOf(s.critical.P)) };
    case "liquid":
      return { x: clampX(xOf(mid)), y: clampY(yOf(Math.min(AXES.Pmax / 3, boilingPressure(s, mid) * 30))) };
    case "gas":
      return { x: clampX(xOf(mid * 1.4)), y: clampY(yOf(boilingPressure(s, mid * 1.4) / 1e4)) };
    case "supercritical":
      return { x: clampX(xOf(s.critical.T * 1.6)), y: clampY(yOf(Math.min(AXES.Pmax / 3, s.critical.P * 30))) };
  }
}

export type ChartView = {
  substance: Substance;
  outlineAll: boolean;
  worlds: World[];
  selected: string;
  /** A track to draw through the chart (Pluto's year), if any. */
  path?: { T: number; P: number }[];
};

export function renderChart(ctx: CanvasRenderingContext2D, v: ChartView): void {
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { left, right, top, bottom } = PLOT;

  ctx.drawImage(regions(v.substance), left, top, right - left, bottom - top);

  // Grid: temperature (log) across, pressure (log) up.
  ctx.lineWidth = 1;
  for (const T of [30, 50, 100, 200, 300, 500, 1000]) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(xOf(T), top);
    ctx.lineTo(xOf(T), bottom);
    ctx.stroke();
    text(ctx, `${T} K`, xOf(T), bottom + 14, MUTED, 11, "center", 500);
  }
  text(ctx, "Temperature →", (left + right) / 2, bottom + 34, MUTED, 12, "center");
  for (let p = -13; p <= 4; p += 2) {
    const y = yOf(10 ** p * 1e5);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    text(ctx, p === 1 ? "10 bar" : p === -1 ? "0.1 bar" : `${power(p)} bar`, left - 8, y, MUTED, 11, "right", 500);
  }
  ctx.save();
  ctx.translate(left - 70, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, "Pressure →", 0, 0, MUTED, 12);
  ctx.restore();
  // Earth's air pressure, for reference.
  ctx.strokeStyle = "rgba(111, 179, 255, 0.5)";
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(left, yOf(ATM));
  ctx.lineTo(right, yOf(ATM));
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, "1 bar: Earth's air", right - 4, yOf(ATM) - 9, "rgba(111, 179, 255, 0.85)", 11, "right", 500);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.strokeRect(left, top, right - left, bottom - top);

  if (v.outlineAll) {
    for (const s of SUBSTANCES) {
      if (s.id !== v.substance.id) {
        lines(ctx, s, s.colour, 1.2, false);
        text(ctx, s.name, xOf(Math.sqrt(s.triple.T * s.critical.T)) + 4, yOf(boilingPressure(s, Math.sqrt(s.triple.T * s.critical.T))) + 12, s.colour, 11, "left", 500);
      }
    }
  }
  lines(ctx, v.substance, "rgba(255, 255, 255, 0.85)", 2, true);
  for (const phase of ["solid", "liquid", "gas", "supercritical"] as const) {
    // Too narrow a supercritical strip for its name: label it from just above the chart.
    if (phase === "supercritical" && right - xOf(v.substance.critical.T) < 130) {
      text(ctx, "SUPERCRITICAL ↓", right, top - 10, PHASE_COLOUR.supercritical, 12, "right");
      continue;
    }
    const at = labelSpot(v.substance, phase);
    text(ctx, PHASE_LABEL[phase].toUpperCase(), at.x, at.y, PHASE_COLOUR[phase], 14);
  }
  text(ctx, `${v.substance.name} (${v.substance.formula})`, left, top - 22, INK, 16, "left");

  if (v.path && v.path.length > 1) {
    ctx.strokeStyle = "rgba(255, 211, 107, 0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    v.path.forEach((p, i) => (i === 0 ? ctx.moveTo(xOf(p.T), yOf(p.P)) : ctx.lineTo(xOf(p.T), yOf(p.P))));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Worlds.
  for (const w of v.worlds) {
    const x = xOf(Math.max(AXES.Tmin, Math.min(AXES.Tmax, w.T)));
    const y = yOf(Math.max(AXES.Pmin, Math.min(AXES.Pmax, w.P)));
    const on = w.id === v.selected;
    ctx.fillStyle = on ? "#ffd36b" : "#ffffff";
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
    text(ctx, w.name, x + 10, w.labelBelow ? y + 14 : y - 12, on ? "#ffd36b" : INK, on ? 14 : 12, "left");
  }
}
