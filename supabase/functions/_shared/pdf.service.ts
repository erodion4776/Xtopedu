// ============================================================
// SCHOOLBOT - PDF SERVICE
// supabase/functions/_shared/pdf.service.ts
// ✅ Fixed: Comprehensive support for dynamic school branding
// ✅ Fixed: Safe hex color parsing for dynamic custom layouts
// ✅ Fixed: Stamps, signatures, logos embedded with fallback protection
// ✅ Uses unpkg/jsdelivr instead of esm.sh for reliability
// ============================================================

import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import { getSupabase } from './supabase.ts';

const db = getSupabase();
const BUCKET = 'documents';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:    'currency',
    currency: 'NGN',
  }).format(n);

// ─── Hex Color Parser ──────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  try {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return [
      isNaN(r) ? 0.12 : r,
      isNaN(g) ? 0.25 : g,
      isNaN(b) ? 0.68 : b,
    ];
  } catch {
    return [0.12, 0.25, 0.68]; // default primary dark blue
  }
}

// ─── Image Downloader & Embedder Helper ─────────────────────
async function drawImageFromUrl(
  doc: any,
  page: any,
  url: string | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  opacity = 1
): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[PDF] Failed to fetch image: ${url} | Status: ${res.status}`);
      return;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    
    // Auto-detect image format based on file extension/URL
    const lowerUrl = url.toLowerCase();
    const image = lowerUrl.includes('.png') || lowerUrl.includes('image=png')
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);

    page.drawImage(image, { x, y, width, height, opacity });
  } catch (err) {
    console.warn(`[PDF] Failed to draw image from URL: ${url}`, err);
  }
}

// ─── Simple Page & Line Writer ──────────────────────────────
class PdfWriter {
  doc:  any;
  page: any;
  font: any;
  bold: any;
  y = 0;
  readonly margin = 50;
  readonly width  = 595.28;
  readonly height = 841.89;

  static async create(): Promise<PdfWriter> {
    const w  = new PdfWriter();
    w.doc    = await PDFDocument.create();
    w.page   = w.doc.addPage([w.width, w.height]);
    w.font   = await w.doc.embedFont(StandardFonts.Helvetica);
    w.bold   = await w.doc.embedFont(StandardFonts.HelveticaBold);
    w.y      = w.height - w.margin;
    return w;
  }

  line(
    text: string,
    opts: {
      size?:  number;
      bold?:  boolean;
      color?: [number, number, number];
      gap?:   number;
    } = {}
  ): void {
    const size  = opts.size ?? 11;
    const color = opts.color
      ? rgb(opts.color[0], opts.color[1], opts.color[2])
      : rgb(0.1, 0.1, 0.1);

    this.page.drawText(text, {
      x:    this.margin,
      y:    this.y,
      size,
      font:  opts.bold ? this.bold : this.font,
      color,
    });

    this.y -= size + (opts.gap ?? 8);
  }

  divider(): void {
    this.page.drawLine({
      start:     { x: this.margin,              y: this.y },
      end:       { x: this.width - this.margin, y: this.y },
      thickness: 1,
      color:     rgb(0.8, 0.8, 0.8),
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

// ─── Upload PDF to Storage Bucket ───────────────────────────
async function uploadPdf(
  bytes: Uint8Array,
  path:  string
): Promise<string> {
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: 'application/pdf',
      upsert:      true,
    });

  if (error) {
    throw new Error(`PDF upload failed: ${error.message}`);
  }

  const { data } = db.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

// ============================================================
// PDF SERVICE CLASS
// ============================================================

export class PdfService {

  // ─── Build Receipt PDF ─────────────────────────────────
  async buildReceiptPdf(params: {
    receiptNumber:   string;
    schoolName:      string;
    schoolAddress?:  string | null;
    schoolPhone?:    string | null;
    studentName:     string;
    admissionNumber: string;
    className:       string;
    feeTitle:        string;
    term?:           string;
    academicYear?:   string;
    amount:          number;
    paymentMethod:   string;
    reference:       string;
    paymentDate:     string;
    issuedTo:        string;
    schoolId:        string;  // ✅ Pass schoolId for branding
  }): Promise<string> {
    const w = await PdfWriter.create();

    // Fetch school branding info
    const { data: school } = await db
      .from('schools')
      .select('logo_url, stamp_url, principal_signature_url, motto, primary_color, secondary_color, receipt_footer')
      .eq('id', params.schoolId)
      .maybeSingle();

    const brandColor = school?.primary_color ? hexToRgb(school.primary_color) : [0.12, 0.25, 0.68];

    // ✅ Embed School Logo if exists
    if (school?.logo_url) {
      await drawImageFromUrl(w.doc, w.page, school.logo_url, w.margin, w.y - 50, 50, 50);
      w.space(20);
    }

    w.line(params.schoolName, {
      size: 18, bold: true, gap: 4, color: brandColor,
    });

    if (school?.motto) {
      w.line(`"${school.motto}"`, {
        size: 9, color: [0.4, 0.4, 0.4], gap: 6,
      });
    }

    if (params.schoolAddress) {
      w.line(params.schoolAddress, {
        size: 9, color: [0.4, 0.4, 0.4],
      });
    }
    if (params.schoolPhone) {
      w.line(params.schoolPhone, {
        size: 9, color: [0.4, 0.4, 0.4],
      });
    }
    w.space(6);
    w.divider();

    w.line('PAYMENT RECEIPT', {
      size: 14, bold: true, gap: 14, color: brandColor,
    });

    w.line(`Receipt No:  ${params.receiptNumber}`, { bold: true });
    const date = new Date(params.paymentDate)
      .toLocaleDateString('en-NG', {
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

    w.line('PAYMENT DETAILS', { bold: true, gap: 12, color: brandColor });
    w.line(`Fee Item:    ${params.feeTitle}`);
    if (params.term) {
      w.line(`Term:        ${params.term}`);
    }
    if (params.academicYear) {
      w.line(`Session:     ${params.academicYear}`);
    }
    w.line(`Method:      ${params.paymentMethod}`);
    w.line(`Reference:   ${params.reference}`);
    w.space(10);
    w.divider();

    w.line(
      `AMOUNT PAID:  ${fmt(params.amount)}`,
      { size: 14, bold: true, gap: 14, color: brandColor }
    );
    w.divider();

    // ✅ Embed Official Stamp & Signature if exists
    if (school?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, school.stamp_url, w.width - w.margin - 110, w.margin + 30, 80, 80, 0.85);
    }
    if (school?.principal_signature_url) {
      await drawImageFromUrl(w.doc, w.page, school.principal_signature_url, w.margin, w.margin + 30, 100, 35);
    }

    w.space(14);
    
    // ✅ Apply custom footer or default
    const footerText = school?.receipt_footer ?? 'This is an official payment receipt. Please keep this for your records.';
    w.line(footerText, {
      size: 8, color: [0.4, 0.4, 0.4],
    });
    w.line('Powered by SchoolBot', {
      size: 8, color: [0.6, 0.6, 0.6],
    });

    const bytes = await w.bytes();
    const safe  = params.receiptNumber.replace(/[^A-Za-z0-9-]/g, '');
    return uploadPdf(bytes, `receipts/${safe}.pdf`);
  }

  // ─── Build Term Report PDF ──────────────────────────────
  async buildReportPdf(
    report:    Record<string, unknown>,
    typeLabel: string
  ): Promise<string> {
    const school = (report.school as Record<string, string>) ?? {};
    const att = report.attendance as Record<string, unknown> | null;
    const fees = report.fees as Record<string, unknown> | null;
    const classes = report.classes as Array<Record<string, unknown>> | null;

    const w = await PdfWriter.create();

    // Fetch school branding info
    const { data: dbSchool } = await db
      .from('schools')
      .select('logo_url, stamp_url, motto, primary_color, secondary_color, result_footer')
      .eq('id', school.id)
      .maybeSingle();

    const brandColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.12, 0.25, 0.68];

    // ✅ Embed School Logo if exists
    if (dbSchool?.logo_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.logo_url, w.margin, w.y - 50, 50, 50);
      w.space(20);
    }

    w.line(school.name ?? 'School', {
      size: 18, bold: true, gap: 4, color: brandColor,
    });
    if (dbSchool?.motto) {
      w.line(`"${dbSchool.motto}"`, {
        size: 9, color: [0.4, 0.4, 0.4], gap: 6,
      });
    }
    if (school.address) {
      w.line(school.address, {
        size: 9, color: [0.4, 0.4, 0.4],
      });
    }
    w.space(6);
    w.divider();

    w.line(
      `${typeLabel.toUpperCase()} REPORT`,
      { size: 14, bold: true, gap: 12, color: brandColor }
    );
    w.line(`Term: ${report.term ?? ''}`);
    w.line(`Academic Year: ${report.academic_year ?? ''}`);
    w.space(6);
    w.divider();

    if (att) {
      w.line('ATTENDANCE OVERVIEW', { bold: true, gap: 12, color: brandColor });
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
      w.line('FEE COLLECTION', { bold: true, gap: 12, color: brandColor });
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
      w.line('CLASS BREAKDOWN', { bold: true, gap: 12, color: brandColor });
      for (const cls of classes) {
        if (w.y < 80) {
          w.page = w.doc.addPage([w.width, w.height]);
          w.y    = w.height - w.margin;
        }
        w.line(
          `${cls.class}:  ${cls.students} students, ` +
          `${cls.attendance_rate} attendance`,
          { size: 10 }
        );
      }
      w.space(10);
      w.divider();
    }

    // ✅ Embed Official Stamp if exists
    if (dbSchool?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.stamp_url, w.width - w.margin - 110, w.margin + 30, 80, 80, 0.85);
    }

    w.space(6);
    const generated = new Date().toLocaleDateString(
      'en-NG',
      {
        day:    'numeric',
        month:  'long',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit',
      }
    );
    w.line(`Generated: ${generated}`, {
      size: 8, color: [0.5, 0.5, 0.5],
    });

    const bytes     = await w.bytes();
    const safeSchool = (school.name ?? 'school')
      .toString()
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 20);
    const stamp = Date.now();

    return uploadPdf(
      bytes,
      `reports/${safeSchool}-${typeLabel}-${stamp}.pdf`
    );
  }

  // ─── Build Student Report PDF ───────────────────────────
  async buildStudentReportPdf(
    data: Record<string, unknown>
  ): Promise<string> {
    const student = data.student as Record<string, string> ?? {};
    const w = await PdfWriter.create();

    const schoolId = student.school_id;

    // Fetch school branding info
    const { data: dbSchool } = await db
      .from('schools')
      .select('logo_url, stamp_url, motto, primary_color, secondary_color, result_footer')
      .eq('id', schoolId)
      .maybeSingle();

    const brandColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.12, 0.25, 0.68];

    // ✅ Embed School Logo if exists
    if (dbSchool?.logo_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.logo_url, w.margin, w.y - 50, 50, 50);
      w.space(20);
    }

    w.line((data.school_name as string) ?? 'School', {
      size: 18, bold: true, gap: 4, color: brandColor,
    });
    if (dbSchool?.motto) {
      w.line(`"${dbSchool.motto}"`, {
        size: 9, color: [0.4, 0.4, 0.4], gap: 6,
      });
    }
    w.space(6);
    w.divider();

    // ✅ Embed Student Passport if exists
    if (student.passport_url) {
      await drawImageFromUrl(w.doc, w.page, student.passport_url, w.width - w.margin - 65, w.y - 75, 65, 75);
    }

    w.line('STUDENT TERM REPORT', {
      size: 14, bold: true, gap: 12, color: brandColor,
    });
    w.line(`Name:   ${student.full_name ?? ''}`);
    w.line(`Adm No: ${student.admission_number ?? ''}`);
    w.line(`Class:  ${student.class_name ?? ''}`);
    w.space(6);
    w.divider();

    const att = data.attendance as Record<string, unknown> | null;
    if (att) {
      w.line('ATTENDANCE SUMMARY', { bold: true, gap: 12, color: brandColor });
      w.line(`Rate:    ${att.rate ?? ''}%`);
      w.line(`Present: ${att.present ?? ''} days`);
      w.line(`Absent:  ${att.absent ?? ''} days`);
      w.line(`Late:    ${att.late ?? ''} days`);
      w.space(10);
      w.divider();
    }

    const fees = data.fees as Record<string, unknown> | null;
    if (fees) {
      w.line('FEES & ACCOUNTS', { bold: true, gap: 12, color: brandColor });
      w.line(`Total Paid:  ${fees.total_paid_fmt ?? ''}`);
      w.line(`Outstanding: ${fees.total_outstanding_fmt ?? ''}`);
      w.space(10);
      w.divider();
    }

    // ✅ Embed Official Stamp if exists
    if (dbSchool?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.stamp_url, w.width - w.margin - 110, w.margin + 30, 80, 80, 0.85);
    }

    const bytes = await w.bytes();
    const adm   = (student.admission_number ?? 'student').replace(/[^A-Za-z0-9]/g, '');

    return uploadPdf(bytes, `reports/student-${adm}.pdf`);
  }

  // ─── Build Result PDF ───────────────────────────────────
  async buildResultPdf(
    data: Record<string, unknown>
  ): Promise<string> {
    const student = data.student as Record<string, string> ?? {};
    const subjects = data.subjects as Array<Record<string, unknown>> ?? [];
    const w = await PdfWriter.create();

    const schoolId = student.school_id;

    // Fetch school branding info
    const { data: dbSchool } = await db
      .from('schools')
      .select('logo_url, stamp_url, principal_signature_url, motto, principal_name, primary_color, secondary_color, result_footer')
      .eq('id', schoolId)
      .maybeSingle();

    const brandColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.12, 0.25, 0.68];

    // ✅ Embed School Logo if exists
    if (dbSchool?.logo_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.logo_url, w.margin, w.y - 50, 50, 50);
      w.space(20);
    }

    w.line((data.school_name as string) ?? 'School', {
      size: 18, bold: true, gap: 4, color: brandColor,
    });
    if (dbSchool?.motto) {
      w.line(`"${dbSchool.motto}"`, {
        size: 9, color: [0.4, 0.4, 0.4], gap: 6,
      });
    }
    w.space(6);
    w.divider();

    // ✅ Embed Student Passport if exists
    if (student.passport_url) {
      await drawImageFromUrl(w.doc, w.page, student.passport_url, w.width - w.margin - 65, w.y - 75, 65, 75);
    }

    w.line('STUDENT TERM RESULT', {
      size: 14, bold: true, gap: 12, color: brandColor,
    });
    w.line(`Name:   ${student.full_name ?? ''}`);
    w.line(`Adm No: ${student.admission_number ?? ''}`);
    w.line(`Class:  ${student.class_name ?? ''}`);
    w.line(`Term:   ${(data.term as string) ?? ''}`);
    w.space(6);
    w.divider();

    w.line('ACADEMIC PERFORMANCE', {
      bold: true, gap: 12, color: brandColor,
    });

    for (const sub of subjects) {
      if (w.y < 80) {
        w.page = w.doc.addPage([w.width, w.height]);
        w.y    = w.height - w.margin;
      }
      w.line(
        `${String(sub.name ?? '').padEnd(20)} ` +
        `CA: ${sub.ca_score}  ` +
        `Exam: ${sub.exam_score}  ` +
        `Total: ${sub.total}  ` +
        `${sub.grade}`,
        { size: 10 }
      );
    }

    w.space(10);
    w.divider();

    w.line(`Average: ${data.average ?? ''}%`, { bold: true });
    w.line(`Position: ${data.position ?? ''}`);

    w.space(20);

    // Draw Principal Signature block if exists
    if (dbSchool?.principal_signature_url) {
      w.line('Principal / Head Teacher Signature:', { size: 9, bold: true, gap: 35 });
      await drawImageFromUrl(w.doc, w.page, dbSchool.principal_signature_url, w.margin, w.y + 10, 100, 35);
      if (dbSchool?.principal_name) {
        w.line(dbSchool.principal_name, { size: 9, bold: true });
      }
    }

    // ✅ Embed Stamp on bottom right if exists
    if (dbSchool?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.stamp_url, w.width - w.margin - 110, w.margin + 30, 80, 80, 0.85);
    }

    w.space(10);

    // ✅ Result Footer
    const footerText = dbSchool?.result_footer ?? 'This is an official academic result sheet.';
    w.line(footerText, {
      size: 8, color: [0.4, 0.4, 0.4],
    });

    const bytes = await w.bytes();
    const adm   = (student.admission_number ?? 'student').replace(/[^A-Za-z0-9]/g, '');

    return uploadPdf(bytes, `results/result-${adm}.pdf`);
  }
}
