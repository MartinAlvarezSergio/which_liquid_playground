import { useEffect, useRef, useState } from "react";
import { setLogicalTransform } from "../../core/canvasScale";
import { AppletHostAdapter } from "../../core/host";
import { AppletStage } from "../../ui/stage/AppletStage";
import { StageHero, StagePillButton, StagePills, StageReadout, StageSection, StageSelect, StageToggle } from "../../ui/stage/StageControls";
import { phaseOf, SUBSTANCES, WORLDS, type World } from "./model";
import { fmtBar, fmtTemp, fromScreen, PHASE_COLOUR, PHASE_LABEL, renderChart, VIEW_H, VIEW_W } from "./render";
import "./whichLiquid.css";

type Props = {
  host?: AppletHostAdapter;
};

const TIP = {
  worlds: "Surface conditions on real worlds, and one imagined one.",
  substance: "Which substance's phase diagram to draw.",
  outline: "Draw the other substances' phase lines too, to compare where each is liquid.",
  hero: "Which of the five substances would be liquid at this world's surface temperature and pressure.",
  temperature: "Surface temperature.",
  pressure: "Surface air pressure. Earth's is about 1 bar.",
  phase: "Solid, liquid, gas, or supercritical (too hot and squeezed for liquid and gas to be told apart) at these conditions."
} as const;

const SUBSTANCE_OPTIONS = SUBSTANCES.map((s) => ({ value: s.id, label: `${s.name} (${s.formula})` }));

export function WhichLiquidCanvas({ host }: Props): JSX.Element {
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const [substanceId, setSubstanceId] = useState("water");
  const [outlineAll, setOutlineAll] = useState(false);
  const [selected, setSelected] = useState("earth");
  const [custom, setCustom] = useState<World | null>(null);

  const worlds = custom ? [...WORLDS, custom] : WORLDS;
  const world = worlds.find((w) => w.id === selected) ?? WORLDS[0];
  const substance = SUBSTANCES.find((s) => s.id === substanceId) ?? SUBSTANCES[0];

  const live = useRef({ substance, outlineAll, worlds, selected });
  live.current = { substance, outlineAll, worlds, selected };

  // The chart is still, so draw it once per frame only to keep up with resizes; it is cheap (cached regions).
  useEffect(() => {
    const canvas = sceneRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    let raf = 0;
    const tick = (): void => {
      setLogicalTransform(ctx, VIEW_W);
      renderChart(ctx, live.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onPointer = (e: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const tp = fromScreen(((e.clientX - rect.left) * VIEW_W) / rect.width, ((e.clientY - rect.top) * VIEW_H) / rect.height);
      if (!tp) {
        return;
      }
      setCustom({ id: "custom", name: "Your world", T: tp.T, P: tp.P, note: "Your own world: click anywhere on the chart to move it." });
      setSelected("custom");
    };
    canvas.addEventListener("pointerdown", onPointer);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  const phases = SUBSTANCES.map((s) => ({ s, phase: phaseOf(s, world.T, world.P) }));
  const liquids = phases.filter((p) => p.phase === "liquid").map((p) => p.s.name);

  const controls = (
    <>
      <StageSection title="World">
        <div data-hover-help={TIP.worlds}>
          <StagePills>
            {WORLDS.map((w) => (
              <StagePillButton
                key={w.id}
                label={w.name}
                onClick={() => {
                  setSelected(w.id);
                  host?.onResult?.({ event: "world", world: w.id });
                }}
              />
            ))}
          </StagePills>
        </div>
        <p className="wl-note">{world.note}</p>
        <p className="wl-note">Click anywhere on the chart to drop your own world.</p>
      </StageSection>
      <StageSection title="Phase diagram">
        <StageSelect label="Substance" value={substanceId} options={SUBSTANCE_OPTIONS} tip={TIP.substance} onChange={setSubstanceId} />
        <StagePills>
          <StageToggle label="Compare all five" tip={TIP.outline} on={outlineAll} onChange={setOutlineAll} />
        </StagePills>
      </StageSection>
    </>
  );

  const readouts = (
    <>
      <StageHero label="Liquids here" value={liquids.length === 0 ? "None" : liquids.length === 1 ? liquids[0] : `${liquids.length} of 5`} tip={TIP.hero} />
      <StageReadout label="Temperature" value={fmtTemp(world.T)} tip={TIP.temperature} />
      <StageReadout label="Pressure" value={fmtBar(world.P)} tip={TIP.pressure} />
      {phases.map(({ s, phase }) => (
        <StageReadout key={s.id} label={s.name} value={PHASE_LABEL[phase]} valueColor={PHASE_COLOUR[phase]} tip={TIP.phase} />
      ))}
    </>
  );

  const info = (
    <>
      <h4>What you are seeing</h4>
      <ul>
        <li>A phase diagram: for each temperature (across) and pressure (up), whether the substance is solid, liquid or gas. Both axes jump by factors of ten.</li>
        <li>Each dot is a world's surface. The readouts list what each of the five substances would be there.</li>
        <li>Liquid needs a pressure above the triple point: below it, ice turns straight into vapour (like dry ice). Above the critical point, liquid and gas merge into one supercritical fluid.</li>
      </ul>
      <h4>Why it matters for life</h4>
      <ul>
        <li>Life as we know it needs a liquid to dissolve and move chemicals. On Earth that is water; on Titan, the lakes are methane and ethane.</li>
        <li>Mars's air is so thin that it sits right at water's triple point: ice there turns to vapour instead of melting.</li>
        <li>Pressure can rescue liquid water far from a star: a thick hydrogen blanket on a rogue planet could trap enough heat and pressure to keep oceans.</li>
      </ul>
      <h4>Try</h4>
      <ul>
        <li>Pick Titan. Which liquids could fill its lakes? What is its water doing?</li>
        <li>Pick Venus, then look at carbon dioxide. Why is it neither liquid nor gas?</li>
        <li>Drop your own world on the chart where water and methane are both liquid. Is there such a place?</li>
      </ul>
      <h4>Simplified on purpose</h4>
      <ul>
        <li>Each diagram is built from measured points (triple point, boiling point at 1 atm, critical point) joined by Clausius–Clapeyron curves; the melting line is drawn straight up. Close to a line, real behaviour can differ a little.</li>
        <li>One temperature and pressure per world, though real surfaces vary. Europa's surface ices can last because, that cold, they evaporate very slowly.</li>
        <li>Mixtures behave differently: salt water freezes colder, and Titan's methane carries dissolved nitrogen.</li>
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
      info={info}
      rootClassName="which-liquid"
    />
  );
}
