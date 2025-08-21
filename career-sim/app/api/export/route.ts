import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PDFDocument, StandardFonts } from "pdf-lib"; // install pdf-lib

function mdFromPlan(row: any) {
  const o = row.outputs || {};
  const s = row.sources || {};
  const i = row.inputs || {};

  const lines = [
    `# ${row.title}`,
    "",
    `**Created:** ${new Date(row.created_at).toISOString()}`,
    "",
    "## Goals & Inputs",
    `- Target role: ${i.goalRole ?? i.role ?? "—"}`,
    `- Timeframe: ${i.timeframeMin ?? "?"}–${i.timeframeMax ?? "?"} months`,
    `- Stack prefs: ${(i.stackPrefs || []).join(", ") || "—"}`,
    "",
    "## Target & Evidence",
    `- Target job: ${i.targetJobTitle ?? "—"} (${i.targetLocation ?? "—"})`,
    ...(Array.isArray(s.citedJobs) && s.citedJobs.length
      ? ["- Citations:", ...s.citedJobs.map((j: any, idx: number) => `  ${idx + 1}. ${j.title} — ${j.url || "N/A"}`)]
      : ["- Citations: —"]),
    "",
    "## Gaps",
    ...(Array.isArray(o.missing) && o.missing.length ? o.missing.map((g: string) => `- ${g}`) : ["- None detected"]),
    "",
    "## Learning Paths",
    ...(Array.isArray(o.paths)
      ? o.paths.map((p: any) => `- **${p.name}**: ${(p.skills || []).join(", ")}`)
      : ["- —"]),
    "",
    "## Simulation (12w+)",
    ...(Array.isArray(o.series)
      ? o.series.map((s: any) => `- ${s.label}: last=${s.steps?.at(-1)?.score ?? "—"}%`)
      : o.steps
      ? [`- Single path: last=${o.steps?.at(-1)?.score ?? "—"}%`]
      : ["- —"]),
    "",
    "## Salary",
    o.salaryTarget
      ? `- Target median: ${o.salaryTarget.currency} ${o.salaryTarget.median?.toLocaleString?.() || o.salaryTarget.median}`
      : "- Target: —",
    o.salaryBaseline
      ? `- Baseline median: ${o.salaryBaseline.currency} ${o.salaryBaseline.median?.toLocaleString?.() || o.salaryBaseline.median}`
      : "- Baseline: —",
    o.delta && o.delta.medianDelta != null
      ? `- Estimated delta: ${o.delta.currency} ${o.delta.medianDelta.toLocaleString?.() || o.delta.medianDelta}`
      : "",
    "",
    "## Explanation",
    o.explanation || "—",
  ];
  return lines.join("\n");
}

async function pdfFromMarkdown(md: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const { width, height } = page.getSize();
  const margin = 40;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const maxWidth = width - margin * 2;

  // naive wrap
  const words = md.split(/\s+/);
  let y = height - margin;
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    const tw = font.widthOfTextAtSize(test, fontSize);
    if (tw > maxWidth) {
      page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= 14;
      if (y < margin) {
        y = height - margin;
        pdf.addPage();
      }
      line = w;
    } else {
      line = test;
    }
  }
  if (line) page.drawText(line, { x: margin, y, size: fontSize, font });

  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = BigInt(url.searchParams.get("planId") || "0");
  const format = (url.searchParams.get("format") || "md").toLowerCase();

  const row = await prisma.plan.findUnique({ where: { plan_id: id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const md = mdFromPlan(row);

  if (format === "pdf") {
    const pdfBytes = await pdfFromMarkdown(md);
    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="plan-${row.plan_id}.pdf"`,
      },
    });
  }
  // default: markdown
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="plan-${row.plan_id}.md"`,
    },
  });
}
