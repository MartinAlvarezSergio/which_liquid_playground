import { useEffect, useRef, useState } from "react";
import { setLogicalTransform } from "../../core/canvasScale";
import { AppletHostAdapter } from "../../core/host";
import { AppletStage } from "../../ui/stage/AppletStage";
import { useCanvasBackingStore } from "../../ui/stage/hooks";
import { StageHero, StagePillButton, StagePills, StageReadout, StageSection, StageSelect, StageSlider, StageToggle } from "../../ui/stage/StageControls";
import { AXES, phaseOf, plutoAt, PLUTO_YEARS, SUBSTANCES, WORLDS, type World } from "./model";
import { Pond, pondLook, POND_H, POND_W } from "./pond";
import { fmtBar, fmtTemp, fromScreen, PHASE_COLOUR, PHASE_LABEL, renderChart, VIEW_H, VIEW_W, xOf, yOf } from "./render";
import "./whichLiquid.css";

type Props = {
  host?: AppletHostAdapter;
};

const TIP = {
  worlds: "Surface conditions on real worlds, and one imagined one. 'Your world' starts from the one you are on, then lets you move it.",
  substance: "Which substance's phase diagram to draw, and what fills the pond.",
  outline: "Draw the other substances' phase lines too, to compare where each is liquid.",
  hero: "Which of the six substances would be liquid at this world's surface temperature and pressure.",
  temperature: "Surface temperature.",
  pressure: "Surface air pressure. Earth's is about 1 bar.",
  yourT: "Your world's surface temperature. Both sliders jump by factors, like the chart.",
  yourP: "Your world's surface air pressure.",
  year: "Pluto's year lasts 248 of ours. It was closest to the Sun in 1989 and is farthest in 2113.",
  phase: "Solid, liquid, gas, or supercritical (too hot and squeezed for liquid and gas to be told apart) at these conditions."
} as const;

const SUBSTANCE_OPTIONS = SUBSTANCES.map((s) => ({ value: s.id, label: `${s.name} (${s.formula})` }));
const CUSTOM = "custom";
/** Pluto's years per second of animation: one Pluto year in about 25 s. */
const YEARS_PER_SECOND = 10;
const PLUTO_PATH = Array.from({ length: 125 }, (_, k) => plutoAt(PLUTO_YEARS.from + (k * (PLUTO_YEARS.to - PLUTO_YEARS.from)) / 124));
/** How close (px) a click must land to a world's dot to pick it, not drop your own world. */
const PICK_RADIUS = 14;

const lnT = { min: Math.log(AXES.Tmin), max: Math.log(AXES.Tmax) };
const logP = { min: Math.log10(AXES.Pmin), max: Math.log10(AXES.Pmax) };

function customWorld(T: number, P: number): World {
  return { id: CUSTOM, name: "Your world", T, P, note: "Your own world: drag its dot on the chart, or use the sliders." };
}

