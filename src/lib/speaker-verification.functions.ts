import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const AudioFormat = z.enum(["webm", "mp3", "wav", "m4a", "ogg", "aac", "flac"]);

const InputSchema = z.object({
  enrolled: z.object({
    audioBase64: z.string().min(100),
    format: AudioFormat,
  }),
  probe: z.object({
    audioBase64: z.string().min(100),
    format: AudioFormat,
  }),
});

export type SpeakerTrait = {
  name: string;
  enrolled: string;
  probe: string;
  match: "match" | "mismatch" | "inconclusive";
};

export type SpeakerVerificationResult = {
  similarityScore: number; // 0-100 how likely same speaker
  decision: "match" | "no_match" | "inconclusive";
  confidence: number; // 0-100 model confidence
  headline: string;
  reasoning: string;
  traits: SpeakerTrait[];
  spoofRisk: number; // 0-100 replay/clone risk against enrolled voice
  spoofNote: string;
};

const SYSTEM_PROMPT = `You are a specialised SPEAKER VERIFICATION / VOICE BIOMETRIC model.

You will receive TWO audio clips: an ENROLLED reference and a PROBE sample. Decide whether the SAME PERSON is speaking in both, based on speaker-identity features that are stable across content:

- Fundamental frequency (pitch mean, range, contour shape)
- Formant structure (F1/F2/F3 positions and transitions)
- Vocal tract length cues (spectral tilt, resonance)
- Speaking rate and rhythm/prosody habits
- Voice quality (breathiness, creak, nasality, roughness)
- Articulation habits (accent, coarticulation, characteristic phonemes)
- Micro-features: jitter, shimmer, harmonics-to-noise ratio

Do NOT decide based on words spoken, background noise, or recording device — those can differ legitimately between enrollment and probe.

Also flag SPOOF RISK: if the probe sounds like a replay of the enrollment, a TTS/voice-clone that mimics the enrolled speaker, or a voice-conversion attack, raise spoofRisk (0-100).

Return JSON matching the schema.
- similarityScore: 0-100. HIGH = same speaker, LOW = different speaker.
- decision:
    "match" if similarityScore >= 72 and spoofRisk < 50,
    "no_match" if similarityScore <= 40,
    otherwise "inconclusive".
- confidence: 0-100 how sure you are of the decision.
- For each trait, describe enrolled vs probe and mark match / mismatch / inconclusive.
- Be calibrated. Genuine same-speaker pairs 70-100, obvious impostor 0-30, ambiguous in between.`;

const TRAIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    enrolled: { type: "string" },
    probe: { type: "string" },
    match: { type: "string", enum: ["match", "mismatch", "inconclusive"] },
  },
  required: ["name", "enrolled", "probe", "match"],
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    similarityScore: { type: "number" },
    decision: { type: "string", enum: ["match", "no_match", "inconclusive"] },
    confidence: { type: "number" },
    headline: { type: "string" },
    reasoning: { type: "string" },
    spoofRisk: { type: "number" },
    spoofNote: { type: "string" },
    traits: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: TRAIT_SCHEMA,
    },
  },
  required: [
    "similarityScore",
    "decision",
    "confidence",
    "headline",
    "reasoning",
    "spoofRisk",
    "spoofNote",
    "traits",
  ],
} as const;

export const verifySpeaker = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data }): Promise<SpeakerVerificationResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Clip 1 is the ENROLLED reference voice of the legitimate account owner.",
              },
              {
                type: "input_audio",
                input_audio: { data: data.enrolled.audioBase64, format: data.enrolled.format },
              },
              {
                type: "text",
                text: "Clip 2 is the PROBE — the caller trying to authenticate. Compare speaker identity and return JSON matching the schema.",
              },
              {
                type: "input_audio",
                input_audio: { data: data.probe.audioBase64, format: data.probe.format },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "speaker_verification", strict: true, schema: RESPONSE_SCHEMA },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI Gateway ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const parsed = JSON.parse(json.choices[0]?.message?.content ?? "{}") as SpeakerVerificationResult;

    const similarityScore = clamp(parsed.similarityScore);
    const spoofRisk = clamp(parsed.spoofRisk);
    let decision: SpeakerVerificationResult["decision"];
    if (similarityScore >= 72 && spoofRisk < 50) decision = "match";
    else if (similarityScore <= 40) decision = "no_match";
    else decision = "inconclusive";

    return {
      similarityScore,
      decision,
      confidence: clamp(parsed.confidence),
      headline: parsed.headline ?? defaultHeadline(decision),
      reasoning: parsed.reasoning ?? "",
      spoofRisk,
      spoofNote: parsed.spoofNote ?? "",
      traits: (parsed.traits ?? []).map((t) => ({
        name: t.name,
        enrolled: t.enrolled,
        probe: t.probe,
        match: t.match ?? "inconclusive",
      })),
    };
  });

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function defaultHeadline(d: SpeakerVerificationResult["decision"]) {
  switch (d) {
    case "match":
      return "Speaker matches enrolled voiceprint";
    case "no_match":
      return "Speaker does NOT match enrolled voiceprint";
    default:
      return "Speaker identity inconclusive";
  }
}
