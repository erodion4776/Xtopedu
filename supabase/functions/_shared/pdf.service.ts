// ============================================================
// SCHOOLBOT - PDF SERVICE
// supabase/functions/_shared/pdf.service.ts
//
// Builds PDF receipts and reports (pdf-lib), uploads them to
// Supabase Storage, and returns a public URL WhatsApp can send
// as a downloadable document.
// ============================================================

import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'https://esm.sh/pdf-lib@1.17.1';
import { getSupabase } from './supabase.ts';

const BUCKET = 'documents';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

// ─── Simple page/line writer so callers don't touch pdf-lib directly ──────
class PdfWriter {
  // deno-lint-ignore no-explicit-any
  doc: any;
  // deno-lint-ignore no-explicit-any
  page: any;
  // deno-lint-ignore no-explicit-any
  font: any;
  // deno-lint-ignore no-explicit-any
  bold: any;
  y = 0;
  readonly margin = 50;
  readonly width = 595.28; // A4 width in points
  readonly height = 841.89; // A4 height in points

  static async create(): Promise<PdfWriter> {
    const w = new PdfWriter();
    w.doc = await PDFDocument.create();
    w.page = w.doc.addPage([w.width, w.height]);
    w.font = await w.doc.embedFont(StandardFonts.Helvetica);
    w.bold = await w.doc.embedFont(StandardFonts.HelveticaBold);
    w.y = w.height - w.margin;
    return w;
  }

