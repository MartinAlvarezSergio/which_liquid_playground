/**
 * Build a world: from its distance to a Sun-like star, its size and its air, a rough surface
 * temperature and pressure to put on the phase diagram. Rocky worlds of Earth's density throughout.
 */

import { ATM, phaseOf, SUBSTANCES, type Substance } from "./model";

export type Build = {
  /** Distance from the star (AU). */
  distance: number;
  /** Radius, in Earth radii. */
  size: number;
  /** Share of the planet's mass that is air, in units of Earth's share. */
  air: number;
  /** Strength of the greenhouse gases in that air: 1 is like Earth's and Venus's air, 0 none at all. */
  greenhouse: number;
};

export const BUILD_AXES = { dMin: 0.2, dMax: 60, rMin: 0.15, rMax: 2.5 };
export const EARTH_BUILD: Build = { distance: 1, size: 1, air: 1, greenhouse: 1 };

/** Starlight's temperature at 1 AU for a world that absorbs everything (K); falls as 1/√distance. */
const SUNLIGHT_1AU = 278.6;
/** Share of starlight a world reflects: Earth's. */
const ALBEDO = 0.3;
/**
 * Greenhouse blanket thickness (grey optical depth) for air of P bar: 0.83 × P^0.89. Calibrated so one
 * law gives Earth 288 K, Venus about 740 K under 92 bar, Mars about 207 K, and Titan about 97 K.
 */
const BLANKET = { k: 0.83, n: 0.892 };
/** Pressure left when a world cannot hold air: a near vacuum, like Europa's. */
export const NO_AIR = 1e-7;

/** Temperature from starlight alone, before any greenhouse warming. */
export function bareTemperature(distance: number): number {
  return (SUNLIGHT_1AU * (1 - ALBEDO) ** 0.25) / Math.sqrt(distance);
}

/**
 * Surface pressure: the air's weight per square metre. With the same share of the planet's mass as
 * air, a bigger planet has more air, stronger gravity and (relative to its mass) less area, so
 * pressure grows as size².
 */
export function airPressure(b: Build): number {
  return ATM * b.air * b.size ** 2;
}

export type AirHold = "keeps" | "leaking" | "loses";

/**
 * Can the world hold its air for billions of years? Compare its escape speed with how fast nitrogen
 * molecules move at the top of its air (taken as 4 × the starlight temperature, about right for
 * Earth's thin, sun-heated upper air). Keeps it above 6 ×, leaks slowly between 4 × and 6 ×.
 */
export function airHold(b: Pick<Build, "distance" | "size">): { hold: AirHold; ratio: number } {
  const escape = 11_190 * b.size;
  const top = 4 * bareTemperature(b.distance);
  const nitrogen = 28 * 1.6605e-27;
  const speed = Math.sqrt((3 * 1.380649e-23 * top) / nitrogen);
  const ratio = escape / speed;
  return { hold: ratio >= 6 ? "keeps" : ratio >= 4 ? "leaking" : "loses", ratio };
}

export function buildWorld(b: Build): { T: number; P: number; hold: AirHold } {
  const { hold } = airHold(b);
  const bare = bareTemperature(b.distance);
  if (hold === "loses" || b.air <= 0) {
    return { T: bare, P: NO_AIR, hold: "loses" };
  }
  const P = airPressure(b);
  const tau = b.greenhouse * BLANKET.k * (P / ATM) ** BLANKET.n;
  return { T: bare * (1 + 0.75 * tau) ** 0.25, P, hold };
}

/** Which liquid colours the map, first match wins: water, then ammonia, then the Titan liquids. */
export const MAP_ORDER = ["water", "ammonia", "methane", "ethane", "nitrogen", "co2"] as const;

/** The liquid that would pool on this world (first in MAP_ORDER), if any, and every liquid there. */
export function liquidsAt(T: number, P: number): { main: Substance | null; all: Substance[] } {
  const all = MAP_ORDER.map((id) => SUBSTANCES.find((s) => s.id === id)!).filter((s) => phaseOf(s, T, P) === "liquid");
  return { main: all[0] ?? null, all };
}

/** Real Solar System bodies on the map, and the phase-diagram world each one opens, if any. */
export const BODIES: { name: string; distance: number; size: number; world?: string; labelLeft?: boolean }[] = [
  { name: "Mercury", distance: 0.387, size: 0.383 },
  { name: "Venus", distance: 0.723, size: 0.949, world: "venus", labelLeft: true },
  { name: "Earth", distance: 1, size: 1, world: "earth" },
  { name: "Moon", distance: 1, size: 0.273 },
  { name: "Mars", distance: 1.524, size: 0.532, world: "mars" },
  { name: "Europa", distance: 5.2, size: 0.245, world: "europa" },
  { name: "Titan", distance: 9.58, size: 0.404, world: "titan" },
  { name: "Triton", distance: 30.1, size: 0.212, world: "triton" },
  { name: "Pluto", distance: 39.5, size: 0.186, world: "pluto" }
];
