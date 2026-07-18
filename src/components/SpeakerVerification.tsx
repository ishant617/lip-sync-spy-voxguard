import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Fingerprint,
  Mic,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldAlert,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  verifySpeaker,
  type SpeakerVerificationResult,
  type SpeakerTrait,
} from "@/lib/speaker-verification.functions";

type AudioFormat = "webm" | "mp3" | "wav" | "m4a" | "ogg" | "aac" | "flac";
type Enrollment = { audioBase64: string; format: AudioFormat; enrolledAt: number };

const STORAGE_KEY = "voxguard.enrollment.v1";
const MIN_MS = 3000;

export function SpeakerVerificationCard() {
  const verify = useServerFn(verifySpeaker);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [mode, setMode] = useState<"idle" | "recording-enroll" | "recording-verify" | "verifying">(
    "idle",
  );
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SpeakerVerificationResult | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef<number>(0);
  const targetRef = useRef<"enroll" | "verify">("enroll");
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEnrollment(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const stopTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const start = useCallback(async (kind: "enroll" | "verify") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      targetRef.current = kind;
      startRef.current = Date.now();
      setElapsed(0);
      tickRef.current = window.setInterval(
        () => setElapsed(Date.now() - startRef.current),
        100,
      );
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stopTick();
        stream.getTracks().forEach((t) => t.stop());
        const dur = Date.now() - startRef.current;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (dur < MIN_MS) {
          toast.error(`Please record at least ${MIN_MS / 1000}s of speech.`);
          setMode("idle");
          return;
        }
        const base64 = await blobToBase64(blob);
        if (targetRef.current === "enroll") {
          const rec: Enrollment = { audioBase64: base64, format: "webm", enrolledAt: Date.now() };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
          } catch {
            toast.error("Enrollment too large for browser storage.");
            setMode("idle");
            return;
          }
          setEnrollment(rec);
          setResult(null);
          setMode("idle");
          toast.success("Voiceprint enrolled.");
        } else {
          if (!enrollment) {
            setMode("idle");
            return;
          }
          setMode("verifying");
          try {
            const r = await verify({
              data: {
                enrolled: { audioBase64: enrollment.audioBase64, format: enrollment.format },
                probe: { audioBase64: base64, format: "webm" },
              },
            });
            setResult(r);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Verification failed");
          } finally {
            setMode("idle");
          }
        }
      };
      rec.start();
      recRef.current = rec;
      setMode(kind === "enroll" ? "recording-enroll" : "recording-verify");
    } catch {
      toast.error("Microphone permission denied");
      stopTick();
    }
  }, [enrollment, verify]);

  const stop = () => recRef.current?.stop();

  const clearEnrollment = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEnrollment(null);
    setResult(null);
    toast.success("Enrollment cleared.");
  };

  const seconds = (elapsed / 1000).toFixed(1);
  const recording = mode === "recording-enroll" || mode === "recording-verify";

  return (
    <Card className="border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-violet-500/15 p-2 text-violet-300">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Voice biometric authentication</h3>
            <p className="text-xs text-slate-400">
              Enroll a reference voiceprint, then verify future callers speak with the same voice.
            </p>
          </div>
        </div>
        {enrollment && (
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
            <UserCheck className="h-3.5 w-3.5" />
            Enrolled · {new Date(enrollment.enrolledAt).toLocaleDateString()}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => (mode === "recording-enroll" ? stop() : start("enroll"))}
          disabled={mode === "recording-verify" || mode === "verifying"}
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-4 text-left transition ${
            mode === "recording-enroll"
              ? "border-rose-500/50 bg-rose-500/10"
              : "border-white/10 bg-white/[0.02] hover:border-violet-400/40 hover:bg-violet-400/5"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <div className="flex items-center gap-3">
            {mode === "recording-enroll" ? (
              <Square className="h-5 w-5 animate-pulse text-rose-400" />
            ) : (
              <Mic className="h-5 w-5 text-violet-300" />
            )}
            <div>
              <div className="text-sm font-semibold">
                {mode === "recording-enroll"
                  ? "Stop enrollment"
                  : enrollment
                    ? "Re-enroll voiceprint"
                    : "Enroll voiceprint"}
              </div>
              <div className="text-xs text-slate-400">
                Speak naturally for ≥ 3s (e.g. read a passphrase).
              </div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => (mode === "recording-verify" ? stop() : start("verify"))}
          disabled={!enrollment || mode === "recording-enroll" || mode === "verifying"}
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-4 text-left transition ${
            mode === "recording-verify"
              ? "border-rose-500/50 bg-rose-500/10"
              : "border-white/10 bg-white/[0.02] hover:border-sky-400/40 hover:bg-sky-400/5"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <div className="flex items-center gap-3">
            {mode === "recording-verify" ? (
              <Square className="h-5 w-5 animate-pulse text-rose-400" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-sky-300" />
            )}
            <div>
              <div className="text-sm font-semibold">
                {mode === "recording-verify" ? "Stop & verify" : "Verify caller"}
              </div>
              <div className="text-xs text-slate-400">
                {enrollment ? "Record ≥ 3s to compare against enrollment." : "Enroll first to unlock."}
              </div>
            </div>
          </div>
        </button>
      </div>

      {recording && (
        <div className="mt-4 flex items-center gap-3 text-xs text-slate-300">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-400" />
          Recording · {seconds}s
          <Progress
            value={Math.min(100, (elapsed / (MIN_MS * 2)) * 100)}
            className="h-1.5 flex-1 bg-white/10"
          />
        </div>
      )}

      {mode === "verifying" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Comparing voiceprints…
        </div>
      )}

      {enrollment && (
        <button
          type="button"
          onClick={clearEnrollment}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-rose-300"
        >
          <Trash2 className="h-3 w-3" />
          Clear enrollment
        </button>
      )}

      {result && <VerificationResult result={result} />}
    </Card>
  );
}

