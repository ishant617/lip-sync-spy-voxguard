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
