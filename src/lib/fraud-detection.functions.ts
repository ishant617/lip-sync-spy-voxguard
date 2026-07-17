import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const InputSchema = z.object({
  audioBase64: z.string().min(100),
  format: z.enum(["webm", "mp3", "wav", "m4a", "ogg", "aac", "flac"]),
});

export type Severity = "low" | "medium" | "high";

export type Finding = {
  label: string;
  detail: string;
  severity: Severity;
};

export type Evidence = {
  quote: string;
  why: string;
};

export type DeepfakeArtifact = {
  name: string;
  detail: string;
  severity: Severity;
};

export type DeepfakeAnalysis = {
  deepfakeScore: number; // 0-100 specialist model's synthetic likelihood
  humanLikelihood: number; // 0-100
  suspectedFamily: string; // e.g. "ElevenLabs-style neural TTS" / "Human speech"
  vocoderFingerprint: string; // short technical description
  artifacts: DeepfakeArtifact[];
  modelNotes: string;
};

export type DetectionReport = {
  transcript: string;
  aiVoiceScore: number;
  fraudScore: number;
  confidence: number; // 0-100 model self-reported confidence in the verdict
  acousticFindings: Finding[];
  linguisticFindings: Finding[];
  supportingEvidence: Evidence[];
  deepfakeAnalysis: DeepfakeAnalysis;
  verdict: "authentic" | "suspicious" | "likely_fraud" | "ai_synthesized";
  headline: string;
  reasoning: string;
  recommendedActions: string[];
};


const SYSTEM_PROMPT = `You are an AI voice-fraud detection engineer. Analyse the provided audio and return a JSON verdict.

Look for TWO things simultaneously:

1. SYNTHETIC / AI-CLONED VOICE (aiVoiceScore, 0-100):
   - Unnatural prosody, robotic cadence, missing breaths
   - Spectral smoothing typical of TTS / voice-clone models (ElevenLabs, VALL-E, XTTS, Tacotron)
   - Pitch drift, room-tone inconsistencies, absent micro-pauses

2. FRAUDULENT INTENT (fraudScore, 0-100):
   - Scripted phrasing, urgency ("act now", "account locked")
   - Authority impersonation (bank, IRS, police)
   - Requests for OTP, gift-cards, wire transfers, remote access
   - Emotional manipulation

For every finding, tag a severity: "low" (weak signal), "medium" (notable), "high" (strong red flag).
Extract 2-4 supportingEvidence items: short direct quotes from the audio OR concrete acoustic observations, each with a one-sentence "why" it matters.
Be calibrated: authentic human speech about normal topics should score low on both, with low severity findings and low confidence in a fraud verdict.`;

const FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    detail: { type: "string" },
    severity: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["label", "detail", "severity"],
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    transcript: { type: "string" },
    aiVoiceScore: { type: "number" },
    fraudScore: { type: "number" },
    confidence: { type: "number" },
    headline: { type: "string" },
    reasoning: { type: "string" },
    acousticFindings: {
      type: "array",
      items: FINDING_SCHEMA,
      minItems: 1,
      maxItems: 5,
    },
    linguisticFindings: {
      type: "array",
      items: FINDING_SCHEMA,
      minItems: 1,
      maxItems: 5,
    },
    supportingEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote: { type: "string" },
          why: { type: "string" },
        },
        required: ["quote", "why"],
      },
      minItems: 1,
      maxItems: 5,
    },
  },
  required: [
    "transcript",
    "aiVoiceScore",
    "fraudScore",
    "confidence",
    "headline",
    "reasoning",
    "acousticFindings",
    "linguisticFindings",
    "supportingEvidence",
  ],
} as const;

export const analyzeVoice = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data }): Promise<DetectionReport> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyse this audio and return JSON matching the schema. Provide a one-line headline, short reasoning, per-finding severity tags, and supporting evidence with quotes/observations.",
              },
              {
                type: "input_audio",
                input_audio: { data: data.audioBase64, format: data.format },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "voice_analysis", strict: true, schema: RESPONSE_SCHEMA },
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
    const parsed = JSON.parse(json.choices[0]?.message?.content ?? "{}") as {
      transcript: string;
      aiVoiceScore: number;
      fraudScore: number;
      confidence: number;
      headline: string;
      reasoning: string;
      acousticFindings: Finding[];
      linguisticFindings: Finding[];
      supportingEvidence: Evidence[];
    };

    const aiVoiceScore = clamp(parsed.aiVoiceScore);
    const fraudScore = clamp(parsed.fraudScore);

    let verdict: DetectionReport["verdict"] = "authentic";
    if (aiVoiceScore >= 65 && fraudScore >= 55) verdict = "likely_fraud";
    else if (aiVoiceScore >= 65) verdict = "ai_synthesized";
    else if (fraudScore >= 55 || aiVoiceScore >= 45) verdict = "suspicious";

    return {
      transcript: parsed.transcript ?? "",
      aiVoiceScore,
      fraudScore,
      confidence: clamp(parsed.confidence),
      acousticFindings: parsed.acousticFindings ?? [],
      linguisticFindings: parsed.linguisticFindings ?? [],
      supportingEvidence: parsed.supportingEvidence ?? [],
      verdict,
      headline: parsed.headline ?? defaultHeadline(verdict),
      reasoning: parsed.reasoning ?? "",
      recommendedActions: buildActions(verdict),
    };
  });

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function defaultHeadline(v: DetectionReport["verdict"]) {
  switch (v) {
    case "likely_fraud":
      return "Likely voice-fraud call detected";
    case "ai_synthesized":
      return "Voice appears AI-synthesised";
    case "suspicious":
      return "Suspicious signals detected";
    default:
      return "No strong fraud or synthesis indicators";
  }
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
