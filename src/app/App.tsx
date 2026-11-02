import { useMemo } from "react";
import { AppletHostAdapter } from "../core/host";
import { WhichLiquidCanvas } from "../applets/which_liquid/WhichLiquidCanvas";

export function App(): JSX.Element {
  const host: AppletHostAdapter = useMemo(
    () => ({
      onClose: () => {},
      readReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }),
    []
  );

  return (
    <div className="app-shell">
      <main>
        <section className="modal card">
          <WhichLiquidCanvas host={host} />
        </section>
      </main>
    </div>
  );
}
