import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Globe2,
  FlaskConical,
  History,
  Play,
  Square,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Trash2,
  Zap,
} from "lucide-react";
import type {
  DetectionReport,
  LinguaForensics,
} from "@/lib/fraud-detection.functions";

/* ============================================================
   1. LINGUA / ACCENT FORENSICS CARD
   ============================================================ */

export function LinguaForensicsCard({ data }: { data: LinguaForensics }) {
  const riskColor =
    data.identityMismatchRisk >= 65
      ? "text-rose-300"
      : data.identityMismatchRisk >= 40
        ? "text-amber-300"
        : "text-emerald-300";
  return (
    <Card className="border-cyan-500/30 bg-cyan-500/[0.03] p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-md bg-cyan-500/15 p-2 text-cyan-300">
          <Globe2 className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400/80">
            Lingua &amp; accent forensics
          </div>
          <h3 className="text-lg font-bold text-slate-50">
            {data.language}{" "}
            <span className="ml-2 font-mono text-xs text-slate-400">
              ({data.languageConfidence}% conf.)
            </span>
          </h3>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Detected accents
          </div>
          <ul className="space-y-2">
            {data.accents.map((a, i) => (
              <li key={i}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>{a.region}</span>
                  <span className="font-mono text-slate-400">{a.confidence}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-cyan-400"
                    style={{ width: `${a.confidence}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Identity-mismatch risk
              </span>
              <span className={`font-mono ${riskColor}`}>
                {data.identityMismatchRisk}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full ${
                  data.identityMismatchRisk >= 65
                    ? "bg-rose-500"
                    : data.identityMismatchRisk >= 40
                      ? "bg-amber-400"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${data.identityMismatchRisk}%` }}
              />
            </div>
          </div>

          <div className="rounded border border-white/5 bg-black/30 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Code-switching
            </div>
            <div className="mt-1 text-sm text-slate-200">
              {data.codeSwitching ? (
                <span className="text-amber-300">Detected</span>
              ) : (
                <span className="text-emerald-300">None</span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {data.codeSwitchDetail || "—"}
            </div>
          </div>
        </div>
      </div>

      {data.notes && (
        <p className="mt-4 border-t border-white/5 pt-3 text-xs italic text-slate-400">
          {data.notes}
        </p>
      )}
    </Card>
  );
}

/* ============================================================
   2. REAL-TIME STREAMING DETECTION
   Rolling-window local acoustic analysis (RMS, spectral flatness,
   zero-crossing rate) that produces a live AI-likelihood proxy.
   Fully client-side, no server calls — meant to be always-on.
   ============================================================ */

type LiveTick = {
  t: number;
  aiLikelihood: number; // 0-100
  rms: number;
  flatness: number;
  zcr: number;
};

export function LiveStreamMonitor() {
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<LiveTick[]>([]);
  const [current, setCurrent] = useState<LiveTick | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      streamRef.current = stream;
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      startTsRef.current = performance.now();
      setTicks([]);
      setRunning(true);
      loop();
    } catch {
      alert("Microphone permission denied");
    }
  };

  const loop = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const freq = new Float32Array(analyser.frequencyBinCount);
    const time = new Float32Array(analyser.fftSize);
    let last = 0;

    const tick = () => {
      if (!analyserRef.current) return;
      const now = performance.now();
      if (now - last > 180) {
        last = now;
        analyser.getFloatFrequencyData(freq);
        analyser.getFloatTimeDomainData(time);

        // RMS energy
        let sum = 0;
        let zc = 0;
        for (let i = 0; i < time.length; i++) {
          sum += time[i] * time[i];
          if (i > 0 && Math.sign(time[i]) !== Math.sign(time[i - 1])) zc++;
        }
        const rms = Math.sqrt(sum / time.length);
        const zcr = zc / time.length;

        // Spectral flatness (geo-mean / arith-mean of magnitudes)
        // freq is in dB; convert to linear
        let logSum = 0;
        let linSum = 0;
        let n = 0;
        for (let i = 4; i < freq.length; i++) {
          const mag = Math.pow(10, freq[i] / 20);
          if (mag > 1e-8) {
            logSum += Math.log(mag);
            linSum += mag;
            n++;
          }
        }
        const flatness = n > 0 ? Math.exp(logSum / n) / (linSum / n) : 0;

        // Heuristic AI-likelihood:
        //   Real speech: variable RMS, moderate ZCR (~0.05-0.15), flatness low (<0.2)
        //   Neural TTS: over-smooth envelope (low RMS variance), higher flatness on sustained tones
        // For a single-window proxy we penalize very-stable ZCR and low flatness variability
        // across recent ticks.
        const recent = ticks.slice(0, 12);
        const rmsVar = variance(recent.map((r) => r.rms).concat(rms));
        const zcrVar = variance(recent.map((r) => r.zcr).concat(zcr));
        // Low variance in RMS + very-low flatness variance = suspicious
        let ai = 0;
        ai += rmsVar < 0.0001 && rms > 0.01 ? 35 : rmsVar < 0.0005 ? 15 : 0;
        ai += zcrVar < 0.00005 ? 25 : zcrVar < 0.0002 ? 10 : 0;
        ai += flatness > 0.35 ? 25 : flatness > 0.2 ? 10 : 0;
        // If silent, force low
        if (rms < 0.003) ai = 0;
        ai = Math.max(0, Math.min(100, Math.round(ai)));

        const nt: LiveTick = {
          t: (now - startTsRef.current) / 1000,
          aiLikelihood: ai,
          rms,
          flatness,
          zcr,
        };
        setCurrent(nt);
        setTicks((prev) => [nt, ...prev].slice(0, 60));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const bars = ticks.slice(0, 40).reverse();
  const avgAi = current
    ? Math.round(
        (current.aiLikelihood +
          ticks.slice(0, 5).reduce((s, t) => s + t.aiLikelihood, 0)) /
          Math.max(1, Math.min(6, ticks.length + 1)),
      )
    : 0;

  return (
    <Card className="border-emerald-500/30 bg-black/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-emerald-500/15 p-2 text-emerald-300">
            <Activity className={`h-5 w-5 ${running ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-500/70">
              live_stream // real_time_detector
            </div>
            <h3 className="text-lg font-bold text-emerald-100">
              Real-time streaming detection
            </h3>
            <p className="text-xs text-slate-400">
              Rolling-window acoustic analysis · client-side · no server calls
            </p>
          </div>
        </div>
        <Button
          onClick={running ? stop : start}
          className={
            running
              ? "bg-rose-500 text-slate-950 hover:bg-rose-400"
              : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          }
        >
          {running ? (
            <>
              <Square className="mr-1.5 h-4 w-4" /> Stop stream
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-4 w-4" /> Start live stream
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-md border border-emerald-500/20 bg-black/50 p-4 font-mono text-xs">
          <div className="mb-2 text-emerald-400/80">rolling_ai_likelihood</div>
          <div
            className={`text-4xl font-bold ${
              avgAi >= 60
                ? "text-rose-400"
                : avgAi >= 35
                  ? "text-amber-300"
                  : "text-emerald-300"
            }`}
          >
            {avgAi}%
          </div>
          <div className="mt-3 space-y-1 text-[10px] text-emerald-500/70">
            <div>rms: {(current?.rms ?? 0).toFixed(4)}</div>
            <div>flatness: {(current?.flatness ?? 0).toFixed(3)}</div>
            <div>zcr: {(current?.zcr ?? 0).toFixed(3)}</div>
            <div>samples: {ticks.length}</div>
          </div>
        </div>

        <div className="rounded-md border border-emerald-500/20 bg-black/50 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-500/70">
            ai_likelihood timeline (last 40 windows)
          </div>
          <div className="flex h-24 items-end gap-0.5">
            {bars.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                {running ? "listening…" : "press start to monitor"}
              </div>
            ) : (
              bars.map((b, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${
                    b.aiLikelihood >= 60
                      ? "bg-rose-500/80"
                      : b.aiLikelihood >= 35
                        ? "bg-amber-400/80"
                        : "bg-emerald-500/70"
                  }`}
                  style={{ height: `${Math.max(4, b.aiLikelihood)}%` }}
                  title={`${b.t.toFixed(1)}s · ${b.aiLikelihood}%`}
                />
              ))
            )}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-emerald-600">
            <span>earlier</span>
            <span>now</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function variance(arr: number[]) {
  if (arr.length < 2) return 1;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

/* ============================================================
   3. ADVERSARIAL STRESS-TEST LAB
   Applies WebAudio manipulations to the analyzed clip and
   re-runs the detector to show model robustness.
   ============================================================ */

type Attack = {
  key: string;
  label: string;
  detail: string;
};

const ATTACKS: Attack[] = [
  { key: "noise", label: "Gaussian noise +6dB", detail: "Simulates poor-line degradation" },
  { key: "pitch", label: "Pitch shift +2 semitones", detail: "Common voice-morph attack" },
  { key: "bitcrush", label: "Bit-crush 6-bit", detail: "Aggressive codec / narrowband spoof" },
  { key: "lowpass", label: "Telephony low-pass 3.4kHz", detail: "Fake phone-line channel" },
  { key: "replay", label: "Replay convolution (room)", detail: "Simulates speaker-to-mic re-record" },
];

export function AdversarialLab({
  audioUrl,
  baselineAi,
  runAnalyze,
}: {
  audioUrl: string | null;
  baselineAi: number;
  runAnalyze: (blob: Blob, format: "wav", signal?: AbortSignal) => Promise<DetectionReport>;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Record<string, { ai: number; delta: number }>>({});
  const abortRef = useRef<AbortController | null>(null);
  const batchAbortedRef = useRef(false);

  const cancel = () => {
    batchAbortedRef.current = true;
    abortRef.current?.abort();
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const runAttack = async (attack: Attack) => {
    if (!audioUrl) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(attack.key);
    setProgress(5);
    const tick = setInterval(() => setProgress((p) => Math.min(90, p + 5)), 350);
    try {
      const arr = await (await fetch(audioUrl, { signal: controller.signal })).arrayBuffer();
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(arr.slice(0));
      await ctx.close();
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      const processed = await applyAttack(decoded, attack.key);
      const wav = encodeWav(processed);
      const report = await runAnalyze(wav, "wav", controller.signal);
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const delta = report.aiVoiceScore - baselineAi;
      setResults((r) => ({ ...r, [attack.key]: { ai: report.aiVoiceScore, delta } }));
      setProgress(100);
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        console.error(e);
        setResults((r) => ({ ...r, [attack.key]: { ai: -1, delta: 0 } }));
      }
    } finally {
      clearInterval(tick);
      setRunning(null);
      setProgress(0);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const runAll = async () => {
    if (!audioUrl) return;
    batchAbortedRef.current = false;
    setBatch({ done: 0, total: ATTACKS.length });
    for (let i = 0; i < ATTACKS.length; i++) {
      if (batchAbortedRef.current) break;
      await runAttack(ATTACKS[i]);
      setBatch({ done: i + 1, total: ATTACKS.length });
    }
    setBatch(null);
  };

  const robustness = useMemo(() => {
    const entries = Object.values(results).filter((r) => r.ai >= 0);
    if (!entries.length) return null;
    const avgDelta =
      entries.reduce((s, r) => s + Math.abs(r.delta), 0) / entries.length;
    return Math.max(0, Math.min(100, Math.round(100 - avgDelta * 1.5)));
  }, [results]);

  return (
    <Card className="border-purple-500/30 bg-purple-500/[0.03] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-purple-500/15 p-2 text-purple-300">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-purple-400/80">
              adversarial_lab // model_robustness_test
            </div>
            <h3 className="text-lg font-bold text-slate-50">Adversarial stress-test lab</h3>
            <p className="text-xs text-slate-400">
              Apply attacks to the analyzed clip and re-run detection. Small deltas =
              robust model.
            </p>
          </div>
        </div>
        {audioUrl && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={runAll}
              disabled={running !== null || batch !== null}
              className="h-8 bg-purple-500 text-slate-950 hover:bg-purple-400"
            >
              <Zap className="mr-1 h-3.5 w-3.5" /> Run all
            </Button>
            {(running !== null || batch !== null) && (
              <Button
                size="sm"
                variant="outline"
                onClick={cancel}
                className="h-8 border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
              >
                <Square className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {(running !== null || batch !== null) && (
        <div className="mb-4 rounded-md border border-purple-500/30 bg-black/40 p-3 font-mono text-xs">
          <div className="mb-1.5 flex items-center justify-between text-purple-200">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {batch
                ? `batch · ${batch.done}/${batch.total} · ${running ?? "queued"}`
                : `running · ${running}`}
            </span>
            <span className="text-purple-300/80">
              {batch
                ? `${Math.round((batch.done / batch.total) * 100)}%`
                : `${progress}%`}
            </span>
          </div>
          <Progress
            value={batch ? (batch.done / batch.total) * 100 : progress}
            className="h-1.5 bg-purple-950"
          />
        </div>
      )}

      {!audioUrl ? (
        <div className="rounded border border-white/5 bg-black/40 p-4 text-xs text-slate-400">
          Run an analysis first to unlock the stress-test lab.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ATTACKS.map((a) => {
              const res = results[a.key];
              return (
                <div
                  key={a.key}
                  className="rounded-md border border-purple-500/20 bg-black/40 p-3"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-100">
                      {a.label}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={running !== null}
                      onClick={() => runAttack(a)}
                      className="h-7 border-purple-500/40 bg-purple-500/10 px-2 text-[10px] uppercase tracking-wider text-purple-200 hover:bg-purple-500/20"
                    >
                      {running === a.key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Zap className="mr-1 h-3 w-3" /> run
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">{a.detail}</p>
                  {res && (
                    <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 font-mono text-xs">
                      {res.ai < 0 ? (
                        <span className="text-rose-300">error</span>
                      ) : (
                        <>
                          <span className="text-slate-300">AI: {res.ai}%</span>
                          <span
                            className={
                              Math.abs(res.delta) < 8
                                ? "text-emerald-300"
                                : Math.abs(res.delta) < 20
                                  ? "text-amber-300"
                                  : "text-rose-300"
                            }
                          >
                            Δ {res.delta > 0 ? "+" : ""}
                            {res.delta}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {robustness !== null && (
            <div className="mt-4 rounded border border-purple-500/30 bg-purple-500/10 p-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-purple-200">
                  Model robustness score
                </span>
                <span className="font-mono text-purple-100">{robustness}%</span>
              </div>
              <Progress value={robustness} className="h-1.5 bg-purple-950" />
              <p className="mt-2 text-[11px] text-purple-200/70">
                Higher = detector holds its verdict under adversarial pressure. Based on
                average |Δ| across completed attacks.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

async function applyAttack(
  buf: AudioBuffer,
  key: string,
): Promise<AudioBuffer> {
  const sr = buf.sampleRate;
  const channels = 1;
  const len = buf.length;

  if (key === "pitch") {
    // naive pitch shift via resample (offline)
    const ratio = Math.pow(2, 2 / 12); // +2 semitones
    const offline = new OfflineAudioContext(channels, Math.floor(len / ratio), sr);
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = ratio;
    src.connect(offline.destination);
    src.start();
    return offline.startRendering();
  }

  const offline = new OfflineAudioContext(channels, len, sr);
  const src = offline.createBufferSource();
  src.buffer = buf;

  let node: AudioNode = src;

  if (key === "lowpass" || key === "replay") {
    const lp = offline.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = key === "lowpass" ? 3400 : 6000;
    node.connect(lp);
    node = lp;
  }

  if (key === "replay") {
    // add short IR convolution
    const irLen = Math.floor(sr * 0.15);
    const ir = offline.createBuffer(1, irLen, sr);
    const d = ir.getChannelData(0);
    for (let i = 0; i < irLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.03));
    }
    const conv = offline.createConvolver();
    conv.buffer = ir;
    node.connect(conv);
    node = conv;
  }

  if (key === "noise" || key === "bitcrush") {
    const proc = offline.createScriptProcessor?.(4096, 1, 1);
    // ScriptProcessor is deprecated but present in workers; use gain-based mixing instead
    // for noise: mix in a noise source
  }

  // For noise / bitcrush we need per-sample manipulation; render then post-process
  node.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  if (key === "noise") {
    const d = rendered.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.max(-1, Math.min(1, d[i] + (Math.random() * 2 - 1) * 0.15));
    }
  }
  if (key === "bitcrush") {
    const levels = Math.pow(2, 6);
    const d = rendered.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.round(d[i] * levels) / levels;
    }
  }

  return rendered;
}

function encodeWav(buf: AudioBuffer): Blob {
  const sr = buf.sampleRate;
  const numCh = 1;
  const samples = buf.getChannelData(0);
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const w = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([ab], { type: "audio/wav" });
}

/* ============================================================
   4. THREAT INTELLIGENCE DASHBOARD
   Persists past scans to localStorage; renders trend chart,
   verdict distribution, and case-file list.
   ============================================================ */

const STORAGE_KEY = "voxguard.history.v1";

export type HistoryEntry = {
  id: string;
  ts: number;
  verdict: DetectionReport["verdict"];
  aiVoiceScore: number;
  fraudScore: number;
  headline: string;
  language: string;
  originLabel: string;
};

export function saveHistoryEntry(report: DetectionReport) {
  try {
    const existing = loadHistory();
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      verdict: report.verdict,
      aiVoiceScore: report.aiVoiceScore,
      fraudScore: report.fraudScore,
      headline: report.headline,
      language: report.linguaForensics?.language ?? "Unknown",
      originLabel: report.voiceOrigin?.label ?? "uncertain",
    };
    const next = [entry, ...existing].slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("voxguard:history-updated"));
  } catch {
    /* noop */
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ThreatDashboard() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "fraud" | "ai" | "human">("all");

  useEffect(() => {
    setHistory(loadHistory());
    const handler = () => setHistory(loadHistory());
    window.addEventListener("voxguard:history-updated", handler);
    return () => window.removeEventListener("voxguard:history-updated", handler);
  }, []);

  const filtered = history.filter((h) => {
    if (filter === "all") return true;
    if (filter === "fraud") return h.verdict === "likely_fraud";
    if (filter === "ai") return h.verdict === "ai_synthesized";
    if (filter === "human") return h.verdict === "authentic";
    return true;
  });

  const stats = useMemo(() => {
    const total = history.length;
    const counts = {
      authentic: 0,
      suspicious: 0,
      ai_synthesized: 0,
      likely_fraud: 0,
    } as Record<DetectionReport["verdict"], number>;
    history.forEach((h) => counts[h.verdict]++);
    const avgAi = total
      ? Math.round(history.reduce((s, h) => s + h.aiVoiceScore, 0) / total)
      : 0;
    const avgFraud = total
      ? Math.round(history.reduce((s, h) => s + h.fraudScore, 0) / total)
      : 0;
    return { total, counts, avgAi, avgFraud };
  }, [history]);

  const clear = () => {
    if (!confirm("Clear all case history?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voxguard-cases-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trend = history.slice(0, 30).reverse();

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-amber-500/15 p-2 text-amber-300">
            <History className="h-5 w-5" />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400/80">
              threat_intel // case_history
            </div>
            <h3 className="text-lg font-bold text-slate-50">
              Threat intelligence dashboard
            </h3>
            <p className="text-xs text-slate-400">
              {stats.total} case{stats.total === 1 ? "" : "s"} on file · avg AI{" "}
              {stats.avgAi}% · avg fraud {stats.avgFraud}%
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={exportJson}
            disabled={!history.length}
            className="border-amber-500/40 bg-amber-500/10 text-amber-100"
          >
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clear}
            disabled={!history.length}
            className="border-rose-500/40 bg-rose-500/10 text-rose-200"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>

      {!history.length ? (
        <div className="rounded border border-white/5 bg-black/30 p-6 text-center text-sm text-slate-400">
          No cases yet. Run an analysis to start building your threat history.
        </div>
      ) : (
        <>
          {/* trend chart */}
          <div className="mb-4 rounded-md border border-amber-500/20 bg-black/40 p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-amber-400/80">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> ai_voice trend (last 30)
              </span>
              <span className="text-emerald-400">▮ AI</span>
            </div>
            <div className="flex h-16 items-end gap-0.5">
              {trend.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${
                    h.aiVoiceScore >= 65
                      ? "bg-rose-500/80"
                      : h.aiVoiceScore >= 40
                        ? "bg-amber-400/80"
                        : "bg-emerald-500/70"
                  }`}
                  style={{ height: `${Math.max(4, h.aiVoiceScore)}%` }}
                  title={`${new Date(h.ts).toLocaleString()} · AI ${h.aiVoiceScore}%`}
                />
              ))}
            </div>
          </div>

          {/* verdict distribution */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["authentic", "Authentic", "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"],
                ["suspicious", "Suspicious", "bg-amber-400/15 text-amber-200 border-amber-400/30"],
                ["ai_synthesized", "AI voice", "bg-purple-500/15 text-purple-200 border-purple-500/30"],
                ["likely_fraud", "Fraud", "bg-rose-500/15 text-rose-200 border-rose-500/30"],
              ] as const
            ).map(([k, lbl, cls]) => (
              <div key={k} className={`rounded border p-3 ${cls}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                  {lbl}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {stats.counts[k as DetectionReport["verdict"]]}
                </div>
              </div>
            ))}
          </div>

          {/* filters */}
          <div className="mb-3 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-wider">
            {(
              [
                ["all", "all"],
                ["fraud", "fraud"],
                ["ai", "ai_voice"],
                ["human", "authentic"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded border px-2 py-1 transition ${
                  filter === k
                    ? "border-amber-400 bg-amber-500/20 text-amber-100"
                    : "border-white/10 bg-black/30 text-slate-400 hover:border-amber-500/40 hover:text-amber-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <ul className="max-h-80 space-y-1.5 overflow-auto pr-1 font-mono text-xs">
            {filtered.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 rounded border border-white/5 bg-black/30 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-100">{h.headline}</div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(h.ts).toLocaleString()} · {h.language} · origin: {h.originLabel}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[10px]">
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">
                    AI {h.aiVoiceScore}
                  </span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">
                    FR {h.fraudScore}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 uppercase ${verdictClass(h.verdict)}`}
                  >
                    {h.verdict.replace("_", " ")}
                  </span>
                </div>
              </li>
            ))}
            {!filtered.length && (
              <li className="rounded border border-white/5 bg-black/20 p-3 text-center text-slate-500">
                No cases match this filter.
              </li>
            )}
          </ul>
        </>
      )}
    </Card>
  );
}

function verdictClass(v: DetectionReport["verdict"]) {
  switch (v) {
    case "likely_fraud":
      return "bg-rose-500/20 text-rose-200";
    case "ai_synthesized":
      return "bg-purple-500/20 text-purple-200";
    case "suspicious":
      return "bg-amber-400/20 text-amber-100";
    default:
      return "bg-emerald-500/20 text-emerald-200";
  }
}