function VerificationResult({ result }: { result: SpeakerVerificationResult }) {
  const style = decisionStyle(result.decision);
  const Icon = style.icon;
  return (
    <div className="mt-5 space-y-4">
      <div className={`rounded-lg border p-4 ${style.wrap}`}>
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 ${style.iconColor}`} />
          <div className="flex-1">
            <div className={`text-sm font-semibold ${style.title}`}>{result.headline}</div>
            {result.reasoning && (
              <p className="mt-1 text-xs text-slate-300">{result.reasoning}</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ScoreBar label="Speaker similarity" value={result.similarityScore} good />
          <ScoreBar label="Model confidence" value={result.confidence} good />
          <ScoreBar label="Spoof / clone risk" value={result.spoofRisk} />
        </div>

        {result.spoofNote && (
          <p className="mt-3 rounded border border-amber-400/20 bg-amber-400/5 p-2 text-xs text-amber-200">
            <ShieldAlert className="mr-1 inline h-3 w-3" />
            {result.spoofNote}
          </p>
        )}
      </div>

      {result.traits.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Trait-by-trait comparison
          </div>
          <div className="grid gap-2">
            {result.traits.map((t, i) => (
              <TraitRow key={i} trait={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TraitRow({ trait }: { trait: SpeakerTrait }) {
  const c =
    trait.match === "match"
      ? "border-emerald-400/25 bg-emerald-400/5"
      : trait.match === "mismatch"
        ? "border-rose-400/25 bg-rose-400/5"
        : "border-white/10 bg-white/[0.02]";
  const chip =
    trait.match === "match"
      ? "bg-emerald-400/15 text-emerald-300"
      : trait.match === "mismatch"
        ? "bg-rose-400/15 text-rose-300"
        : "bg-slate-400/15 text-slate-300";
  return (
    <div className={`rounded-md border p-3 ${c}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-100">{trait.name}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${chip}`}>
          {trait.match}
        </span>
      </div>
      <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
        <div>
          <span className="text-slate-500">Enrolled: </span>
          <span className="text-slate-300">{trait.enrolled}</span>
        </div>
        <div>
          <span className="text-slate-500">Probe: </span>
          <span className="text-slate-300">{trait.probe}</span>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, good }: { label: string; value: number; good?: boolean }) {
  const colored = good
    ? value >= 70
      ? "bg-emerald-400"
      : value >= 45
        ? "bg-amber-400"
        : "bg-rose-400"
    : value >= 60
      ? "bg-rose-400"
      : value >= 35
        ? "bg-amber-400"
        : "bg-emerald-400";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${colored}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function decisionStyle(d: SpeakerVerificationResult["decision"]) {
  switch (d) {
    case "match":
      return {
        wrap: "border-emerald-400/30 bg-emerald-400/5",
        icon: CheckCircle2,
        iconColor: "text-emerald-400",
        title: "text-emerald-200",
      };
    case "no_match":
      return {
        wrap: "border-rose-400/30 bg-rose-400/5",
        icon: XCircle,
        iconColor: "text-rose-400",
        title: "text-rose-200",
      };
    default:
      return {
        wrap: "border-amber-400/30 bg-amber-400/5",
        icon: HelpCircle,
        iconColor: "text-amber-300",
        title: "text-amber-200",
      };
  }
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
