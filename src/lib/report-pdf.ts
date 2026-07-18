import { jsPDF } from "jspdf";
import type { DetectionReport } from "@/lib/fraud-detection.functions";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;

type Ctx = { doc: jsPDF; y: number };

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y + needed > PAGE_H - M) {
    ctx.doc.addPage();
    ctx.y = M;
  }
}

function h1(ctx: Ctx, text: string) {
  ensure(ctx, 12);
  ctx.doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20, 20, 30);
  ctx.doc.text(text, M, ctx.y);
  ctx.y += 8;
}

function h2(ctx: Ctx, text: string) {
  ensure(ctx, 10);
  ctx.y += 4;
  ctx.doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(40, 40, 60);
  ctx.doc.text(text.toUpperCase(), M, ctx.y);
  ctx.doc.setDrawColor(200, 200, 210).line(M, ctx.y + 1.5, PAGE_W - M, ctx.y + 1.5);
  ctx.y += 6;
}

function p(ctx: Ctx, text: string, opts: { size?: number; color?: [number, number, number]; italic?: boolean } = {}) {
  const size = opts.size ?? 10;
  const color = opts.color ?? [55, 60, 75];
  ctx.doc.setFont("helvetica", opts.italic ? "italic" : "normal").setFontSize(size).setTextColor(...color);
  const lines = ctx.doc.splitTextToSize(text, PAGE_W - M * 2);
  for (const line of lines) {
    ensure(ctx, size * 0.45);
    ctx.doc.text(line, M, ctx.y);
    ctx.y += size * 0.45;
  }
}

function kv(ctx: Ctx, k: string, v: string) {
  ensure(ctx, 5);
  ctx.doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(80, 80, 100);
  ctx.doc.text(k, M, ctx.y);
  ctx.doc.setFont("helvetica", "normal").setTextColor(30, 30, 40);
  const lines = ctx.doc.splitTextToSize(v, PAGE_W - M * 2 - 45);
  ctx.doc.text(lines, M + 45, ctx.y);
  ctx.y += Math.max(5, lines.length * 4);
}

function scoreBar(ctx: Ctx, label: string, value: number) {
  ensure(ctx, 10);
  const barW = PAGE_W - M * 2;
  ctx.doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60, 60, 80);
  ctx.doc.text(`${label}`, M, ctx.y);
  ctx.doc.setFont("helvetica", "bold").setTextColor(20, 20, 30);
  ctx.doc.text(`${value}%`, PAGE_W - M, ctx.y, { align: "right" });
  ctx.y += 2;
  ctx.doc.setFillColor(230, 232, 240).rect(M, ctx.y, barW, 3, "F");
  const color: [number, number, number] =
    value >= 65 ? [220, 60, 80] : value >= 40 ? [230, 170, 40] : [50, 170, 100];
  ctx.doc.setFillColor(...color).rect(M, ctx.y, (barW * value) / 100, 3, "F");
  ctx.y += 7;
}

function chip(ctx: Ctx, x: number, y: number, text: string, color: [number, number, number]) {
  ctx.doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...color);
  const w = ctx.doc.getTextWidth(text) + 4;
  ctx.doc.setDrawColor(...color).setLineWidth(0.2).roundedRect(x, y - 3, w, 4.5, 1, 1);
  ctx.doc.text(text, x + 2, y);
  return w;
}

function drawTimeline(ctx: Ctx, report: DetectionReport) {
  const segs = report.deepfakeAnalysis.segments;
  const dur = report.deepfakeAnalysis.estimatedDuration || segs.at(-1)?.end || 1;
  if (!segs.length) return;
  ensure(ctx, 20);
  const barW = PAGE_W - M * 2;
  const h = 8;
  ctx.doc.setDrawColor(200, 200, 210).setFillColor(245, 246, 250).rect(M, ctx.y, barW, h, "FD");
  for (const s of segs) {
    const x = M + (s.start / dur) * barW;
    const w = Math.max(0.5, ((s.end - s.start) / dur) * barW);
    const c: [number, number, number] =
      s.label === "synthetic" ? [220, 60, 80] : s.label === "suspicious" ? [230, 170, 40] : [50, 170, 100];
    ctx.doc.setFillColor(...c).rect(x, ctx.y, w, h, "F");
  }
  ctx.y += h + 3;
  ctx.doc.setFontSize(7).setTextColor(120, 120, 140).setFont("helvetica", "normal");
  ctx.doc.text("0:00", M, ctx.y);
  ctx.doc.text(fmtTime(dur), PAGE_W - M, ctx.y, { align: "right" });
  ctx.y += 5;
}

