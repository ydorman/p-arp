// Fixed-layout stage, like a hardware panel: the UI is designed at one size (DESIGN_WIDTH x
// DESIGN_HEIGHT) and never reflows. When the plugin window is resized (aspect ratio locked by the
// plugin), the whole panel scales proportionally.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export const DESIGN_WIDTH = 1000;
export const DESIGN_HEIGHT = 640;

function fitScale() {
  return Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
}

export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(fitScale);
  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <div className="stage-viewport">
      <div className="stage" style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
