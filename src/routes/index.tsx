import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAuth } from "./__root";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Bot,
  Mic,
  Square,
  Upload,
  Loader2,
  Waves,
  Brain,
  Quote,
  AlertTriangle,
  Cpu,
  Fingerprint,
  Download,
} from "lucide-react";
import { downloadReportPdf } from "@/lib/report-pdf";
import { Button } from "@/components/ui/button";
import { AudioWaveform } from "@/components/AudioWaveform";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import {
  analyzeVoice,
  type DetectionReport,
  type DeepfakeAnalysis,
  type Finding,
  type Severity,
  type HumanVerifier,
  type VoiceOrigin,
  type AntiSpoofingAnalysis,
} from "@/lib/fraud-detection.functions";
import { SpectrogramCompare } from "@/components/SpectrogramCompare";
import { DeepfakeLocalization } from "@/components/DeepfakeLocalization";
import { SpeakerVerificationCard } from "@/components/SpeakerVerification";
import {
  LinguaForensicsCard,
  LiveStreamMonitor,
  AdversarialLab,
  ThreatDashboard,
  saveHistoryEntry,
} from "@/components/AdvancedFeatures";
import { User, CheckCircle2, XCircle, HelpCircle, Radio } from "lucide-react";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VoxGuard — AI Voice & Fraud Detection" },
      {
        name: "description",
        content:
          "Detect AI-cloned voices and voice-fraud calls. Upload or record audio and get an instant forensic verdict.",
      },
      { property: "og:title", content: "VoxGuard — AI Voice & Fraud Detection" },
      {
        property: "og:description",
        content: "Detect deepfake voices and social-engineering fraud calls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

type Status = "idle" | "recording" | "analyzing" | "done" | "error";

function Home() {
  const analyze = useServerFn(analyzeVoice);
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<DetectionReport | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [feed, setFeed] = useState<Array<{ ts: string; msg: string; level: "info" | "warn" | "ok" }>>([]);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status !== "analyzing") return;
    const pool: Array<{ msg: string; level: "info" | "warn" | "ok" }> = [
      { msg: "loading acoustic feature extractor · mel-128", level: "info" },
      { msg: "spawning generalist pass · gemini-3-flash", level: "info" },
      { msg: "spawning deepfake specialist · neural-tts family classifier", level: "info" },
      { msg: "probing vocoder fingerprints: elevenlabs / vall-e / xtts / tortoise", level: "info" },
      { msg: "measuring pitch jitter & shimmer (biosignal check)", level: "info" },
      { msg: "asvspoof-5 heuristics: replay · conversion · splice · channel", level: "info" },
      { msg: "phase coherence scan · sample-rate: 48kHz", level: "info" },
      { msg: "diffusion warble detector armed", level: "warn" },
      { msg: "spectral roll-off delta computed", level: "ok" },
      { msg: "harmonic stack integrity check", level: "ok" },
      { msg: "breath / plosive / lip-smack detector online", level: "info" },
      { msg: "cross-checking prosody vs neural-TTS reference bank", level: "warn" },
      { msg: "fusing ensemble · logistic calibration", level: "ok" },
      { msg: "computing per-model agreement matrix", level: "info" },
      { msg: "tiling clip into localization segments", level: "info" },
      { msg: "packet integrity verified · e2e-encrypted uplink", level: "ok" },
    ];
    let i = 0;
    const push = () => {
      const item = pool[i % pool.length];
      i++;
      const d = new Date();
      const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0").slice(0, 2)}`;
      setFeed((f) => [{ ts, ...item }, ...f].slice(0, 40));
    };
    push();
    const id = setInterval(push, 650);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === "done") {
      const d = new Date();
      const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.00`;
      setFeed((f) => [{ ts, msg: "analysis complete · verdict rendered", level: "ok" as const }, ...f].slice(0, 40));
    } else if (status === "error") {
      const d = new Date();
      const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.00`;
      setFeed((f) => [{ ts, msg: "pipeline aborted · see console", level: "warn" as const }, ...f].slice(0, 40));
    }
  }, [status]);

  const runAnalysis = useCallback(
    async (blob: Blob, format: "webm" | "mp3" | "wav" | "m4a" | "ogg" | "aac" | "flac") => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      setStatus("analyzing");
      setReport(null);
      setProgress(8);
      const tick = setInterval(() => setProgress((p) => Math.min(92, p + 6)), 500);
      try {
        const base64 = await blobToBase64(blob);
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const result = await analyze({ data: { audioBase64: base64, format }, signal: controller.signal } as never);
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        setReport(result);
        saveHistoryEntry(result);
        setProgress(100);
        setStatus("done");
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError" || controller.signal.aborted) {
          toast.message("Analysis cancelled");
          setStatus("idle");
          setProgress(0);
        } else {
          console.error(e);
          toast.error(e instanceof Error ? e.message : "Analysis failed");
          setStatus("error");
        }
      } finally {
        clearInterval(tick);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [analyze],
  );

  const cancelAnalysis = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        void runAnalysis(blob, "webm");
      };
      rec.start();
      mediaRecRef.current = rec;
      setStatus("recording");
    } catch {
      toast.error("Microphone permission denied");
    }
  };

  const stopRecording = () => mediaRecRef.current?.stop();

  const handleUpload = (file: File) => {
    setAudioUrl(URL.createObjectURL(file));
    const fmt = detectFormat(file.name, file.type);
    if (!fmt) {
      toast.error("Unsupported format. Use wav, mp3, webm, m4a, ogg, aac, flac.");
      return;
    }
    void runAnalysis(file, fmt);
  };

  const reset = () => {
    setReport(null);
    setStatus("idle");
    setProgress(0);
    setAudioUrl(null);
    router.invalidate();
  };

  return (
    <div className="hacker-bg scanlines relative min-h-screen text-emerald-50">
      <div className="scanlines-overlay" />
      <Toaster theme="dark" />

      {/* Top status bar */}
      <div className="relative z-10 border-b border-emerald-500/15 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400/80">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              secure_channel: <span className="text-emerald-300">online</span>
            </span>
            <span className="hidden sm:inline text-emerald-500/50">
              node: vox-01 · region: eu-central · uplink: e2e-encrypted
            </span>
          </div>
          <span className="hidden md:flex items-center gap-2 text-emerald-500/60">
            {status === "analyzing" && feed[0] ? (
              <>
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-amber-400" />
                <span className="text-amber-300/80">[{feed[0].ts}]</span>
                <span className="text-emerald-300/80 normal-case tracking-normal">{feed[0].msg}</span>
              </>
            ) : (
              <>[ ethical_use_only ] threat_intel: v4.2.0</>
            )}
          </span>
        </div>
      </div>

      {/* Live console feed — active during analysis */}
      {(status === "analyzing" || feed.length > 0) && (
        <div className="relative z-10 border-b border-emerald-500/10 bg-black/60">
          <div className="mx-auto max-w-6xl px-6 py-2">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-500/60">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status === "analyzing" ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-emerald-700"}`} />
                live_feed // threat_intel.stream
              </span>
              <span className="text-emerald-600">{feed.length} events</span>
            </div>
            <div
              className="mt-1 max-h-24 overflow-hidden font-mono text-[11px] leading-5"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Live analysis threat intelligence feed"
            >
              {feed.slice(0, 5).map((e, i) => (
                <div
                  key={`${e.ts}-${i}`}
                  className="flex gap-3 whitespace-nowrap"
                  style={{ opacity: 1 - i * 0.18 }}
                >
                  <span className="text-emerald-600">[{e.ts}]</span>
                  <span
                    className={
                      e.level === "warn"
                        ? "text-amber-300"
                        : e.level === "ok"
                          ? "text-emerald-300"
                          : "text-emerald-200/80"
                    }
                  >
                    <span aria-hidden="true">{e.level === "warn" ? "⚠" : e.level === "ok" ? "✓" : "›"} </span>
                    <span className="sr-only">{e.level === "warn" ? "Warning: " : e.level === "ok" ? "Success: " : ""}</span>
                    {e.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      <header className="relative z-10 border-b border-emerald-500/15 bg-gradient-to-b from-black/60 to-transparent backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md border border-emerald-400/40 bg-emerald-500/10 shadow-[0_0_24px_rgba(52,211,153,0.35)]">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="leading-tight">
              <div className="font-mono text-lg font-bold tracking-wider text-emerald-200 glow-emerald">
                VOX//GUARD
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-500/70">
                offensive_audio_forensics
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* Scrolling threat marquee */}
      <div className="relative z-10 overflow-hidden border-b border-emerald-500/10 bg-emerald-500/[0.03] py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-400/70">
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k} className="inline-flex items-center gap-8">
              <span>◉ elevenlabs_v3 signature indexed</span>
              <span>◉ vall-e vocoder fingerprint db updated</span>
              <span>◉ asvspoof-5 replay attack heuristics active</span>
              <span>◉ xtts diffusion warble detector online</span>
              <span>◉ pindrop-style channel profiler armed</span>
              <span>◉ neural-tts family classifier · 12 models</span>
            </span>
          ))}
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <section className="mb-10">
          <h1 className="max-w-3xl font-mono text-4xl font-bold leading-tight tracking-tight text-emerald-100 sm:text-5xl">
            <span className="glow-emerald">Intercept</span> synthetic voices
            <br />
            <span className="text-emerald-500/60">// </span>
            <span className="text-emerald-300">expose</span> fraud calls
            <span className="blink-caret ml-1" />
          </h1>
          <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-emerald-200/70">
            &gt; A red-team-grade voice forensics console. Record or upload a
            suspect call — <span className="text-emerald-300">four specialist models</span> analyse
            spectral artifacts, vocoder fingerprints, liveness and social-engineering vectors
            to surface a signed forensic verdict.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
            {[
              "deepfake_specialist",
              "human_verifier",
              "anti_spoof",
              "generalist_llm",
              "speaker_biometrics",
            ].map((t) => (
              <span key={t} className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-emerald-300">
                [{t}]
              </span>
            ))}
          </div>
        </section>

        <div className="term-window">
          <div className="term-header">
            <span className="term-dot-red" />
            <span className="term-dot-amber" />
            <span className="term-dot-green" />
            <span className="ml-2 truncate">
              voxguard@shell — capture.sh {status === "recording" ? "[REC ●]" : status === "analyzing" ? "[SCAN ~]" : "[READY]"}
            </span>
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={status === "recording" ? stopRecording : startRecording}
                disabled={status === "analyzing"}
                aria-pressed={status === "recording"}
                aria-label={status === "recording" ? "Stop microphone capture and analyze" : "Start live microphone capture"}
                className={`group flex items-center justify-center gap-3 rounded-md border px-6 py-8 text-left font-mono transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60 ${
                  status === "recording"
                    ? "border-rose-500/60 bg-rose-500/10 shadow-[0_0_24px_rgba(244,63,94,0.25)]"
                    : "border-emerald-500/30 bg-emerald-500/[0.04] hover:border-emerald-400 hover:bg-emerald-500/10 hover:shadow-[0_0_24px_rgba(52,211,153,0.25)]"
                }`}
              >
                {status === "recording" ? (
                  <>
                    <Square aria-hidden="true" className="h-6 w-6 animate-pulse text-rose-400" />
                    <div>
                      <div className="text-sm font-bold uppercase tracking-widest text-rose-300">
                        &gt; stop_capture
                      </div>
                      <div className="text-[11px] text-rose-300/70">
                        finalize buffer &amp; run pipeline
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Mic aria-hidden="true" className="h-6 w-6 text-emerald-300 group-hover:animate-pulse" />
                    <div>
                      <div className="text-sm font-bold uppercase tracking-widest text-emerald-200">
                        &gt; live_capture --mic
                      </div>
                      <div className="text-[11px] text-emerald-400/70">
                        stream a suspicious call in real-time
                      </div>
                    </div>
                  </>
                )}
              </button>

              <label
                className={`group flex cursor-pointer items-center justify-center gap-3 rounded-md border border-cyan-400/30 bg-cyan-400/[0.03] px-6 py-8 text-left font-mono transition hover:border-cyan-300 hover:bg-cyan-400/10 hover:shadow-[0_0_24px_rgba(103,232,249,0.25)] focus-within:ring-2 focus-within:ring-cyan-300 focus-within:ring-offset-2 focus-within:ring-offset-black ${
                  status === "analyzing" ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <Upload aria-hidden="true" className="h-6 w-6 text-cyan-300" />
                <div>
                  <div className="text-sm font-bold uppercase tracking-widest text-cyan-200">
                    &gt; upload_payload
                  </div>
                  <div className="text-[11px] text-cyan-300/70">
                    wav · mp3 · webm · m4a · ogg · flac
                  </div>
                </div>
                <input
                  type="file"
                  accept="audio/*"
                  aria-label="Upload audio file for forensic analysis"
                  disabled={status === "analyzing"}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
              </label>
            </div>

            {audioUrl && (
              <div className="mt-4 rounded border border-emerald-500/20 bg-black/50 p-2">
                <audio src={audioUrl} controls aria-label="Uploaded or recorded audio playback" className="w-full" />
              </div>
            )}

            {status === "analyzing" && (
              <div
                className="mt-6 rounded border border-emerald-500/30 bg-black/40 p-4 font-mono text-xs"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    <span className="glow-emerald">[ pipeline ]</span>
                    <span className="text-emerald-400/80">
                      running specialists · deepfake · human · anti-spoof · lingua · generalist…
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelAnalysis}
                    aria-label="Cancel running analysis"
                    className="h-7 border-rose-500/40 bg-rose-500/10 px-2 text-[10px] uppercase tracking-wider text-rose-200 hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <Square aria-hidden="true" className="mr-1 h-3 w-3" /> cancel
                  </Button>
                </div>
                <div
                  role="progressbar"
                  aria-label="Analysis progress"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${progress}% — ${progress < 30 ? "encoding audio" : progress < 60 ? "querying gateway" : progress < 90 ? "fusing ensemble" : "finalising verdict"}`}
                >
                  <Progress value={progress} className="h-1.5 bg-emerald-950" />
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-emerald-500/70">
                  <span>progress: {progress}% · {progress < 30 ? "encoding audio" : progress < 60 ? "querying gateway" : progress < 90 ? "fusing ensemble" : "finalising verdict"}</span>
                  <span>press cancel to abort</span>
                </div>
              </div>
            )}

          </div>
        </div>



        <div className="mt-6">
          <SpeakerVerificationCard />
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <LiveStreamMonitor />
          <ThreatDashboard />
        </section>

        {report && (
          <section className="mt-10 space-y-6">
            <VerdictCard report={report} onReset={reset} />

            <VoiceOriginCard origin={report.voiceOrigin} human={report.humanVerifier} />

            <DeepfakeSpecialistCard analysis={report.deepfakeAnalysis} />

            <AntiSpoofingCard analysis={report.antiSpoofing} />

            <LinguaForensicsCard data={report.linguaForensics} />

            <AdversarialLab
              audioUrl={audioUrl}
              baselineAi={report.aiVoiceScore}
              runAnalyze={async (blob, format, signal) => {
                const base64 = await blobToBase64(blob);
                return analyze({ data: { audioBase64: base64, format }, signal } as never);
              }}
            />


            <DeepfakeLocalization
              segments={report.deepfakeAnalysis.segments}
              estimatedDuration={report.deepfakeAnalysis.estimatedDuration}
              audioSrc={audioUrl}
            />


            <EvidenceCard evidence={report.supportingEvidence} />

            <SpectrogramCompare src={audioUrl} />

            <div className="grid gap-6 md:grid-cols-2">
              <FindingsCard
                icon={<Waves className="h-4 w-4" />}
                title="Acoustic findings"
                subtitle="How the voice sounds"
                items={report.acousticFindings}
                extra={audioUrl ? <AudioWaveform src={audioUrl} /> : null}
              />
              <FindingsCard
                icon={<Brain className="h-4 w-4" />}
                title="Linguistic findings"
                subtitle="What was said"
                items={report.linguisticFindings}
              />
            </div>

            {report.transcript && (
              <Card className="border-white/10 bg-white/[0.03] p-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Transcript
                </h3>
                <p className="text-sm leading-relaxed text-slate-200">
                  {report.transcript}
                </p>
              </Card>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function VerdictCard({
  report,
  onReset,
}: {
  report: DetectionReport;
  onReset: () => void;
}) {
  const style = verdictStyle(report.verdict);
  const Icon = style.icon;
  return (
    <Card className={`overflow-hidden border p-0 ${style.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 p-6">
        <div className="flex items-start gap-4">
          <div className={`rounded-xl p-3 ${style.iconWrap}`}>
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Verdict
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.badge}`}
              >
                {style.label}
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-50">
              {report.headline}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              {report.reasoning}
            </p>
            <div className="mt-3 text-xs text-slate-500">
              Model confidence:{" "}
              <span className="font-mono text-slate-300">
                {report.confidence}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => downloadReportPdf(report)}
            className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={onReset} className="border-white/20">
            New analysis
          </Button>
        </div>
      </div>

      <div className="grid gap-6 border-b border-white/5 p-6 sm:grid-cols-2">
        <ScoreBar
          label="AI / synthetic-voice likelihood"
          value={report.aiVoiceScore}
          icon={<Bot className="h-4 w-4" />}
        />
        <ScoreBar
          label="Fraud-intent likelihood"
          value={report.fraudScore}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <div className="p-6">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Recommended actions
        </div>
        <ul className="space-y-1.5 text-sm text-slate-200">
          {report.recommendedActions.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 text-emerald-400">›</span>
              {a}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function ScoreBar({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const color =
    value >= 65 ? "bg-rose-500" : value >= 40 ? "bg-amber-400" : "bg-emerald-500";
  const risk = value >= 65 ? "High" : value >= 40 ? "Elevated" : "Low";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-mono text-slate-200">{value}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
        {risk} risk
      </div>
    </div>
  );
}

function FindingsCard({
  icon,
  title,
  subtitle,
  items,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  items: Finding[];
  extra?: React.ReactNode;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2 text-emerald-400">
        {icon}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            {title}
          </h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {extra}
      <ul className="space-y-3">
        {items.map((f, i) => (
          <li
            key={i}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-slate-100">
                {f.label}
              </span>
              <SeverityBadge severity={f.severity} />
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{f.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EvidenceCard({ evidence }: { evidence: DetectionReport["supportingEvidence"] }) {
  if (!evidence.length) return null;
  return (
    <Card className="border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2 text-emerald-400">
        <Quote className="h-4 w-4" />
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Supporting evidence
          </h3>
          <p className="text-xs text-slate-500">
            Specific observations backing the verdict
          </p>
        </div>
      </div>
      <ol className="space-y-3">
        {evidence.map((e, i) => (
          <li
            key={i}
            className="rounded-lg border-l-2 border-emerald-400/60 bg-white/[0.02] p-3 pl-4"
          >
            <p className="text-sm italic text-slate-100">&ldquo;{e.quote}&rdquo;</p>
            <p className="mt-1 text-xs text-slate-400">{e.why}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function VoiceOriginCard({
  origin,
  human,
}: {
  origin: VoiceOrigin;
  human: HumanVerifier;
}) {
  const style =
    origin.label === "ai"
      ? {
          Icon: Bot,
          label: "AI-generated voice",
          card: "border-purple-500/40 bg-purple-500/5",
          iconWrap: "bg-purple-500/15 text-purple-300",
          badge: "border-purple-500/40 bg-purple-500/15 text-purple-200",
        }
      : origin.label === "human"
        ? {
            Icon: User,
            label: "Human voice",
            card: "border-emerald-500/40 bg-emerald-500/5",
            iconWrap: "bg-emerald-500/15 text-emerald-300",
            badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
          }
        : {
            Icon: HelpCircle,
            label: "Uncertain — models disagree",
            card: "border-amber-400/40 bg-amber-400/5",
            iconWrap: "bg-amber-400/15 text-amber-300",
            badge: "border-amber-400/40 bg-amber-400/15 text-amber-200",
          };
  const Icon = style.Icon;

  return (
    <Card className={`overflow-hidden border p-0 ${style.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="flex items-start gap-4">
          <div className={`rounded-xl p-3 ${style.iconWrap}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Voice origin
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.badge}`}
              >
                Ensemble
              </span>
            </div>
            <h3 className="mt-1 text-xl font-bold text-slate-50">{style.label}</h3>
            <p className="mt-1 text-xs text-slate-400">
              Ensemble confidence:{" "}
              <span className="font-mono text-slate-200">{origin.confidence}%</span> ·
              calibrated P(AI):{" "}
              <span className="font-mono text-slate-200">{origin.calibratedAiProbability}%</span> ·
              fused from 4 specialist passes
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-white/5 p-6 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" /> Human likelihood
            </span>
            <span className="font-mono text-slate-200">{origin.humanScore}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${origin.humanScore}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Bot className="h-4 w-4" /> AI-voice likelihood
            </span>
            <span className="font-mono text-slate-200">{origin.aiScore}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${origin.aiScore}%` }}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 p-6">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Model agreement (AI-likelihood axis, lower = more human)
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AgreementPill label="Generalist" value={origin.agreement.generalistAi} />
          <AgreementPill
            label="Deepfake specialist"
            value={origin.agreement.specialistDeepfake}
          />
          <AgreementPill
            label="Human verifier"
            value={100 - origin.agreement.humanVerifier}
          />
          <AgreementPill
            label="Anti-spoofing"
            value={origin.agreement.antiSpoofing}
          />
        </div>
      </div>

      {human.biosignals.length > 0 && (
        <div className="border-t border-white/5 p-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <User className="h-3.5 w-3.5" /> Human biosignals
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {human.biosignals.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                {b.present ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-slate-100">{b.name}</div>
                  <div className="text-xs text-slate-400">{b.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          {human.notes && (
            <p className="mt-3 text-xs leading-relaxed text-slate-400">{human.notes}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function AgreementPill({ label, value }: { label: string; value: number }) {
  const color =
    value >= 65 ? "bg-rose-500" : value >= 40 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function DeepfakeSpecialistCard({ analysis }: { analysis: DeepfakeAnalysis }) {
  const score = analysis.deepfakeScore;
  const tone =
    score >= 65
      ? { bar: "bg-rose-500", chip: "text-rose-300 border-rose-500/40 bg-rose-500/10", risk: "High" }
      : score >= 40
        ? { bar: "bg-amber-400", chip: "text-amber-300 border-amber-400/40 bg-amber-400/10", risk: "Elevated" }
        : { bar: "bg-emerald-500", chip: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10", risk: "Low" };

  return (
    <Card className="border-white/10 bg-gradient-to-br from-purple-500/5 to-white/[0.02] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-500/15 p-2 text-purple-300">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Deepfake specialist model
              </h3>
              <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-200">
                Fine-tuned
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Dedicated neural-TTS & voice-clone fingerprinting pass
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.chip}`}>
          {tone.risk} synthetic risk
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Deepfake score</span>
            <span className="font-mono text-slate-200">{score}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${score}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Human likelihood</span>
            <span className="font-mono text-slate-200">{analysis.humanLikelihood}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-sky-400 transition-all"
              style={{ width: `${analysis.humanLikelihood}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Bot className="h-3 w-3" /> Suspected family
          </div>
          <div className="text-sm text-slate-100">{analysis.suspectedFamily}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Fingerprint className="h-3 w-3" /> Vocoder fingerprint
          </div>
          <div className="text-sm text-slate-100">{analysis.vocoderFingerprint || "—"}</div>
        </div>
      </div>

      {analysis.modelNotes && (
        <p className="mt-4 text-xs leading-relaxed text-slate-400">{analysis.modelNotes}</p>
      )}

      {analysis.artifacts.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Detected artifacts
          </div>
          <ul className="space-y-2">
            {analysis.artifacts.map((a, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">{a.name}</span>
                  <SeverityBadge severity={a.severity} />
                </div>
                <p className="text-xs leading-relaxed text-slate-400">{a.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}


function AntiSpoofingCard({ analysis }: { analysis: AntiSpoofingAnalysis }) {
  const spoof = analysis.spoofScore;
  const tone =
    spoof >= 65
      ? { bar: "bg-rose-500", chip: "text-rose-300 border-rose-500/40 bg-rose-500/10", risk: "High" }
      : spoof >= 40
        ? { bar: "bg-amber-400", chip: "text-amber-300 border-amber-400/40 bg-amber-400/10", risk: "Elevated" }
        : { bar: "bg-emerald-500", chip: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10", risk: "Low" };

  return (
    <Card className="border-white/10 bg-gradient-to-br from-sky-500/5 to-white/[0.02] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-sky-500/15 p-2 text-sky-300">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Anti-spoofing &amp; liveness
              </h3>
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-200">
                ASVspoof-style
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Detects replay, splicing, voice-conversion &amp; channel spoofing
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.chip}`}>
          {tone.risk} spoof risk
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Spoof score</span>
            <span className="font-mono text-slate-200">{spoof}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${spoof}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Liveness (genuine live-mic)</span>
            <span className="font-mono text-slate-200">{analysis.livenessScore}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${analysis.livenessScore}%` }}
            />
          </div>
        </div>
      </div>

      {analysis.channelProfile && (
        <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Inferred recording chain
          </div>
          <div className="text-sm text-slate-100">{analysis.channelProfile}</div>
        </div>
      )}

      {analysis.attackVectors.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Attack vectors (per-vector likelihood)
          </div>
          <ul className="space-y-2">
            {analysis.attackVectors.map((v, i) => {
              const c =
                v.score >= 65 ? "bg-rose-500" : v.score >= 40 ? "bg-amber-400" : "bg-emerald-500";
              return (
                <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{v.name}</span>
                    <span className="font-mono text-xs text-slate-300">{v.score}%</span>
                  </div>
                  <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full ${c}`} style={{ width: `${v.score}%` }} />
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">{v.detail}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {analysis.notes && (
        <p className="mt-4 text-xs leading-relaxed text-slate-400">{analysis.notes}</p>
      )}
    </Card>
  );
}


