import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Renders three spectrograms side-by-side:
 *  1. The user's audio (computed via WebAudio + FFT)
 *  2. A reference schematic of a HUMAN voice spectrum
 *     (rich harmonic stacks, jitter, breath noise in highs, natural gaps)
 *  3. A reference schematic of a SYNTHETIC / cloned voice spectrum
 *     (over-smooth harmonics, uniform noise floor, sharp high-freq roll-off,
 *      no micro-pauses)
 *
 * The reference panels are drawn procedurally so the comparison is always
 * visible even before analysis finishes.
 */
export function SpectrogramCompare({ src }: { src: string | null }) {
  const userCanvas = useRef<HTMLCanvasElement>(null);
  const humanCanvas = useRef<HTMLCanvasElement>(null);
  const synthCanvas = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draw the two reference panels once.
  useEffect(() => {
    if (humanCanvas.current) drawReference(humanCanvas.current, "human");
    if (synthCanvas.current) drawReference(synthCanvas.current, "synth");
  }, []);

  // Compute + draw the user's spectrogram whenever the source changes.
  useEffect(() => {
    if (!src || !userCanvas.current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AC();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        if (cancelled) return;
        drawSpectrogram(userCanvas.current!, audio);
        void ctx.close();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "decode failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Spectrogram — side-by-side comparison
        </div>
        <Legend />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel
          label="Your audio"
          tone="neutral"
          canvasRef={userCanvas}
          overlay={
            !src ? (
              <span className="text-[11px] text-slate-500">
                Record or upload to analyse
              </span>
            ) : loading ? (
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> decoding…
              </span>
            ) : error ? (
              <span className="text-[11px] text-rose-400">{error}</span>
            ) : null
          }
        />
        <Panel
          label="Human reference"
          tone="good"
          canvasRef={humanCanvas}
          caption="Rich harmonics · jitter · breath in highs · natural gaps"
        />
        <Panel
          label="Synthetic reference"
          tone="bad"
          canvasRef={synthCanvas}
          caption="Smooth harmonics · flat noise floor · sharp roll-off"
        />
      </div>
    </div>
  );
}

function Panel({
  label,
  tone,
  canvasRef,
  overlay,
  caption,
}: {
  label: string;
  tone: "good" | "bad" | "neutral";
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlay?: React.ReactNode;
  caption?: string;
}) {
  const border =
    tone === "good"
      ? "border-emerald-500/30"
      : tone === "bad"
        ? "border-rose-500/30"
        : "border-white/10";
  const dot =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "bad"
        ? "bg-rose-400"
        : "bg-slate-400";
  return (
    <div className={`overflow-hidden rounded-md border ${border} bg-black/40`}>
      <div className="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-2 py-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-[11px] font-medium text-slate-200">{label}</span>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={480}
          height={140}
          className="block h-[140px] w-full"
        />
        {overlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            {overlay}
          </div>
        )}
      </div>
      {caption && (
        <div className="border-t border-white/5 px-2 py-1 text-[10px] text-slate-500">
          {caption}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-slate-500">
      <span>low</span>
      <div className="h-1.5 w-24 rounded bg-gradient-to-r from-slate-900 via-emerald-500 to-rose-400" />
      <span>high energy</span>
    </div>
  );
}

/* ---------- rendering ---------- */

// Cool→hot colormap used across all three panels for visual consistency.
function color(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  // black → deep blue → teal → emerald → amber → rose
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [5, 8, 20]],
    [0.25, [14, 40, 90]],
    [0.5, [16, 140, 130]],
    [0.7, [60, 200, 120]],
    [0.85, [230, 190, 70]],
    [1.0, [240, 90, 110]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [s1, c1] = stops[i - 1];
    const [s2, c2] = stops[i];
    if (t <= s2) {
      const k = (t - s1) / (s2 - s1);
      return [
        c1[0] + (c2[0] - c1[0]) * k,
        c1[1] + (c2[1] - c1[1]) * k,
        c1[2] + (c2[2] - c1[2]) * k,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function drawSpectrogram(canvas: HTMLCanvasElement, audio: AudioBuffer) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const data = audio.getChannelData(0);
  const fftSize = 512;
  const hop = Math.max(1, Math.floor(data.length / W));
  const bins = fftSize / 2;
  const img = ctx.createImageData(W, H);

  // Simple DFT via correlation on downsampled window — cheap, good enough
  // for a schematic display.
  for (let x = 0; x < W; x++) {
    const start = x * hop;
    // window
    const win = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const s = data[start + i] ?? 0;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
      win[i] = s * w;
    }
    // Goertzel-ish magnitude per bin (sparse — every other bin for speed)
    const mags = new Float32Array(bins);
    for (let k = 1; k < bins; k += 1) {
      let re = 0,
        im = 0;
      const wk = (2 * Math.PI * k) / fftSize;
      for (let n = 0; n < fftSize; n += 2) {
        re += win[n] * Math.cos(wk * n);
        im -= win[n] * Math.sin(wk * n);
      }
      mags[k] = Math.sqrt(re * re + im * im);
    }
    // normalize log magnitude to 0..1
    let max = 1e-6;
    for (let k = 0; k < bins; k++) if (mags[k] > max) max = mags[k];
    for (let y = 0; y < H; y++) {
      // bottom = low freq, top = high freq
      const bin = Math.floor(((H - 1 - y) / H) * (bins - 1));
      const norm = Math.log10(1 + 9 * (mags[bin] / max));
      const [r, g, b] = color(norm);
      const idx = (y * W + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawReference(canvas: HTMLCanvasElement, kind: "human" | "synth") {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.createImageData(W, H);

  // Pseudo-random with fixed seed so panels are stable across renders.
  let seed = kind === "human" ? 1337 : 4242;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // A schematic pitch contour (F0 in normalized 0..1 vertical space)
  const pitch = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const t = x / W;
    if (kind === "human") {
      // natural intonation curve + jitter + short silences
      const base = 0.18 + 0.05 * Math.sin(t * Math.PI * 3.2) + 0.03 * Math.sin(t * 22);
      const jitter = (rand() - 0.5) * 0.012;
      const silent = (t > 0.32 && t < 0.36) || (t > 0.71 && t < 0.75);
      pitch[x] = silent ? -1 : base + jitter;
    } else {
      // over-smooth, slightly robotic — long stable plateaus, tiny jitter
      const seg = Math.floor(t * 4);
      const plateau = 0.17 + 0.025 * seg;
      pitch[x] = plateau + 0.004 * Math.sin(t * 40);
    }
  }

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const freq = (H - 1 - y) / H; // 0 low → 1 high
      let energy = 0;

      if (pitch[x] > 0) {
        // Harmonic stack: peaks at multiples of F0
        const harmonics = kind === "human" ? 14 : 10;
        for (let h = 1; h <= harmonics; h++) {
          const hf = pitch[x] * h;
          if (hf > 1) break;
          const d = Math.abs(freq - hf);
          // human: slightly wider, jittery harmonics
          // synth: razor-thin, evenly spaced
          const width = kind === "human" ? 0.006 + rand() * 0.003 : 0.003;
          const amp =
            kind === "human"
              ? Math.exp(-Math.pow(d / width, 2)) * (1 - h / (harmonics + 2))
              : Math.exp(-Math.pow(d / width, 2)) *
                (1 - h / (harmonics + 4)) *
                1.05;
          energy += amp;
        }
      }

      // Noise floor / breathiness
      if (kind === "human") {
        // breath noise concentrated in highs, sparse elsewhere
        const breath = freq > 0.55 ? 0.12 + rand() * 0.18 : rand() * 0.05;
        energy += breath * 0.55;
      } else {
        // uniform flat noise floor (a tell of TTS), sharp high-freq cutoff
        const flat = 0.08 + rand() * 0.04;
        const rolloff = freq > 0.7 ? Math.max(0, 1 - (freq - 0.7) / 0.15) : 1;
        energy += flat * rolloff * 0.6;
      }

      // formant emphasis bands to make it read as "speech"
      const formants =
        kind === "human"
          ? [0.09, 0.18, 0.28, 0.42]
          : [0.1, 0.2, 0.3]; // fewer, more rigid
      for (const f of formants) {
        const d = Math.abs(freq - f);
        energy += Math.exp(-Math.pow(d / 0.03, 2)) * (kind === "human" ? 0.35 : 0.45);
      }

      const v = Math.max(0, Math.min(1, Math.log10(1 + 9 * energy) * 0.9));
      const [r, g, b] = color(v);
      const idx = (y * W + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Annotation strokes on top
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}
