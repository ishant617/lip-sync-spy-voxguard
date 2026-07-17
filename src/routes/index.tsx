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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import {
  analyzeVoice,
  type DetectionReport,
} from "@/lib/fraud-detection.functions";

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

            <div className="grid gap-6 md:grid-cols-2">
              <FindingsCard
                icon={<Waves className="h-4 w-4" />}
                title="Acoustic findings"
                items={report.acousticFindings}
              />
              <FindingsCard
                icon={<Brain className="h-4 w-4" />}
                title="Linguistic findings"
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
    <Card className={`border p-6 ${style.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${style.iconWrap}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Verdict
            </div>
            <div className="text-2xl font-bold">{style.label}</div>
            <p className="mt-2 max-w-xl text-sm text-slate-300">{report.reasoning}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onReset} className="border-white/20">
          New analysis
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
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

      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Recommended actions
        </div>
        <ul className="space-y-1 text-sm text-slate-200">
          {report.recommendedActions.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-400">›</span>
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
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="font-mono text-slate-200">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function FindingsCard({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03] p-6">
      <div className="mb-3 flex items-center gap-2 text-emerald-400">
        {icon}
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
      </div>
      <ul className="space-y-2 text-sm text-slate-200">
        {items.map((f, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-emerald-400">•</span>
            {f}
          </li>
        ))}
      </ul>
    </Card>
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
        icon: ShieldAlert,
      };
    case "ai_synthesized":
      return {
        label: "AI-synthesised voice",
        card: "border-purple-500/40 bg-purple-500/5",
        iconWrap: "bg-purple-500/15 text-purple-300",
        icon: Bot,
      };
    case "suspicious":
      return {
        label: "Suspicious",
        card: "border-amber-400/40 bg-amber-400/5",
        iconWrap: "bg-amber-400/15 text-amber-300",
        icon: ShieldAlert,
      };
    default:
      return {
        label: "Authentic voice",
        card: "border-emerald-500/40 bg-emerald-500/5",
        iconWrap: "bg-emerald-500/15 text-emerald-300",
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
