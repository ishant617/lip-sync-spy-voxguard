import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

/**
 * Live side-by-side spectrogram comparison.
 *
 *  1. "Your audio" panel — either a decoded spectrogram of the analysed
 *     clip (when `src` is provided) OR a real-time scrolling spectrogram
 *     from the microphone when the user hits "Go live".
 *  2. "Human reference" — procedurally generated scrolling spectrogram
 *     that mimics a natural voice (harmonic jitter, breath, micro-gaps).
 *  3. "Synthetic reference" — procedurally generated scrolling spectrogram
 *     that mimics TTS/clones (over-smooth harmonics, flat noise floor,
 *     sharp high-frequency roll-off).
 *
 *  All three panels animate on the same RAF loop so the comparison reads
 *  as a live, moving forensic display.
 */
export function SpectrogramCompare({ src }: { src: string | null }) {
  const userCanvas = useRef<HTMLCanvasElement>(null);
  const humanCanvas = useRef<HTMLCanvasElement>(null);
  const synthCanvas = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveMic, setLiveMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  /* ---------- animated reference panels (always live) ---------- */
  useEffect(() => {
    let raf = 0;
    const startedAt = performance.now();
    const tick = () => {
      const t = (performance.now() - startedAt) / 1000;
      if (humanCanvas.current) scrollReference(humanCanvas.current, "human", t);
      if (synthCanvas.current) scrollReference(synthCanvas.current, "synth", t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------- decoded user spectrogram (when src provided & not live) ---------- */
  useEffect(() => {
    if (liveMic) return;
    if (!src || !userCanvas.current) {
      if (userCanvas.current) clearCanvas(userCanvas.current);
      return;
    }
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
  }, [src, liveMic]);

  /* ---------- live microphone spectrogram ---------- */
  useEffect(() => {
    if (!liveMic) return;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cancelled = false;

    (async () => {
      try {
        setMicError(null);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        const bins = analyser.frequencyBinCount;
        const buf = new Uint8Array(bins);

        const canvas = userCanvas.current;
        if (!canvas) return;
        clearCanvas(canvas);
        const c = canvas.getContext("2d");
        if (!c) return;

        const tick = () => {
          analyser.getByteFrequencyData(buf);
          // scroll left by 1 pixel
          const img = c.getImageData(1, 0, canvas.width - 1, canvas.height);
          c.putImageData(img, 0, 0);
          // draw newest column on right
          const x = canvas.width - 1;
          for (let y = 0; y < canvas.height; y++) {
            const bin = Math.floor(((canvas.height - 1 - y) / canvas.height) * (bins - 1));
            const v = buf[bin] / 255;
            const [r, g, b] = color(v);
            c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
            c.fillRect(x, y, 1, 1);
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setMicError(e instanceof Error ? e.message : "mic denied");
        setLiveMic(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [liveMic]);

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Live spectrogram — side-by-side comparison
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLiveMic((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              liveMic
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            }`}
          >
            {liveMic ? (
              <>
                <Square className="h-3 w-3" /> Stop live mic
              </>
            ) : (
              <>
                <Mic className="h-3 w-3" /> Go live (mic)
              </>
            )}
          </button>
          <Legend />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel
          label={liveMic ? "Your audio · LIVE" : "Your audio"}
          tone="neutral"
          canvasRef={userCanvas}
          overlay={
            liveMic ? null : !src ? (
              <span className="text-[11px] text-slate-500">
                Record, upload, or hit "Go live"
              </span>
            ) : loading ? (
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> decoding…
              </span>
            ) : error ? (
              <span className="text-[11px] text-rose-400">{error}</span>
            ) : null
          }
          caption={micError ?? undefined}
        />
        <Panel
          label="Human reference · live"
          tone="good"
          canvasRef={humanCanvas}
          caption="Rich harmonics · jitter · breath in highs · natural gaps"
        />
        <Panel
          label="Synthetic reference · live"
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

function clearCanvas(canvas: HTMLCanvasElement) {
  const c = canvas.getContext("2d");
  if (!c) return;
  c.fillStyle = "rgb(5,8,20)";
  c.fillRect(0, 0, canvas.width, canvas.height);
}

// Cool→hot colormap used across all three panels for visual consistency.
function color(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
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

  for (let x = 0; x < W; x++) {
    const start = x * hop;
    const win = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const s = data[start + i] ?? 0;
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
      win[i] = s * w;
    }
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
    let max = 1e-6;
    for (let k = 0; k < bins; k++) if (mags[k] > max) max = mags[k];
    for (let y = 0; y < H; y++) {
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

/* ---------- animated procedural references ---------- */

// Deterministic hash-based RNG so panels look coherent across frames but
// still evolve over time via the `t` seed offset.
function hashRand(x: number, y: number, seed: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.7581) * 43758.5453;
  return s - Math.floor(s);
}

function scrollReference(
  canvas: HTMLCanvasElement,
  kind: "human" | "synth",
  time: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  // Scroll existing content left; draw a fresh column on the right.
  const shift = 2;
  const img = ctx.getImageData(shift, 0, W - shift, H);
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "rgb(5,8,20)";
  ctx.fillRect(W - shift, 0, shift, H);

  const seedBase = kind === "human" ? 1337 : 4242;

  for (let dx = 0; dx < shift; dx++) {
    const x = W - shift + dx;
    // Global time drives a moving pitch contour so the panel feels alive.
    const t = time * 0.6 + x * 0.001;
    let pitch: number;
    let silent = false;
    if (kind === "human") {
      const base =
        0.18 +
        0.05 * Math.sin(t * 3.2) +
        0.03 * Math.sin(t * 22) +
        0.02 * Math.sin(t * 7.1);
      const jitter = (hashRand(x, 0, seedBase + Math.floor(time * 8)) - 0.5) * 0.014;
      pitch = base + jitter;
      const gate = hashRand(0, 0, seedBase + Math.floor(t * 3));
      silent = gate > 0.93;
    } else {
      // stepped plateaus that shift slowly — mimic TTS phrase segmentation
      const seg = Math.floor(t * 1.5) % 5;
      pitch = 0.16 + 0.028 * seg + 0.004 * Math.sin(t * 40);
    }

    const column = ctx.createImageData(1, H);
    for (let y = 0; y < H; y++) {
      const freq = (H - 1 - y) / H;
      let energy = 0;

      if (!silent) {
        const harmonics = kind === "human" ? 14 : 10;
        for (let h = 1; h <= harmonics; h++) {
          const hf = pitch * h;
          if (hf > 1) break;
          const d = Math.abs(freq - hf);
          const width =
            kind === "human"
              ? 0.006 + hashRand(x, h, seedBase) * 0.003
              : 0.003;
          const amp =
            kind === "human"
              ? Math.exp(-Math.pow(d / width, 2)) * (1 - h / (harmonics + 2))
              : Math.exp(-Math.pow(d / width, 2)) *
                (1 - h / (harmonics + 4)) *
                1.05;
          energy += amp;
        }
      }

      if (kind === "human") {
        const breath =
          freq > 0.55
            ? 0.12 + hashRand(x, y, seedBase + Math.floor(time * 30)) * 0.18
            : hashRand(x, y, seedBase) * 0.05;
        energy += breath * 0.55;
      } else {
        const flat = 0.08 + hashRand(x, y, seedBase) * 0.04;
        const rolloff = freq > 0.7 ? Math.max(0, 1 - (freq - 0.7) / 0.15) : 1;
        energy += flat * rolloff * 0.6;
      }

      const formants =
        kind === "human" ? [0.09, 0.18, 0.28, 0.42] : [0.1, 0.2, 0.3];
      for (const f of formants) {
        const d = Math.abs(freq - f);
        energy += Math.exp(-Math.pow(d / 0.03, 2)) * (kind === "human" ? 0.35 : 0.45);
      }

      const v = Math.max(0, Math.min(1, Math.log10(1 + 9 * energy) * 0.9));
      const [r, g, b] = color(v);
      column.data[y * 4] = r;
      column.data[y * 4 + 1] = g;
      column.data[y * 4 + 2] = b;
      column.data[y * 4 + 3] = 255;
    }
    ctx.putImageData(column, x, 0);
  }
}
