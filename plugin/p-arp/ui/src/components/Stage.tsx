// Fixed-layout stage, like a hardware panel: the UI is designed at one size (DESIGN_WIDTH x
// DESIGN_HEIGHT) and never reflows. When the plugin window is resized (aspect ratio locked by the
// plugin), the whole panel scales proportionally. Inside the plugin a grip in the bottom-right
// corner resizes the window (the plugin window itself can't be dragged larger in Logic).

import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { nativeFunction } from "../native";

const setEditorWidth = nativeFunction("setEditorWidth");

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
      {setEditorWidth && <ResizeGrip />}
    </div>
  );
}

// Drag to resize (width and height together, aspect ratio locked by the plugin); double-click
// returns to 100%. Uses screen coordinates: the page itself moves while the window resizes.
function ResizeGrip() {
  const drag = useRef<{ x: number; y: number; width: number; pending: number | null; frame: number } | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.screenX, y: e.screenY, width: window.innerWidth, pending: null, frame: 0 };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.screenX - d.x;
    const dy = (e.screenY - d.y) * (DESIGN_WIDTH / DESIGN_HEIGHT);
    d.pending = Math.round(d.width + (dx + dy) / 2);
    // At most one resize per frame
    if (!d.frame)
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        if (d.pending !== null) setEditorWidth!(d.pending);
      });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="resize-grip"
      title="Drag to resize (double-click: 100%)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setEditorWidth!(DESIGN_WIDTH)}
    />
  );
}