  line(
    text: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}
  ): void {
    const size = opts.size ?? 11;
    const color = opts.color
      ? rgb(opts.color[0], opts.color[1], opts.color[2])
      : rgb(0.1, 0.1, 0.1);

    this.page.drawText(text, {
      x: this.margin,
      y: this.y,
      size,
      font: opts.bold ? this.bold : this.font,
      color,
    });

    this.y -= size + (opts.gap ?? 8);
  }

  divider(): void {
    this.page.drawLine({
      start: { x: this.margin, y: this.y },
      end: { x: this.width - this.margin, y: this.y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    this.y -= 16;
  }

  space(n = 10): void {
    this.y -= n;
  }

  async bytes(): Promise<Uint8Array> {
    return await this.doc.save();
  }
}

// ─── Upload PDF bytes to Storage and return a public URL ─────────────────
async function uploadPdf(bytes: Uint8Array, path: string): Promise<string> {
  const db = getSupabase();

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`PDF upload failed: ${error.message}`);
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export class PdfService {

  // ─── Build + upload a payment receipt PDF ───────────────────────────────
  async buildReceiptPdf(params: {
    receiptNumber: string;
    schoolName: string;
    schoolAddress?: string | null;
    schoolPhone?: string | null;
    studentName: string;
    admissionNumber: string;
    className: string;
    feeTitle: string;
    term?: string;
    academicYear?: string;
    amount: number;
    paymentMethod: string;
    reference: string;
    paymentDate: string;
    issuedTo: string;
  }): Promise<string> {
    const w = await PdfWriter.create();

    w.line(params.schoolName, { size: 18, bold: true, gap: 4 });
    if (params.schoolAddress) w.line(params.schoolAddress, { size: 10, color: [0.4, 0.4, 0.4] });
    if (params.schoolPhone) w.line(params.schoolPhone, { size: 10, color: [0.4, 0.4, 0.4] });
    w.space(6);
    w.divider();

    w.line('PAYMENT RECEIPT', { size: 15, bold: true, gap: 14 });

    w.line(`Receipt No:  ${params.receiptNumber}`, { bold: true });
    const date = new Date(params.paymentDate).toLocaleDateString('en-NG', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    w.line(`Date:        ${date}`);
    w.space(6);
    w.divider();

    w.line(`Issued To:   ${params.issuedTo}`);
    w.line(`Student:     ${params.studentName}`);
    w.line(`Adm No:      ${params.admissionNumber}`);
    w.line(`Class:       ${params.className}`);
    w.space(6);
    w.divider();

    w.line('PAYMENT DETAILS', { bold: true, gap: 12 });
    w.line(`Fee:         ${params.feeTitle}`);
    if (params.term) w.line(`Term:        ${params.term}`);
    if (params.academicYear) w.line(`Year:        ${params.academicYear}`);
    w.line(`Method:      ${params.paymentMethod}`);
    w.line(`Reference:   ${params.reference}`);
    w.space(10);
    w.divider();

    w.line(`AMOUNT PAID:  ${fmt(params.amount)}`, { size: 15, bold: true, gap: 14 });
    w.divider();

    w.space(14);
    w.line('This is an official payment receipt.', { size: 9, color: [0.4, 0.4, 0.4] });
    w.line('Please keep this for your records.', { size: 9, color: [0.4, 0.4, 0.4], gap: 4 });
    w.line(`Powered by SchoolBot`, { size: 9, color: [0.6, 0.6, 0.6] });

    const bytes = await w.bytes();
    const safeReceiptNo = params.receiptNumber.replace(/[^A-Za-z0-9-]/g, '');
    return uploadPdf(bytes, `receipts/${safeReceiptNo}.pdf`);
  }

  // ─── Build + upload a term report PDF ────────────────────────────────────
  async buildReportPdf(
    report: Record<string, unknown>,
    typeLabel: string
  ): Promise<string> {
    const school = (report.school as Record<string, string>) ?? {};
    const att = report.attendance as Record<string, unknown> | null;
    const fees = report.fees as Record<string, unknown> | null;
    const classes = report.classes as Array<Record<string, unknown>> | null;

    const w = await PdfWriter.create();

    w.line(school.name ?? 'School', { size: 18, bold: true, gap: 4 });
    if (school.address) w.line(school.address, { size: 10, color: [0.4, 0.4, 0.4] });
    w.space(6);
    w.divider();

    w.line(`${typeLabel.toUpperCase()} REPORT`, { size: 15, bold: true, gap: 12 });
    w.line(`Term: ${report.term ?? ''}`);
    w.line(`Academic Year: ${report.academic_year ?? ''}`);
    w.space(6);
    w.divider();

    if (att) {
      w.line('ATTENDANCE', { bold: true, gap: 12 });
      w.line(`School Days:   ${att.total_school_days}`);
      w.line(`Students:      ${att.total_students}`);
      w.line(`Present:       ${att.present}`);
      w.line(`Absent:        ${att.absent}`);
      w.line(`Late:          ${att.late}`);
      w.line(`Rate:          ${att.attendance_rate}`);
      w.space(10);
      w.divider();
    }

    if (fees) {
      w.line('FEE COLLECTION', { bold: true, gap: 12 });
      w.line(`Billed:        ${fees.total_billed_fmt}`);
      w.line(`Collected:     ${fees.total_paid_fmt}`);
      w.line(`Outstanding:   ${fees.total_outstanding_fmt}`);
      w.line(`Rate:          ${fees.collection_rate}`);
      w.line(`Paid invoices: ${fees.paid_invoices}`);
      w.line(`Pending:       ${fees.pending_invoices}`);
      w.space(10);
      w.divider();
    }

    if (classes?.length) {
      w.line('CLASS BREAKDOWN', { bold: true, gap: 12 });
      for (const cls of classes) {
        if (w.y < 80) {
          // Start a new page if running out of room
          w.page = w.doc.addPage([w.width, w.height]);
          w.y = w.height - w.margin;
        }
        w.line(
          `${cls.class}:  ${cls.students} students, ${cls.attendance_rate} attendance`,
          { size: 10 }
        );
      }
      w.space(10);
      w.divider();
    }

    w.space(6);
    const generated = new Date().toLocaleDateString('en-NG', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    w.line(`Generated: ${generated}`, { size: 9, color: [0.5, 0.5, 0.5] });

    const bytes = await w.bytes();
    const safeSchool = (school.name ?? 'school')
      .toString().replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    const stamp = Date.now();
    return uploadPdf(bytes, `reports/${safeSchool}-${typeLabel}-${stamp}.pdf`);
  }
}
