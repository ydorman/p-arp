// Live view: a scrolling piano roll of the generated notes. Rate, octave, pattern and gate show
// in the notes' placement and length; velocity in their color (Logic's piano roll scale: purple
// for soft, through blue, green and yellow, to red for 127). Drawn on a canvas every animation
// frame from the live feed (no React state per frame). When the transport stops the view freezes
// on the last notes.

import { useEffect, useRef } from "react";
import { useEngineStatus } from "../hooks/useEngineStatus";
import { feed, playhead } from "../live/liveFeed";

const WIDTH = 836; // design size (the stage scales it)
const HEIGHT = 190;
const GUTTER = 30; // octave labels on the left
const SCALE_WIDTH = 30; // velocity color scale on the right
const PLAYHEAD_AT = 0.86; // playhead position across the time area (the rest shows note tails)
const WINDOW_BARS = 2;
const MIN_SPAN = 13; // semitones shown at least (one octave, both ends)

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Velocity color like Logic's piano roll: hue 270 (purple) at 0 down to 0 (red) at 127. */
export function velocityColor(velocity: number) {
  const hue = 270 * (1 - Math.min(127, Math.max(0, velocity)) / 127);
  return `hsl(${hue.toFixed(0)}, 85%, 60%)`;
}

function cssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function LiveView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useEngineStatus();

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const colors = {
      text: cssColor("--text"),
      faint: cssColor("--faint"),
      line: cssColor("--line"),
    };
    // Pitch range shown: grows at once to fit new notes, shrinks slowly (no jumping)
    let low = 60 - 6;
    let high = 60 + 6;
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);

      // Backing store at the on-screen size (the stage may be scaled) for sharp lines
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = (rect.width / WIDTH) * window.devicePixelRatio;
      const backingWidth = Math.round(WIDTH * pixelRatio);
      if (canvas.width !== backingWidth) {
        canvas.width = backingWidth;
        canvas.height = Math.round(HEIGHT * pixelRatio);
      }
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      const s = feed.status;
      const now = playhead(performance.now());
      const windowBeats = WINDOW_BARS * (s.beatsPerBar || 4);
      const timeLeft = GUTTER;
      const timeRight = WIDTH - SCALE_WIDTH;
      const pxPerBeat = ((timeRight - timeLeft) * PLAYHEAD_AT) / windowBeats;
      const startTime = now - windowBeats;
      const endTime = startTime + (timeRight - timeLeft) / pxPerBeat;
      const xAt = (time: number) => timeLeft + (time - startTime) * pxPerBeat;
      const visible = feed.notes.filter((n) => n.time + n.length >= startTime && n.time <= endTime);
      const rollTop = 4;
      const rollBottom = HEIGHT - 4;

      // Pitch range
      if (visible.length) {
        let lo = Math.min(...visible.map((n) => n.pitch)) - 1;
        let hi = Math.max(...visible.map((n) => n.pitch)) + 1;
        if (hi - lo < MIN_SPAN) {
          const mid = (lo + hi) / 2;
          lo = mid - MIN_SPAN / 2;
          hi = mid + MIN_SPAN / 2;
        }
        low = lo < low ? lo : low + (lo - low) * 0.03;
        high = hi > high ? hi : high + (hi - high) * 0.03;
      }
      const rowHeight = (rollBottom - rollTop) / (high - low + 1);
      const yAt = (pitch: number) => rollBottom - (pitch - low + 1) * rowHeight;

      ctx.save();
      ctx.beginPath();
      ctx.rect(timeLeft, 0, timeRight - timeLeft, HEIGHT);
      ctx.clip();

      // Beat and bar lines (song position = timeline + offset as of the last status)
      const songOffset = s.ppq + 1 - s.timeline;
      for (let beat = Math.ceil(startTime + songOffset - 1); beat + 1 - songOffset <= endTime; beat++) {
        const x = Math.round(xAt(beat + 1 - songOffset)) + 0.5;
        const isBar = ((beat % s.beatsPerBar) + s.beatsPerBar) % s.beatsPerBar === 0;
        ctx.strokeStyle = colors.line;
        ctx.globalAlpha = isBar ? 1 : 0.45;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Octave lines (C)
      ctx.strokeStyle = colors.line;
      ctx.setLineDash([2, 3]);
      for (let pitch = Math.ceil(low / 12) * 12; pitch <= high; pitch += 12) {
        const y = Math.round(yAt(pitch) + rowHeight) + 0.5;
        ctx.beginPath();
        ctx.moveTo(timeLeft, y);
        ctx.lineTo(timeRight, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Notes, colored by velocity; a sounding note gets a light outline
      for (const n of visible) {
        const x = xAt(n.time);
        const w = Math.max(2, n.length * pxPerBeat - 1);
        const h = Math.max(2, Math.min(rowHeight - 0.5, 9));
        const y = yAt(n.pitch) + (rowHeight - h) / 2;
        ctx.fillStyle = velocityColor(n.velocity);
        ctx.fillRect(x, y, w, h);
        if (n.time <= now && now < n.time + n.length) {
          ctx.strokeStyle = colors.text;
          ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
        }
      }

      // Playhead
      const playX = Math.round(xAt(now)) + 0.5;
      ctx.strokeStyle = s.playing ? colors.text : colors.faint;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, HEIGHT);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Octave labels
      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillStyle = colors.faint;
      for (let pitch = Math.ceil(low / 12) * 12; pitch <= high; pitch += 12) {
        const y = yAt(pitch) + rowHeight / 2;
        if (y > rollTop + 4 && y < rollBottom - 2) ctx.fillText(`${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 2}`, 4, y);
      }

      // Velocity scale: 127 at the top, 1 at the bottom, a tick at the newest note's velocity
      const scaleX = timeRight + 10;
      const scaleTop = 16;
      const scaleBottom = HEIGHT - 16;
      for (let y = scaleTop; y < scaleBottom; y++) {
        ctx.fillStyle = velocityColor(127 * (1 - (y - scaleTop) / (scaleBottom - scaleTop)));
        ctx.fillRect(scaleX, y, 6, 1);
      }
      ctx.fillStyle = colors.faint;
      ctx.textAlign = "center";
      ctx.fillText("127", scaleX + 3, scaleTop - 8);
      ctx.fillText("1", scaleX + 3, scaleBottom + 8);
      const latest = feed.notes[feed.notes.length - 1];
      if (latest) {
        const y = Math.round(scaleBottom - (latest.velocity / 127) * (scaleBottom - scaleTop)) + 0.5;
        ctx.strokeStyle = colors.text;
        ctx.beginPath();
        ctx.moveTo(scaleX - 3, y);
        ctx.lineTo(scaleX + 9, y);
        ctx.stroke();
      }

      if (!visible.length) {
        ctx.fillText(s.playing ? "hold a chord" : "start the transport and hold a chord", (timeLeft + timeRight) / 2, (rollTop + rollBottom) / 2);
      }
      ctx.textAlign = "left";
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="live-view">
      <canvas ref={canvasRef} className="live-canvas" style={{ width: WIDTH, height: HEIGHT }} />
      <div className="live-status">
        <span>{feed.demo ? "◆ demo (outside the plugin)" : status.playing ? "▶ playing" : "■ stopped"}</span>
        <span>{status.bpm > 0 ? `${status.bpm.toFixed(1)} bpm` : "– bpm"}</span>
        <span>beat {(status.ppq + 1).toFixed(2)}</span>
        <span>
          notes {status.noteOnsIn} in / {status.noteOnsOut} out
        </span>
      </div>
    </div>
  );
}
