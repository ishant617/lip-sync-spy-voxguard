import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { MapPin, Play, Pause } from "lucide-react";
import type { LocalizedSegment } from "@/lib/fraud-detection.functions";

type Props = {
  segments: LocalizedSegment[];
  estimatedDuration: number;
  audioSrc: string | null;
};

const colorFor = (label: LocalizedSegment["label"]) =>
  label === "synthetic"
    ? "bg-rose-500"
    : label === "suspicious"
      ? "bg-amber-400"
      : "bg-emerald-500";

const textFor = (label: LocalizedSegment["label"]) =>
  label === "synthetic"
    ? "text-rose-300 border-rose-500/40 bg-rose-500/10"
    : label === "suspicious"
      ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
      : "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";

function fmt(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function DeepfakeLocalization({ segments, estimatedDuration, audioSrc }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [realDuration, setRealDuration] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!audioSrc) return;
    const a = new Audio(audioSrc);
    audioRef.current = a;
    const onTime = () => setCurrentTime(a.currentTime);
    const onLoaded = () => setRealDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, [audioSrc]);

  if (!segments.length) return null;

  const duration = realDuration || estimatedDuration || segments.at(-1)?.end || 1;

  const playSegment = (i: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = segments[i]!.start;
    void a.play();
    setPlaying(true);
    setActive(i);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      void a.play();
      setPlaying(true);
    }
  };

  const playheadPct = Math.min(100, (currentTime / duration) * 100);

  const humanPct = Math.round(
    (segments.filter((s) => s.label === "human").reduce((a, s) => a + (s.end - s.start), 0) /
      duration) *
      100,
  );
  const synthPct = Math.round(
    (segments.filter((s) => s.label === "synthetic").reduce((a, s) => a + (s.end - s.start), 0) /
      duration) *
      100,
  );

  return (
    <Card className="border-white/10 bg-gradient-to-br from-fuchsia-500/5 to-white/[0.02] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-fuchsia-500/15 p-2 text-fuchsia-300">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Deepfake localization
            </h3>
            <p className="text-xs text-slate-500">
              Where in the audio the synthesis lives · segment-level scoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            {humanPct}% human
          </span>
          <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-300">
            {synthPct}% synthetic
          </span>
        </div>
      </div>

      {audioSrc && (
        <button
          type="button"
          onClick={togglePlay}
          className="mb-3 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-400/5"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pause" : "Play"} · {fmt(currentTime)} / {fmt(duration)}
        </button>
      )}

      {/* Timeline */}
      <div className="relative mb-2 h-10 overflow-hidden rounded-md border border-white/10 bg-slate-950/40">
        {segments.map((s, i) => {
          const left = Math.max(0, (s.start / duration) * 100);
          const width = Math.max(0.5, ((s.end - s.start) / duration) * 100);
          return (
            <button
              key={i}
              type="button"
              onClick={() => (audioSrc ? playSegment(i) : setActive(i))}
              title={`${fmt(s.start)}–${fmt(s.end)} · ${s.label} · ${s.score}%`}
              className={`absolute top-0 h-full ${colorFor(s.label)} transition hover:brightness-125 ${
                active === i ? "ring-2 ring-white/60" : ""
              }`}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                opacity: 0.35 + (s.score / 100) * 0.65,
              }}
            />
          );
        })}
        {audioSrc && (
          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]"
            style={{ left: `${playheadPct}%` }}
          />
        )}
      </div>

      {/* Time ruler */}
      <div className="mb-4 flex justify-between text-[10px] font-mono text-slate-500">
        <span>0:00</span>
        <span>{fmt(duration / 2)}</span>
        <span>{fmt(duration)}</span>
      </div>

      {/* Segment list */}
      <ul className="space-y-2">
        {segments.map((s, i) => (
          <li
            key={i}
            onClick={() => (audioSrc ? playSegment(i) : setActive(i))}
            className={`cursor-pointer rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/20 ${
              active === i ? "border-white/30 bg-white/[0.05]" : ""
            }`}
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono text-slate-400">
                  {fmt(s.start)}–{fmt(s.end)}
                </span>
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${textFor(s.label)}`}
                >
                  {s.label}
                </span>
              </div>
              <span className="font-mono text-xs text-slate-300">{s.score}%</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{s.note}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