function fmtTime(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function sevColor(sev: string): [number, number, number] {
  return sev === "high" ? [220, 60, 80] : sev === "medium" ? [230, 170, 40] : [90, 130, 180];
}

export function generateReportPdf(report: DetectionReport): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ctx: Ctx = { doc, y: M };

  // Header
  doc.setFillColor(15, 20, 35).rect(0, 0, PAGE_W, 22, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(16);
  doc.text("VoxGuard — Voice Forensics Report", M, 14);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(180, 190, 210);
  doc.text(new Date().toLocaleString(), PAGE_W - M, 14, { align: "right" });
  ctx.y = 30;

  // Verdict
  h1(ctx, report.headline || "Analysis complete");
  p(ctx, report.reasoning);
  ctx.y += 2;
  kv(ctx, "Verdict", report.verdict.replace(/_/g, " "));
  kv(ctx, "Model confidence", `${report.confidence}%`);

  h2(ctx, "Risk scores");
  scoreBar(ctx, "AI / synthetic-voice likelihood", report.aiVoiceScore);
  scoreBar(ctx, "Fraud-intent likelihood", report.fraudScore);

  // Voice origin
  const vo = report.voiceOrigin;
  h2(ctx, "Voice origin — ensemble verdict");
  kv(ctx, "Label", vo.label.toUpperCase());
  kv(ctx, "Ensemble confidence", `${vo.confidence}%`);
  scoreBar(ctx, "Human likelihood", vo.humanScore);
  scoreBar(ctx, "AI likelihood", vo.aiScore);
  p(ctx, "Per-model agreement:", { size: 9, color: [80, 80, 100] });
  scoreBar(ctx, "Generalist AI detector", vo.agreement.generalistAi);
  scoreBar(ctx, "Deepfake specialist", vo.agreement.specialistDeepfake);
  scoreBar(ctx, "Human verifier", vo.agreement.humanVerifier);

  // Human verifier
  const hv = report.humanVerifier;
  h2(ctx, "Human verifier — biosignals");
  kv(ctx, "Human score", `${hv.humanScore}%`);
  if (hv.notes) p(ctx, hv.notes);
  for (const b of hv.biosignals) {
    ensure(ctx, 6);
    const mark = b.present ? "[+]" : "[-]";
    const color: [number, number, number] = b.present ? [50, 150, 90] : [180, 90, 90];
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...color);
    doc.text(mark, M, ctx.y);
    doc.setTextColor(20, 20, 30);
    doc.text(b.name, M + 8, ctx.y);
    ctx.y += 4;
    p(ctx, b.detail, { size: 8, color: [90, 95, 115] });
  }

  // Deepfake specialist
  const df = report.deepfakeAnalysis;
  h2(ctx, "Deepfake specialist model");
  kv(ctx, "Deepfake score", `${df.deepfakeScore}%`);
  kv(ctx, "Human likelihood", `${df.humanLikelihood}%`);
  kv(ctx, "Suspected family", df.suspectedFamily);
  kv(ctx, "Vocoder fingerprint", df.vocoderFingerprint);
  if (df.modelNotes) p(ctx, df.modelNotes);
  if (df.artifacts.length) {
    ctx.y += 2;
    p(ctx, "Detected artifacts:", { size: 9, color: [80, 80, 100] });
    for (const a of df.artifacts) {
      ensure(ctx, 8);
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(20, 20, 30);
      doc.text(`• ${a.name}`, M, ctx.y);
      chip(ctx, PAGE_W - M - 20, ctx.y, a.severity.toUpperCase(), sevColor(a.severity));
      ctx.y += 4;
      p(ctx, a.detail, { size: 8, color: [90, 95, 115] });
    }
  }

  // Localization
  h2(ctx, "Deepfake localization — segment timeline");
  drawTimeline(ctx, report);
  for (const s of df.segments) {
    ensure(ctx, 8);
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(20, 20, 30);
    doc.text(`${fmtTime(s.start)}–${fmtTime(s.end)}`, M, ctx.y);
    const c: [number, number, number] =
      s.label === "synthetic" ? [220, 60, 80] : s.label === "suspicious" ? [230, 170, 40] : [50, 170, 100];
    chip(ctx, M + 26, ctx.y, s.label.toUpperCase(), c);
    doc.setFont("helvetica", "normal").setTextColor(60, 60, 80);
    doc.text(`${s.score}%`, PAGE_W - M, ctx.y, { align: "right" });
    ctx.y += 4;
    if (s.note) p(ctx, s.note, { size: 8, color: [90, 95, 115] });
  }

  // Findings
  const renderFindings = (title: string, items: DetectionReport["acousticFindings"]) => {
    if (!items.length) return;
    h2(ctx, title);
    for (const f of items) {
      ensure(ctx, 8);
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(20, 20, 30);
      doc.text(f.label, M, ctx.y);
      chip(ctx, PAGE_W - M - 20, ctx.y, f.severity.toUpperCase(), sevColor(f.severity));
      ctx.y += 4;
      p(ctx, f.detail, { size: 8, color: [90, 95, 115] });
    }
  };
  renderFindings("Acoustic findings", report.acousticFindings);
  renderFindings("Linguistic findings", report.linguisticFindings);

  // Evidence
  if (report.supportingEvidence.length) {
    h2(ctx, "Supporting evidence");
    for (const e of report.supportingEvidence) {
      ensure(ctx, 10);
      doc.setDrawColor(50, 170, 100).setLineWidth(0.6);
      doc.line(M, ctx.y - 3, M, ctx.y + 4);
      p(ctx, `"${e.quote}"`, { italic: true, color: [30, 30, 40] });
      p(ctx, e.why, { size: 8, color: [90, 95, 115] });
      ctx.y += 1;
    }
  }

  // Recommended actions
  if (report.recommendedActions.length) {
    h2(ctx, "Recommended actions");
    for (const a of report.recommendedActions) {
      ensure(ctx, 5);
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(30, 30, 40);
      const lines = doc.splitTextToSize(`› ${a}`, PAGE_W - M * 2);
      doc.text(lines, M, ctx.y);
      ctx.y += lines.length * 4;
    }
  }

  // Transcript
  if (report.transcript) {
    h2(ctx, "Transcript");
    p(ctx, report.transcript, { size: 9 });
  }

  // Legend & methodology (one page)
  doc.addPage();
  ctx.y = M;
  h1(ctx, "Legend & methodology");
  p(ctx, "Use this reference to interpret every score, chip label, and verdict shown throughout this report. All numeric scores are 0–100 unless noted.", { size: 9, color: [80, 80, 100] });

  h2(ctx, "Risk score bands");
  const bands: Array<[string, [number, number, number], string]> = [
    ["Low (0–39)", [50, 170, 100], "Little to no evidence of the measured risk."],
    ["Elevated (40–64)", [230, 170, 40], "Mixed or ambiguous signals — reviewer judgement advised."],
    ["High (65–100)", [220, 60, 80], "Strong evidence of the measured risk."],
  ];
  for (const [label, color, desc] of bands) {
    ensure(ctx, 6);
    doc.setFillColor(...color).rect(M, ctx.y - 3, 3, 4, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(20, 20, 30);
    doc.text(label, M + 6, ctx.y);
    doc.setFont("helvetica", "normal").setTextColor(60, 60, 80);
    doc.text(desc, M + 46, ctx.y);
    ctx.y += 5;
  }

  h2(ctx, "Score definitions");
  kv(ctx, "AI-voice score", "Fused likelihood that the clip is synthetic. Weighted: deepfake specialist 50%, human verifier (inverted) 30%, generalist AI detector 20%.");
  kv(ctx, "Fraud-intent score", "Likelihood the content shows social-engineering / fraud patterns (urgency, impersonation, credential/payment asks), independent of synthesis.");
  kv(ctx, "Model confidence", "How internally consistent the generalist model's findings are for this clip. Not a probability of correctness.");
  kv(ctx, "Human likelihood", "Deepfake specialist's estimate that the voice is a real human recording, from its perspective only.");
  kv(ctx, "Ensemble confidence", "Agreement across the three specialists on the AI-vs-human axis. High = low variance between models; low = they disagree.");
  kv(ctx, "Segment score", "Per-segment suspicion (0–100). Tiles the whole clip so partial deepfakes / splices are localised.");

  h2(ctx, "Chip labels");
  const chips: Array<[string, [number, number, number], string]> = [
    ["LOW", [90, 130, 180], "Finding is minor or informational."],
    ["MEDIUM", [230, 170, 40], "Notable finding — corroborate with other signals."],
    ["HIGH", [220, 60, 80], "Strong forensic indicator on its own."],
    ["HUMAN", [50, 170, 100], "Segment reads as authentic human speech."],
    ["SUSPICIOUS", [230, 170, 40], "Segment shows ambiguous or mixed cues."],
    ["SYNTHETIC", [220, 60, 80], "Segment reads as AI-generated / voice-cloned."],
  ];
  for (const [label, color, desc] of chips) {
    ensure(ctx, 6);
    chip(ctx, M, ctx.y, label, color);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60, 60, 80);
    doc.text(desc, M + 34, ctx.y);
    ctx.y += 5;
  }

  h2(ctx, "Voice-origin verdict methodology");
  p(ctx, "Three independent specialist passes analyse the audio in parallel:", { size: 9, color: [60, 60, 80] });
  kv(ctx, "1. Generalist AI", "Broad AI-voice detector looking at acoustic + linguistic patterns together.");
  kv(ctx, "2. Deepfake specialist", "Fine-tuned pass focused on neural-TTS families, vocoder fingerprints, and per-segment localisation.");
  kv(ctx, "3. Human verifier", "Looks for positive human biosignals (breath, lip smacks, pitch jitter, room tone) rather than synthesis artifacts.");
  p(ctx, "Their scores are placed on a common AI-likelihood axis (human score is inverted) and fused with weights 50 / 30 / 20 (specialist / human / generalist). The ensemble confidence is derived from the standard deviation across the three — tight agreement raises confidence, disagreement lowers it.", { size: 9, color: [60, 60, 80] });
  p(ctx, "Origin label rules:", { size: 9, color: [80, 80, 100] });
  kv(ctx, "AI", "Fused AI score ≥ 65 and ensemble confidence ≥ 55.");
  kv(ctx, "Human", "Fused AI score ≤ 30 and ensemble confidence ≥ 55.");
  kv(ctx, "Uncertain", "All other cases — the models disagree or the clip sits in the ambiguous band.");

  h2(ctx, "Overall verdict rules");
  kv(ctx, "Likely fraud", "AI-voice ≥ 65 and fraud-intent ≥ 55.");
  kv(ctx, "AI-synthesized", "AI-voice ≥ 65 (fraud intent below threshold).");
  kv(ctx, "Suspicious", "Fraud-intent ≥ 55, or AI-voice ≥ 45.");
  kv(ctx, "Authentic", "None of the above thresholds met.");

  p(ctx, "This report is a decision-support tool for human reviewers. It is not a legal determination and should be corroborated with metadata, provenance, and context before action.", { size: 8, italic: true, color: [120, 120, 140] });


  // Appendix — Evidence ↔ segment map
  if (report.supportingEvidence.length) {
    doc.addPage();
    ctx.y = M;
    h1(ctx, "Appendix — Evidence timeline map");
    p(ctx, "Each supporting evidence item is mapped to the deepfake segment that best corresponds to it (ranked by segment suspicion score, descending). Use the timestamps for quick forensic review of the source audio.", { size: 9, color: [80, 80, 100] });
    ctx.y += 2;

    const segs = report.deepfakeAnalysis.segments;
    const rankedIdx = segs
      .map((s, i) => ({ i, score: s.score }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.i);

    report.supportingEvidence.forEach((e, i) => {
      ensure(ctx, 18);
      const segIdx = rankedIdx.length ? rankedIdx[i % rankedIdx.length] : -1;
      const seg = segIdx >= 0 ? segs[segIdx] : null;

      // Header row: #N · segment index · timestamp · label chip
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20, 20, 30);
      doc.text(`#${i + 1}`, M, ctx.y);
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(70, 75, 95);
      if (seg) {
        doc.text(`Segment ${segIdx + 1}/${segs.length}`, M + 12, ctx.y);
        doc.setFont("helvetica", "bold").setTextColor(20, 20, 30);
        doc.text(`${fmtTime(seg.start)} – ${fmtTime(seg.end)}`, M + 48, ctx.y);
        const c: [number, number, number] =
          seg.label === "synthetic"
            ? [220, 60, 80]
            : seg.label === "suspicious"
              ? [230, 170, 40]
              : [50, 170, 100];
        chip(ctx, M + 82, ctx.y, `${seg.label.toUpperCase()} · ${seg.score}%`, c);
      } else {
        doc.text("No segments available", M + 12, ctx.y);
      }
      ctx.y += 5;

      // Quote
      doc.setDrawColor(50, 170, 100).setLineWidth(0.6);
      doc.line(M, ctx.y - 2, M, ctx.y + 4);
      p(ctx, `"${e.quote}"`, { italic: true, color: [30, 30, 40] });
      p(ctx, e.why, { size: 8, color: [90, 95, 115] });

      // Segment cue if present
      if (seg?.note) {
        p(ctx, `Segment cue: ${seg.note}`, { size: 8, color: [110, 90, 60] });
      }
      ctx.y += 2;
    });
  }


  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(150, 150, 160);
    doc.text(
      `VoxGuard forensic report · Page ${i} of ${pages} · Research use only`,
      PAGE_W / 2,
      PAGE_H - 6,
      { align: "center" },
    );
  }

  return doc.output("blob");
}

export function downloadReportPdf(report: DetectionReport) {
  const blob = generateReportPdf(report);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `voxguard-report-${ts}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
