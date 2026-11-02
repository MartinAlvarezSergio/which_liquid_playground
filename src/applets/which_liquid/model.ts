/**
 * Which liquid?: simple phase diagrams for five substances, and the surface conditions of some
 * worlds. Each diagram uses the measured triple and critical points (and the normal boiling point,
 * where there is one), joined by Clausius–Clapeyron curves, with a vertical melting line.
 * Units: kelvin and pascals.
 */

const R = 8.314;
export const ATM = 101_325;

export type Phase = "solid" | "liquid" | "gas" | "supercritical";

export type Substance = {
  id: string;
  name: string;
  formula: string;
  colour: string;
  triple: { T: number; P: number };
  critical: { T: number; P: number };
  /** Boiling point at 1 atm, if the liquid exists at 1 atm. */
  boils?: number;
  /** A second point on the solid–gas line: from the sublimation heat (J/mol), or a measured point. */
  sublimation: { heat: number } | { T: number; P: number };
};

export const SUBSTANCES: Substance[] = [
  {
    id: "water",
    name: "Water",
    formula: "H₂O",
    colour: "#5fb4ff",
    triple: { T: 273.16, P: 611.657 },
    critical: { T: 647.1, P: 22.064e6 },
    boils: 373.15,
    sublimation: { heat: 51_060 }
  },
  {
    id: "methane",
    name: "Methane",
    formula: "CH₄",
    colour: "#ffb35c",
    triple: { T: 90.69, P: 11_696 },
    critical: { T: 190.56, P: 4.599e6 },
    boils: 111.67,
    sublimation: { heat: 9_130 }
  },
  {
    id: "ethane",
    name: "Ethane",
    formula: "C₂H₆",
    colour: "#e98bff",
    triple: { T: 90.37, P: 1.14 },
    critical: { T: 305.32, P: 4.872e6 },
    boils: 184.6,
    sublimation: { heat: 17_600 }
  },
  {
    id: "co2",
    name: "Carbon dioxide",
    formula: "CO₂",
    colour: "#b9c3d6",
    triple: { T: 216.58, P: 518_000 },
    critical: { T: 304.13, P: 7.377e6 },
    // No liquid at 1 atm: dry ice turns straight to gas at 194.7 K.
    sublimation: { T: 194.69, P: ATM }
  },
  {
    id: "nitrogen",
    name: "Nitrogen",
    formula: "N₂",
    colour: "#7af0c8",
    triple: { T: 63.15, P: 12_520 },
    critical: { T: 126.19, P: 3.396e6 },
    boils: 77.36,
    sublimation: { heat: 6_290 }
  }
];

/** ln P along a straight line in (1/T, ln P) through two points: Clausius–Clapeyron with a constant heat. */
function lnLine(a: { T: number; P: number }, b: { T: number; P: number }, T: number): number {
  const f = (1 / T - 1 / a.T) / (1 / b.T - 1 / a.T);
  return Math.log(a.P) + f * (Math.log(b.P) - Math.log(a.P));
}

/** Liquid–gas line (boiling curve), triple point to critical point. */
export function boilingPressure(s: Substance, T: number): number {
  const nbp = s.boils ? { T: s.boils, P: ATM } : null;
  if (nbp && T <= nbp.T) {
    return Math.exp(lnLine(s.triple, nbp, T));
  }
  return Math.exp(lnLine(nbp ?? s.triple, s.critical, T));
}

/** Solid–gas line, below the triple point. */
export function sublimationPressure(s: Substance, T: number): number {
  const other = "heat" in s.sublimation ? null : s.sublimation;
  if (other) {
    return Math.exp(lnLine(s.triple, other, T));
  }
  const heat = (s.sublimation as { heat: number }).heat;
  return s.triple.P * Math.exp(-(heat / R) * (1 / T - 1 / s.triple.T));
}

export function phaseOf(s: Substance, T: number, P: number): Phase {
  if (T >= s.critical.T) {
    return P >= s.critical.P ? "supercritical" : "gas";
  }
  if (T < s.triple.T) {
    return P >= sublimationPressure(s, T) ? "solid" : "gas";
  }
  return P >= boilingPressure(s, T) ? "liquid" : "gas";
}

// ─── Worlds ──────────────────────────────────────────────────────────────────

export type World = { id: string; name: string; T: number; P: number; note: string };

export const WORLDS: World[] = [
  { id: "earth", name: "Earth", T: 288, P: ATM, note: "Average surface: 15 °C at 1 bar." },
  { id: "venus", name: "Venus", T: 737, P: 9.2e6, note: "Surface: 464 °C under 92 bar of carbon dioxide." },
  { id: "mars", name: "Mars", T: 210, P: 600, note: "Average surface: −63 °C at 0.006 bar." },
  { id: "titan", name: "Titan", T: 94, P: 1.47e5, note: "Saturn's largest moon: −179 °C under 1.5 bar of nitrogen." },
  { id: "europa", name: "Europa", T: 100, P: 1e-7, note: "Jupiter's icy moon: about −170 °C and almost no air. Its ocean lies under the ice." },
  {
    id: "rogue",
    name: "Rogue planet",
    T: 290,
    P: 1e8,
    note: "An Earth with no star but a thick hydrogen blanket holding in its inner heat. Illustrative numbers (about 1,000 bar)."
  }
];

export const AXES = { Tmin: 30, Tmax: 1000, Pmin: 1e-8, Pmax: 1e9 };
