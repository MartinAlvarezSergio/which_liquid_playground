import { boilingPressure, phaseOf, sublimationPressure, type Phase, type Substance } from "./model";

export const POND_W = 300;
export const POND_H = 200;

const INK = "rgba(235, 232, 226, 0.92)";
const MUTED = "rgba(235, 232, 226, 0.6)";

/** What the pond is doing, for the caption, and how strongly (0–1) each effect shows. */
export type PondLook = {
  phase: Phase;
  status: string;
  /** Liquid filling the basin, ice over it, bubbles, vapour rising, supercritical haze. */
  liquid: number;
  ice: number;
  boil: number;
  vapour: number;
  haze: number;
};

const clamp = (x: number): number => Math.max(0, Math.min(1, x));

/** How the pond should look for a substance at a temperature and pressure. */
export function pondLook(s: Substance, T: number, P: number): PondLook {
  const phase = phaseOf(s, T, P);
  switch (phase) {
    case "liquid": {
      // Bubbles grow as the pressure nears the boiling line; floes appear just above the freezing point.
      const boil = clamp(1 - Math.log10(P / boilingPressure(s, T)) / Math.log10(4));
      const ice = T < s.triple.T * 1.04 ? 0.45 : 0;
      const status = boil > 0.5 ? "On the boil" : ice > 0 ? "Icing over" : "Liquid";
      return { phase, status, liquid: 1, ice, boil, vapour: boil * 0.6, haze: 0 };
    }
    case "solid": {
      const near = clamp(1 - Math.log10(P / sublimationPressure(s, T)) / Math.log10(4));
      return { phase, status: near > 0.8 ? "Frost and vapour in balance" : near > 0.4 ? "Frost turning to vapour" : "Frozen solid", liquid: 0, ice: 1, boil: 0, vapour: near * 0.7, haze: 0 };
    }
    case "gas":
      return { phase, status: "All gone to vapour", liquid: 0, ice: 0, boil: 0, vapour: 1, haze: 0 };
    case "supercritical":
      return { phase, status: "No surface: supercritical", liquid: 0, ice: 0, boil: 0, vapour: 0, haze: 1 };
  }
}

type Particle = { x: number; y: number; v: number; r: number; life: number };

/** The pond's animated state: effects ease towards their targets so changes play out on screen. */
export class Pond {
  private liquid = 1;
  private ice = 0;
  private boil = 0;
  private vapour = 0;
  private haze = 0;
  private bubbles: Particle[] = [];
  private puffs: Particle[] = [];
  private clock = 0;

  step(dt: number, look: PondLook): void {
    this.clock += dt;
    const ease = (from: number, to: number, rate: number): number => from + (to - from) * Math.min(1, dt * rate);
    this.liquid = ease(this.liquid, look.liquid, 1.4);
    this.ice = ease(this.ice, look.ice, 2);
    this.boil = ease(this.boil, look.boil, 3);
    this.vapour = ease(this.vapour, look.vapour, 2);
    this.haze = ease(this.haze, look.haze, 1.5);

    // Bubbles from the bottom of the pool, and puffs of vapour from its surface.
    if (Math.random() < this.boil * this.liquid * dt * 40) {
      this.bubbles.push({ x: 70 + Math.random() * 160, y: 168, v: 18 + Math.random() * 20, r: 1.5 + Math.random() * 2.5, life: 1 });
    }
    const draining = Math.max(0, this.liquid - look.liquid);
    if (Math.random() < (this.vapour + draining * 2) * dt * 10) {
      this.puffs.push({ x: 70 + Math.random() * 160, y: 145, v: 10 + Math.random() * 10, r: 6 + Math.random() * 8, life: 1 });
    }
    for (const b of this.bubbles) {
      b.y -= b.v * dt;
      if (b.y < 152) b.life = 0;
    }
    for (const p of this.puffs) {
      p.y -= p.v * dt;
      p.r += 6 * dt;
      p.life -= dt / 2.5;
    }
    this.bubbles = this.bubbles.filter((b) => b.life > 0).slice(-60);
    this.puffs = this.puffs.filter((p) => p.life > 0).slice(-40);
  }

  draw(ctx: CanvasRenderingContext2D, s: Substance, look: PondLook, P: number): void {
    ctx.clearRect(0, 0, POND_W, POND_H);
    // Sky: brighter the thicker the air.
    const air = clamp((Math.log10(P) + 3) / 8);
    const sky = ctx.createLinearGradient(0, 30, 0, 140);
    sky.addColorStop(0, `rgba(110, 150, 210, ${0.05 + 0.4 * air})`);
    sky.addColorStop(1, `rgba(160, 180, 210, ${0.03 + 0.25 * air})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 34, POND_W, 116);

    // Ground and the basin.
    ctx.fillStyle = "#3a332c";
    ctx.fillRect(0, 150, POND_W, POND_H - 150);
    const cx = POND_W / 2;
    const cy = 160;
    ctx.fillStyle = "#231e19";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 104, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // The liquid: shrinks into the middle of the basin as it boils or freezes away.
    if (this.liquid > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = s.colour;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 100 * Math.sqrt(this.liquid), 20 * Math.sqrt(this.liquid), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 * this.liquid;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k += 1) {
        const w = ((this.clock * 0.35 + k / 3) % 1) * 90 * Math.sqrt(this.liquid);
        ctx.beginPath();
        ctx.ellipse(cx, cy, w, w * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Ice over the basin, with cracks.
    if (this.ice > 0.02) {
      ctx.save();
      ctx.globalAlpha = 0.9 * this.ice;
      ctx.fillStyle = "#dbe8f6";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 102, 21, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 150, 190, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 70, cy - 4);
      ctx.lineTo(cx - 20, cy + 3);
      ctx.lineTo(cx + 15, cy - 6);
      ctx.lineTo(cx + 60, cy + 5);
      ctx.moveTo(cx - 20, cy + 3);
      ctx.lineTo(cx - 8, cy + 16);
      ctx.moveTo(cx + 15, cy - 6);
      ctx.lineTo(cx + 25, cy - 18);
      ctx.stroke();
      ctx.restore();
    }

    for (const b of this.bubbles) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.puffs) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(235, 240, 250, ${0.35 * p.life})`);
      g.addColorStop(1, "rgba(235, 240, 250, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Supercritical: a dense, shimmering fluid with no surface, filling the air above the basin.
    if (this.haze > 0.02) {
      const shimmer = 0.85 + 0.15 * Math.sin(this.clock * 3);
      const g = ctx.createLinearGradient(0, 40, 0, 185);
      g.addColorStop(0, "rgba(197, 155, 255, 0)");
      g.addColorStop(0.5, `rgba(197, 155, 255, ${0.25 * this.haze * shimmer})`);
      g.addColorStop(1, `rgba(197, 155, 255, ${0.55 * this.haze * shimmer})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 40, POND_W, 150);
    }

    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = INK;
    ctx.fillText(`A pond of ${s.name.toLowerCase()}`, 6, 12);
    ctx.font = "500 10px system-ui, sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText("sky brighter the thicker the air", 6, 27);
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.fillText(look.status, cx, 112);
  }
}