export function WhichLiquidCanvas({ host }: Props): JSX.Element {
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const pondRef = useRef<HTMLCanvasElement | null>(null);
  const [substanceId, setSubstanceId] = useState("water");
  const [outlineAll, setOutlineAll] = useState(false);
  const [selected, setSelected] = useState("earth");
  const [custom, setCustom] = useState<World | null>(null);
  const [plutoYear, setPlutoYear] = useState(2015);
  const [plutoPlaying, setPlutoPlaying] = useState(false);

  useCanvasBackingStore([pondRef]);

  const pluto = plutoAt(plutoYear);
  const base = WORLDS.map((w) =>
    w.id === "pluto"
      ? { ...w, T: pluto.T, P: pluto.P, note: `${Math.floor(plutoYear)}: ${pluto.r.toFixed(1)} AU from the Sun. Its thin nitrogen air is vapour from nitrogen frost on the ground, so it follows the frost line.` }
      : w
  );
  const worlds = custom ? [...base, custom] : base;
  const world = worlds.find((w) => w.id === selected) ?? base[0];
  const substance = SUBSTANCES.find((s) => s.id === substanceId) ?? SUBSTANCES[0];

  const live = useRef({ substance, outlineAll, worlds, selected, world, plutoPlaying });
  live.current = { substance, outlineAll, worlds, selected, world, plutoPlaying };

  useEffect(() => {
    const canvas = sceneRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    const pond = new Pond();
    let raf = 0;
    let last = performance.now();
    let yearCarry = 0;
    const tick = (now: number): void => {
      const elapsed = (now - last) / 1000;
      const dt = Math.min(0.1, elapsed);
      last = now;
      const s = live.current;
      if (s.plutoPlaying) {
        // Real elapsed time, so the year keeps its pace on a slow machine.
        yearCarry += Math.min(0.5, elapsed) * YEARS_PER_SECOND;
        if (yearCarry >= 0.5) {
          const step = yearCarry;
          yearCarry = 0;
          setPlutoYear((y) => (y + step > PLUTO_YEARS.to ? PLUTO_YEARS.from : y + step));
        }
      }
      setLogicalTransform(ctx, VIEW_W);
      renderChart(ctx, { substance: s.substance, outlineAll: s.outlineAll, worlds: s.worlds, selected: s.selected, path: s.selected === "pluto" ? PLUTO_PATH : undefined });
      const pctx = pondRef.current?.getContext("2d");
      if (pctx) {
        const look = pondLook(s.substance, s.world.T, s.world.P);
        pond.step(dt, look);
        setLogicalTransform(pctx, POND_W);
        pond.draw(pctx, s.substance, look, s.world.P);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Click a world's dot to pick it; click anywhere else to drop your own world, and drag to move it.
    let dragging = false;
    const toLogical = (e: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) * VIEW_W) / rect.width, y: ((e.clientY - rect.top) * VIEW_H) / rect.height };
    };
    const moveTo = (x: number, y: number): void => {
      const tp = fromScreen(x, y);
      if (tp) {
        setCustom(customWorld(tp.T, tp.P));
        setSelected(CUSTOM);
      }
    };
    const onDown = (e: PointerEvent): void => {
      const { x, y } = toLogical(e);
      if (!fromScreen(x, y)) {
        return;
      }
      const hit = live.current.worlds.find((w) => w.id !== CUSTOM && Math.hypot(xOf(w.T) - x, yOf(w.P) - y) < PICK_RADIUS);
      if (hit) {
        setSelected(hit.id);
        return;
      }
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      moveTo(x, y);
    };
    const onMove = (e: PointerEvent): void => {
      if (dragging) {
        const { x, y } = toLogical(e);
        moveTo(x, y);
      }
    };
    const onUp = (): void => {
      if (dragging) {
        dragging = false;
        host?.onResult?.({ event: "custom-world" });
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [host]);

  function pick(id: string): void {
    setSelected(id);
    setPlutoPlaying(false);
    // Pluto and Triton are about nitrogen frost and air.
    if (id === "pluto" || id === "triton") {
      setSubstanceId("nitrogen");
    }
    host?.onResult?.({ event: "world", world: id });
  }

  const phases = SUBSTANCES.map((s) => ({ s, phase: phaseOf(s, world.T, world.P) }));
  const liquids = phases.filter((p) => p.phase === "liquid").map((p) => p.s.name);
  const isCustom = selected === CUSTOM && custom;

  const controls = (
    <>
      <StageSection title="World">
        <div data-hover-help={TIP.worlds}>
          <StagePills>
            {WORLDS.map((w) => (
              <StagePillButton key={w.id} label={w.name} onClick={() => pick(w.id)} />
            ))}
            <StagePillButton
              label="Your world"
              onClick={() => {
                setCustom(customWorld(world.T, world.P));
                setSelected(CUSTOM);
                setPlutoPlaying(false);
              }}
            />
          </StagePills>
        </div>
        <p className="wl-note">{world.note}</p>
        {!isCustom && <p className="wl-note">Click anywhere on the chart to drop your own world, then drag it around.</p>}
      </StageSection>
      {isCustom && (
        <StageSection title="Your world">
          <StageSlider
            label="Temperature"
            display={`${Math.round(custom.T)} K`}
            value={Math.log(custom.T)}
            min={lnT.min}
            max={lnT.max}
            step={0.005}
            tip={TIP.yourT}
            onChange={(v) => setCustom(customWorld(Math.exp(v), custom.P))}
          />
          <StageSlider
            label="Air pressure"
            display={fmtBar(custom.P)}
            value={Math.log10(custom.P)}
            min={logP.min}
            max={logP.max}
            step={0.02}
            tip={TIP.yourP}
            onChange={(v) => setCustom(customWorld(custom.T, 10 ** v))}
          />
        </StageSection>
      )}
      {selected === "pluto" && (
        <StageSection title="Pluto's year">
          <StageSlider
            label="Year"
            display={`${Math.floor(plutoYear)}`}
            value={plutoYear}
            min={PLUTO_YEARS.from}
            max={PLUTO_YEARS.to}
            step={1}
            tip={TIP.year}
            onChange={(y) => {
              setPlutoYear(y);
              setPlutoPlaying(false);
            }}
          />
          <StagePills>
            <StagePillButton label={plutoPlaying ? "Pause" : "▶ Play Pluto's year"} onClick={() => setPlutoPlaying((p) => !p)} />
          </StagePills>
          <p className="wl-note">Watch the air pressure as Pluto moves away from the Sun: the air freezes onto the ground as frost.</p>
        </StageSection>
      )}
      <StageSection title="Phase diagram">
        <StageSelect label="Substance" value={substanceId} options={SUBSTANCE_OPTIONS} tip={TIP.substance} onChange={setSubstanceId} />
        <StagePills>
          <StageToggle label={`Compare all ${SUBSTANCES.length}`} tip={TIP.outline} on={outlineAll} onChange={setOutlineAll} />
        </StagePills>
      </StageSection>
    </>
  );

  const readouts = (
    <>
      <StageHero label="Liquids here" value={liquids.length === 0 ? "None" : liquids.length === 1 ? liquids[0] : `${liquids.length} of ${SUBSTANCES.length}`} tip={TIP.hero} />
      <StageReadout label="Temperature" value={fmtTemp(world.T)} tip={TIP.temperature} />
      <StageReadout label="Pressure" value={fmtBar(world.P)} tip={TIP.pressure} />
      {phases.map(({ s, phase }) => (
        <StageReadout key={s.id} label={s.name} value={PHASE_LABEL[phase]} valueColor={PHASE_COLOUR[phase]} tip={TIP.phase} />
      ))}
    </>
  );

  const inset = (
    <canvas
      ref={pondRef}
      style={{ width: POND_W, height: POND_H }}
      role="img"
      aria-label={`A pond of ${substance.name.toLowerCase()} at this world's surface temperature and pressure`}
    />
  );

  const info = (
    <>
      <h4>What you are seeing</h4>
      <ul>
        <li>A phase diagram: for each temperature (across) and pressure (up), whether the substance is solid, liquid or gas. Both axes jump by factors of ten.</li>
        <li>Each dot is a world's surface. The readouts list what each of the six substances would be there.</li>
        <li>Bottom right: a pond of the chosen substance at that world's surface. Drag your world around and watch it freeze, boil or turn to vapour.</li>
        <li>Liquid needs a pressure above the triple point: below it, ice turns straight into vapour (like dry ice). Above the critical point, liquid and gas merge into one supercritical fluid.</li>
      </ul>
      <h4>Why it matters for life</h4>
      <ul>
        <li>Life as we know it needs a liquid to dissolve and move chemicals. On Earth that is water; on Titan, the lakes are methane and ethane; ammonia is liquid between −78 °C and −33 °C at 1 atm.</li>
        <li>Mars's air is so thin that it sits right at water's triple point: ice there turns to vapour instead of melting.</li>
        <li>On Triton and Pluto the air is thin nitrogen, the vapour of nitrogen frost on the ground. As Pluto moves away from the Sun the frost cools and the air freezes back onto the ground.</li>
        <li>Pressure can rescue liquid water far from a star: a thick hydrogen blanket on a rogue planet could trap enough heat and pressure to keep oceans.</li>
      </ul>
      <h4>Try</h4>
      <ul>
        <li>Pick Titan. Which liquids could fill its lakes? What is its water doing?</li>
        <li>Pick Mars and choose water. Drag your world to give Mars lakes: what has to change, the temperature or the air?</li>
        <li>Pick Pluto and play its year. How much thinner does the air get by 2113?</li>
        <li>Drop your own world where water and ammonia are both liquid. Is there such a place?</li>
      </ul>
      <h4>Simplified on purpose</h4>
      <ul>
        <li>Each diagram is built from measured points (triple point, boiling point at 1 atm, critical point) joined by Clausius–Clapeyron curves; the melting line is drawn straight up. Nitrogen's frost line runs through Voyager 2's measurement on Triton. Close to a line, real behaviour can differ a little.</li>
        <li>One temperature and pressure per world, though real surfaces vary. Europa's surface ices can last because, that cold, they evaporate very slowly.</li>
        <li>Pluto's frost temperature here follows sunlight alone (as distance to the −1/2, matched to New Horizons in 2015). Real frost lags behind the seasons, so models differ on how far the air collapses.</li>
        <li>Mixtures behave differently: salt water freezes colder, ammonia mixed into water keeps it liquid far below 0 °C, and Titan's methane carries dissolved nitrogen.</li>
      </ul>
    </>
  );

  return (
    <AppletStage
      logicalWidth={VIEW_W}
      logicalHeight={VIEW_H}
      canvasRef={sceneRef}
      canvasLabel={`Phase diagram of ${substance.name}, with the surface conditions of several worlds`}
      controls={controls}
      controlsWidth={290}
      readouts={readouts}
      inset={inset}
      info={info}
      rootClassName="which-liquid"
    />
  );
}
