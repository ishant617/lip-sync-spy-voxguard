import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";

type Props = {
  src: string;
  height?: number;
};

export function AudioWaveform({ src, height = 96 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [hover, setHover] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);

  // Decode audio -> peaks
  useEffect(() => {
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
        const channel = audio.getChannelData(0);
        const buckets = 400;
        const size = Math.floor(channel.length / buckets);
        const peaks = new Float32Array(buckets);
        for (let i = 0; i < buckets; i++) {
          let max = 0;
          const start = i * size;
          const end = Math.min(start + size, channel.length);
          for (let j = start; j < end; j++) {
            const v = Math.abs(channel[j]);
            if (v > max) max = v;
          }
          peaks[i] = max;
        }
        peaksRef.current = peaks;
        setDuration(audio.duration);
        setLoading(false);
        ctx.close();
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("Could not decode audio");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Draw
  const draw = () => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const n = peaks.length;
    const barW = w / n;
    const mid = h / 2;
    const playX = progress * w;
    const hoverX = hover !== null ? hover * w : -1;

    for (let i = 0; i < n; i++) {
      const x = i * barW;
      const amp = Math.max(0.02, peaks[i]);
      const barH = amp * (h * 0.9);
      const played = x <= playX;
      const near = hoverX >= 0 && Math.abs(x - hoverX) < 12;
      ctx.fillStyle = played
        ? "rgba(52, 211, 153, 0.95)" // emerald-400
        : near
          ? "rgba(148, 163, 184, 0.7)" // slate-400
          : "rgba(148, 163, 184, 0.35)";
      ctx.fillRect(x, mid - barH / 2, Math.max(1, barW - 1), barH);
    }

    // playhead
    ctx.fillStyle = "rgba(16, 185, 129, 1)";
    ctx.fillRect(playX - 1, 0, 2, h);
  };

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, progress, hover]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Playback tracking
  useEffect(() => {
    if (!audioRef.current) return;
    const a = audioRef.current;
    const tick = () => {
      if (a.duration > 0) setProgress(a.currentTime / a.duration);
      rafRef.current = requestAnimationFrame(tick);
    };
    if (playing) rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      await a.play();
      setPlaying(true);
    }
  };

  const seekFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const a = audioRef.current;
    if (a && a.duration > 0) {
      a.currentTime = ratio * a.duration;
      setProgress(ratio);
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>Waveform</span>
        <span className="font-mono text-slate-400">
          {fmt(progress * duration)} / {fmt(duration)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={loading || !!error}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
          aria-label={playing ? "Pause" : "Play"}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
        <div className="relative flex-1" style={{ height }}>
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
              {error}
            </div>
          )}
          <canvas
            ref={canvasRef}
            onClick={seekFromEvent}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHover((e.clientX - rect.left) / rect.width);
            }}
            onMouseLeave={() => setHover(null)}
            className="h-full w-full cursor-pointer"
            style={{ height }}
          />
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        className="hidden"
      />
    </div>
  );
}
