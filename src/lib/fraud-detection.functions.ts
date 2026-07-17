import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const InputSchema = z.object({
  audioBase64: z.string().min(100),
  format: z.enum(["webm", "mp3", "wav", "m4a", "ogg", "aac", "flac"]),
});

export type LoopResult = {
  iteration: number;
  name: string;
  focus: string;
  aiVoiceScore: number; // 0-100 likelihood of synthetic/AI voice
  fraudScore: number; // 0-100 likelihood of fraudulent intent
  findings: string[];
  refinedFrom?: string;
};

export type DetectionReport = {
  transcript: string;
  loops: LoopResult[];
  finalAiVoiceScore: number;
  finalFraudScore: number;
  verdict: "authentic" | "suspicious" | "likely_fraud" | "ai_synthesized";
  reasoning: string;
  recommendedActions: string[];
};

const LOOP_PASSES: Array<{ name: string; focus: string; system: string }> = [
  {
    name: "Acoustic Forensics",
    focus: "Spectral artifacts, prosody, breathing, micro-pauses, background coherence",
    system:
      "You are an audio forensics engineer. Analyse the ACOUSTIC signal ONLY: unnatural prosody, robotic cadence, missing breaths, spectral smoothing typical of TTS/voice-clone models (ElevenLabs, Tacotron, VALL-E, XTTS), pitch drift, room-tone inconsistencies. Ignore what is said; focus on HOW it sounds.",
  },
  {
    name: "Linguistic & Behavioural Analysis",
    focus: "Script patterns, urgency, social-engineering markers, impersonation cues",
    system:
      "You are a fraud analyst. Analyse the SPOKEN CONTENT: scripted phrasing, urgency (act now, account locked), authority impersonation (bank, IRS, police), requests for OTP/gift-cards/wire transfers, emotional manipulation. Consider the prior acoustic findings when scoring intent.",
  },
  {
    name: "Adversarial Refinement",
    focus: "Cross-check prior loops, resolve contradictions, produce final verdict",
    system:
      "You are the lead reviewer running the FINAL loop of an iterative detection pipeline (loop-engineering). Re-examine the audio with the two prior loops' findings in mind. Challenge weak evidence, resolve contradictions, and output the calibrated final scores and verdict.",
  },
];

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    transcript: { type: "string" },
    aiVoiceScore: { type: "number" },
    fraudScore: { type: "number" },
    findings: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    refinedFrom: { type: "string" },
  },
  required: ["transcript", "aiVoiceScore", "fraudScore", "findings"],
} as const;

async function callGemini(params: {
  system: string;
  userText: string;
  audioBase64: string;
  format: string;
  apiKey: string;
}) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": params.apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: params.system },
        {
          role: "user",
          content: [
            { type: "text", text: params.userText },
            {
              type: "input_audio",
              input_audio: { data: params.audioBase64, format: params.format },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "loop_analysis", strict: true, schema: RESPONSE_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${body}`);
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = json.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as {
    transcript: string;
    aiVoiceScore: number;
    fraudScore: number;
    findings: string[];
    refinedFrom?: string;
  };
}

export const analyzeVoice = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data }): Promise<DetectionReport> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const loops: LoopResult[] = [];
    let transcript = "";
    let priorSummary = "";

    for (let i = 0; i < LOOP_PASSES.length; i++) {
      const pass = LOOP_PASSES[i];
      const userText =
        `LOOP ${i + 1}/${LOOP_PASSES.length} — ${pass.name}\n` +
        `Focus: ${pass.focus}\n\n` +
        (priorSummary
          ? `Prior loop findings to consider:\n${priorSummary}\n\n`
          : "") +
        `Return JSON matching the schema. Provide a transcript of any speech (best-effort, empty string if none), aiVoiceScore (0-100, higher = more likely synthetic/cloned), fraudScore (0-100, higher = more likely fraudulent), 2-5 specific findings from THIS loop's perspective${
          i > 0 ? ", and a short 'refinedFrom' note explaining what you changed vs prior loops" : ""
        }.`;

      const out = await callGemini({
        system: pass.system,
        userText,
        audioBase64: data.audioBase64,
        format: data.format,
        apiKey,
      });

      if (out.transcript && out.transcript.length > transcript.length) {
        transcript = out.transcript;
      }

      loops.push({
        iteration: i + 1,
        name: pass.name,
        focus: pass.focus,
        aiVoiceScore: clamp(out.aiVoiceScore),
        fraudScore: clamp(out.fraudScore),
        findings: out.findings ?? [],
        refinedFrom: out.refinedFrom,
      });

      priorSummary = loops
        .map(
          (l) =>
            `- Loop ${l.iteration} ${l.name}: aiVoice=${l.aiVoiceScore}, fraud=${l.fraudScore}. ${l.findings.join("; ")}`,
        )
        .join("\n");
    }

    // Final loop is authoritative but weighted with priors.
    const finalAi = Math.round(
      (loops[0].aiVoiceScore * 0.3 + loops[1].aiVoiceScore * 0.15 + loops[2].aiVoiceScore * 0.55),
    );
    const finalFraud = Math.round(
      (loops[0].fraudScore * 0.15 + loops[1].fraudScore * 0.4 + loops[2].fraudScore * 0.45),
    );

    let verdict: DetectionReport["verdict"] = "authentic";
    if (finalAi >= 65 && finalFraud >= 55) verdict = "likely_fraud";
    else if (finalAi >= 65) verdict = "ai_synthesized";
    else if (finalFraud >= 55 || finalAi >= 45) verdict = "suspicious";

    const recommendedActions = buildActions(verdict);

    return {
      transcript,
      loops,
      finalAiVoiceScore: finalAi,
      finalFraudScore: finalFraud,
      verdict,
      reasoning: loops[2].findings.join(" • "),
      recommendedActions,
    };
  });

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildActions(v: DetectionReport["verdict"]): string[] {
  switch (v) {
    case "likely_fraud":
      return [
        "Do NOT act on any instructions in this call.",
        "Hang up and call the organisation back on a verified number.",
        "Report the call to your local anti-fraud authority.",
      ];
    case "ai_synthesized":
      return [
        "Voice appears synthetically generated — verify caller identity out-of-band.",
        "Ask a personal challenge question the real person would know.",
      ];
    case "suspicious":
      return [
        "Treat with caution; independently verify caller identity.",
        "Never share OTPs, passwords, or make payments based on this call.",
      ];
    default:
      return ["No strong indicators of fraud or synthesis detected. Stay vigilant."];
  }
}
