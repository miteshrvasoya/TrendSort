import { reportSections, type Report } from "@trendbridge/shared";
import PDFDocument from "pdfkit";

/** Plain, readable PDF of the weekly report (headings and bullets; no images, so it prints anywhere). */
export function renderReportPdf(r: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: `TrendBridge weekly report ${r.weekOf}`, Author: "TrendBridge" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(18).text(`TrendBridge weekly report`);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#555")
      .text(`Week of ${r.weekOf} · generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`);
    if (r.mode === "sample")
      doc
        .moveDown(0.3)
        .font("Helvetica-Bold")
        .fillColor("#b45309")
        .text("SAMPLE DATA: synthetic trends and scores for demonstration only.");
    doc.fillColor("#000");
    for (const s of reportSections(r)) {
      doc.moveDown(0.8).font("Helvetica-Bold").fontSize(13).text(s.title);
      doc.font("Helvetica").fontSize(10.5);
      for (const l of s.lines) doc.moveDown(0.2).text(`• ${l}`, { indent: 6 });
    }
    doc.end();
  });
}
