import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useRef, useState } from "react";
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
} from "lucide-react";
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
} from "@/lib/fraud-detection.functions";
import { SpectrogramCompare } from "@/components/SpectrogramCompare";
import { DeepfakeLocalization } from "@/components/DeepfakeLocalization";



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
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const runAnalysis = useCallback(
    async (blob: Blob, format: "webm" | "mp3" | "wav" | "m4a" | "ogg" | "aac" | "flac") => {
      setStatus("analyzing");
      setReport(null);
      setProgress(8);
      const tick = setInterval(() => setProgress((p) => Math.min(92, p + 6)), 500);
      try {
        const base64 = await blobToBase64(blob);
        const result = await analyze({ data: { audioBase64: base64, format } });
        setReport(result);
        setProgress(100);
        setStatus("done");
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Analysis failed");
        setStatus("error");
      } finally {
        clearInterval(tick);
      }
    },
    [analyze],
  );

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
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Toaster theme="dark" />
      <header className="border-b border-white/5 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <span className="text-lg font-semibold tracking-tight">VoxGuard</span>
          </div>
          <a
            href="#how"
            className="text-sm text-slate-400 transition hover:text-slate-100"
          >
            How it works
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-10 text-center">
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Detect AI-cloned voices &amp; fraud calls
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-slate-400">
            Record or upload a suspicious call. VoxGuard analyses the acoustic
            signal and the spoken content to flag synthetic voices and
            social-engineering fraud.
          </p>
        </section>

        <Card className="border-white/10 bg-white/[0.03] p-6 backdrop-blur">
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={status === "recording" ? stopRecording : startRecording}
              disabled={status === "analyzing"}
              className={`group flex items-center justify-center gap-3 rounded-lg border px-6 py-8 text-left transition ${
                status === "recording"
                  ? "border-rose-500/50 bg-rose-500/10"
                  : "border-white/10 bg-white/[0.02] hover:border-emerald-400/40 hover:bg-emerald-400/5"
              }`}
            >
              {status === "recording" ? (
                <>
                  <Square className="h-6 w-6 animate-pulse text-rose-400" />
                  <div>
                    <div className="font-semibold">Stop recording</div>
                    <div className="text-xs text-slate-400">
                      Click to finish and analyse
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Mic className="h-6 w-6 text-emerald-400" />
                  <div>
                    <div className="font-semibold">Record from mic</div>
                    <div className="text-xs text-slate-400">
                      Capture a suspicious call in real-time
                    </div>
                  </div>
                </>
              )}
            </button>

            <label
              className={`group flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-6 py-8 text-left transition hover:border-sky-400/40 hover:bg-sky-400/5 ${
                status === "analyzing" ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <Upload className="h-6 w-6 text-sky-400" />
              <div>
                <div className="font-semibold">Upload audio file</div>
                <div className="text-xs text-slate-400">
                  wav · mp3 · webm · m4a · ogg
                </div>
              </div>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
            </label>
          </div>

          {audioUrl && <audio src={audioUrl} controls className="mt-4 w-full" />}

          {status === "analyzing" && (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing audio…
              </div>
              <Progress value={progress} className="h-2 bg-white/10" />
            </div>
          )}
        </Card>

        {report && (
          <section className="mt-10 space-y-6">
            <VerdictCard report={report} onReset={reset} />

            <DeepfakeSpecialistCard analysis={report.deepfakeAnalysis} />

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


        <section id="how" className="mt-16">
          <h2 className="mb-6 text-2xl font-semibold">How VoxGuard works</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <PipelineCard
              icon={<Waves className="h-5 w-5" />}
              title="Acoustic forensics"
              text="Inspects spectral artifacts, prosody, breathing and room-tone for TTS / voice-clone signatures (ElevenLabs, VALL-E, XTTS)."
            />
            <PipelineCard
              icon={<Brain className="h-5 w-5" />}
              title="Linguistic analysis"
              text="Flags scripted phrasing, urgency, authority impersonation, and requests for OTPs, gift-cards or wire transfers."
            />
          </div>
        </section>

        <footer className="mt-16 border-t border-white/5 pt-6 text-center text-xs text-slate-500">
          VoxGuard · Hackathon prototype · For research &amp; educational use only.
        </footer>
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
        <Button variant="outline" onClick={onReset} className="border-white/20">
          New analysis
        </Button>
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
    <Card className="border-white/10 bg-white/[0.03] p-5">
      <div className="mb-2 flex items-center gap-2 text-emerald-400">{icon}</div>
      <div className="mb-1 font-semibold">{title}</div>
      <p className="text-sm text-slate-400">{text}</p>
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