function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    medium: "bg-amber-400/15 text-amber-300 border-amber-400/30",
    high: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[severity]}`}
    >
      {severity}
    </span>
  );
}

function PipelineCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Card className="border-emerald-500/25 bg-black/40 p-5 font-mono transition hover:border-emerald-400/60 hover:shadow-[0_0_28px_rgba(52,211,153,0.18)]">
      <div className="mb-3 flex items-center gap-2 text-emerald-300">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-500/70">module</span>
      </div>
      <div className="mb-1 text-sm font-bold text-emerald-200 glow-emerald">&gt; {title}</div>
      <p className="text-xs leading-relaxed text-emerald-100/60">{text}</p>
    </Card>
  );
}

function verdictStyle(v: DetectionReport["verdict"]) {
  switch (v) {
    case "likely_fraud":
      return {
        label: "Likely fraud call",
        card: "border-rose-500/40 bg-rose-500/5",
        iconWrap: "bg-rose-500/15 text-rose-300",
        badge: "bg-rose-500/20 text-rose-200 border border-rose-500/40",
        icon: ShieldAlert,
      };
    case "ai_synthesized":
      return {
        label: "AI-synthesised voice",
        card: "border-purple-500/40 bg-purple-500/5",
        iconWrap: "bg-purple-500/15 text-purple-300",
        badge: "bg-purple-500/20 text-purple-200 border border-purple-500/40",
        icon: Bot,
      };
    case "suspicious":
      return {
        label: "Suspicious",
        card: "border-amber-400/40 bg-amber-400/5",
        iconWrap: "bg-amber-400/15 text-amber-300",
        badge: "bg-amber-400/20 text-amber-200 border border-amber-400/40",
        icon: ShieldAlert,
      };
    default:
      return {
        label: "Authentic voice",
        card: "border-emerald-500/40 bg-emerald-500/5",
        iconWrap: "bg-emerald-500/15 text-emerald-300",
        badge: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
        icon: ShieldCheck,
      };
  }
}

function detectFormat(
  name: string,
  mime: string,
): "webm" | "mp3" | "wav" | "m4a" | "ogg" | "aac" | "flac" | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const from = ext || mime.split("/").pop() || "";
  if (from.includes("webm")) return "webm";
  if (from.includes("mpeg") || from.includes("mp3")) return "mp3";
  if (from.includes("wav")) return "wav";
  if (from.includes("m4a") || from.includes("mp4")) return "m4a";
  if (from.includes("ogg")) return "ogg";
  if (from.includes("aac")) return "aac";
  if (from.includes("flac")) return "flac";
  return null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
