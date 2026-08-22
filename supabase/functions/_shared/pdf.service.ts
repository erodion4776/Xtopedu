// ============================================================
// SCHOOLBOT - PDF SERVICE
// supabase/functions/_shared/pdf.service.ts
// ✅ Redesigned buildResultPdf into a high-end, single-page A4 template
// ✅ Fixed: Horizontal side-by-side header layout with logo left, text center, avatar right
// ✅ Fixed: WinAnsi encoding error on Naira (₦) symbol -> NGN
// ✅ Fixed: Auto-sanitizes text (em-dashes, bullets, smart quotes)
// ✅ Fixed: Stamps, signatures, logos embedded with fallback protection
// ============================================================

import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import { getSupabase } from './supabase.ts';

const db = getSupabase();
const BUCKET = 'documents';

// ASCII-safe currency format for PDF WinAnsi compatibility
const fmt = (n: number) =>
  `NGN ${new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)}`;

// ─── WinAnsi Text Sanitizer ─────────────────────────────────
function sanitizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/₦/g, 'NGN ')
    .replace(/[—–]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^\x00-\x7F]/g, ''); // Strip any remaining non-ASCII glyphs
}

// ─── Hex Color Parser ──────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  try {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return [
      isNaN(r) ? 0.0 : r,
      isNaN(g) ? 0.356 : g,
      isNaN(b) ? 0.376 : b,
    ];
  } catch {
    return [0.0, 0.356, 0.376]; // default dark teal
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
      x?:     number;
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

    const safeText = sanitizeText(text);

    this.page.drawText(safeText, {
      x:    opts.x ?? this.margin,
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

// ─── Reusable Branded Header (Logo Left, Text Center, Avatar Right) ────────
async function drawSchoolHeader(
  w: PdfWriter,
  school: {
    name:           string;
    motto?:         string | null;
    address?:       string | null;
    phone?:         string | null;
    logo_url?:      string | null;
    primary_color?: string | null;
  }
): Promise<void> {
  const brandColor = school.primary_color ? hexToRgb(school.primary_color) : [0.0, 0.356, 0.376];
  const hasLogo = !!school.logo_url;
  const logoSize = 52;
  const logoGap = 14;

  const headerStartY = w.y;

  // 1. Draw Logo on Left (if exists)
  if (hasLogo) {
    await drawImageFromUrl(
      w.doc,
      w.page,
      school.logo_url,
      w.margin,
      headerStartY - logoSize + 10,
      logoSize,
      logoSize
    );
  }

  // 2. Calculate text X offset so text sits neatly to the right of logo
  const textX = hasLogo ? w.margin + logoSize + logoGap : w.margin;

  // School Name
  const nameSize = 16;
  w.page.drawText(sanitizeText(school.name), {
    x: textX,
    y: w.y,
    size: nameSize,
    font: w.bold,
    color: rgb(brandColor[0], brandColor[1], brandColor[2]),
  });
  w.y -= nameSize + 4;

  // Motto
  if (school.motto) {
    const mottoSize = 9;
    w.page.drawText(sanitizeText(`"${school.motto}"`), {
      x: textX,
      y: w.y,
      size: mottoSize,
      font: w.font,
      color: rgb(0.4, 0.4, 0.4),
    });
    w.y -= mottoSize + 4;
  }

  // Address
  if (school.address) {
    const addrSize = 9;
    w.page.drawText(sanitizeText(school.address), {
      x: textX,
      y: w.y,
      size: addrSize,
      font: w.font,
      color: rgb(0.4, 0.4, 0.4),
    });
    w.y -= addrSize + 3;
  }

  // Phone
  if (school.phone) {
    const phoneSize = 9;
    w.page.drawText(sanitizeText(school.phone), {
      x: textX,
      y: w.y,
      size: phoneSize,
      font: w.font,
      color: rgb(0.4, 0.4, 0.4),
    });
    w.y -= phoneSize + 3;
  }

  // Ensure w.y completely clears both logo and text height
  const textBottom = w.y;
  const logoBottom = hasLogo ? headerStartY - logoSize - 4 : headerStartY;
  w.y = Math.min(textBottom, logoBottom) - 6;

  w.divider();
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
    schoolId:        string;
  }): Promise<string> {
    const w = await PdfWriter.create();

    const { data: school } = await db
      .from('schools')
      .select('logo_url, stamp_url, principal_signature_url, motto, primary_color, secondary_color, receipt_footer')
      .eq('id', params.schoolId)
      .maybeSingle();

    const brandColor = school?.primary_color ? hexToRgb(school.primary_color) : [0.0, 0.356, 0.376];

    await drawSchoolHeader(w, {
      name:          params.schoolName,
      motto:         school?.motto,
      address:       params.schoolAddress,
      phone:         params.schoolPhone,
      logo_url:      school?.logo_url,
      primary_color: school?.primary_color,
    });

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

    if (school?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, school.stamp_url, w.width - w.margin - 110, w.margin + 30, 80, 80, 0.85);
    }
    if (school?.principal_signature_url) {
      await drawImageFromUrl(w.doc, w.page, school.principal_signature_url, w.margin, w.margin + 30, 100, 35);
    }

    w.space(14);
    
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

    const { data: dbSchool } = await db
      .from('schools')
      .select('logo_url, stamp_url, motto, primary_color, secondary_color, result_footer')
      .eq('id', school.id)
      .maybeSingle();

    const brandColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.0, 0.356, 0.376];

    await drawSchoolHeader(w, {
      name:          school.name ?? 'School',
      motto:         dbSchool?.motto,
      address:       school.address,
      phone:         school.phone,
      logo_url:      dbSchool?.logo_url,
      primary_color: dbSchool?.primary_color,
    });

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
      w.line(`Billed:        ${fees.total_billed_fmt ? sanitizeText(String(fees.total_billed_fmt)) : ''}`);
      w.line(`Collected:     ${fees.total_paid_fmt ? sanitizeText(String(fees.total_paid_fmt)) : ''}`);
      w.line(`Outstanding:   ${fees.total_outstanding_fmt ? sanitizeText(String(fees.total_outstanding_fmt)) : ''}`);
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

    const { data: dbSchool } = await db
      .from('schools')
      .select('logo_url, stamp_url, motto, primary_color, secondary_color, result_footer')
      .eq('id', schoolId)
      .maybeSingle();

    const brandColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.0, 0.356, 0.376];

    await drawSchoolHeader(w, {
      name:          (data.school_name as string) ?? 'School',
      motto:         dbSchool?.motto,
      logo_url:      dbSchool?.logo_url,
      primary_color: dbSchool?.primary_color,
    });

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
      w.line(`Total Paid:  ${fees.total_paid_fmt ? sanitizeText(String(fees.total_paid_fmt)) : ''}`);
      w.line(`Outstanding: ${fees.total_outstanding_fmt ? sanitizeText(String(fees.total_outstanding_fmt)) : ''}`);
      w.space(10);
      w.divider();
    }

    if (dbSchool?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.stamp_url, w.width - w.margin - 110, w.margin + 30, 80, 80, 0.85);
    }

    const bytes = await w.bytes();
    const adm   = (student.admission_number ?? 'student').replace(/[^A-Za-z0-9]/g, '');

    return uploadPdf(bytes, `reports/student-${adm}.pdf`);
  }

  // ─── Build Highly Styled Custom Result PDF ─────────────────
  // ✅ Complete rebuild based on A4 single-page constraints & design specifications
  async buildResultPdf(
    data: Record<string, unknown>
  ): Promise<string> {
    const student = data.student as Record<string, string> ?? {};
    const subjects = data.subjects as Array<Record<string, unknown>> ?? [];
    
    // Create new document with tight 50pt margins
    const w = await PdfWriter.create();

    const schoolId = student.school_id;

    // Fetch school branding info
    const { data: dbSchool } = await db
      .from('schools')
      .select('logo_url, stamp_url, principal_signature_url, motto, principal_name, primary_color, secondary_color, result_footer, address, phone')
      .eq('id', schoolId)
      .maybeSingle();

    // ── Theme Configuration ────────────────────────────────────
    const primaryColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.0, 0.356, 0.376]; // #005B60 Dark Teal
    const thinBorderColor = rgb(0.8, 0.8, 0.8);
    const textDarkColor = rgb(0.12, 0.15, 0.18);
    const whiteColor = rgb(1.0, 1.0, 1.0);
    const zebraColor = rgb(0.96, 0.98, 0.98);

    // Initial Y tracking starting from top
    w.y = w.height - 40; // 40pt top margin

    // ── 1. HEADER SECTION (3 Columns) ──────────────────────────
    const headerY = w.y;
    const headerHeight = 70;

    // Left Column: circular school logo placeholder
    w.page.drawCircle({
      x: w.margin + 25,
      y: headerY - 30,
      radius: 25,
      borderColor: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
      borderWidth: 1.5,
    });
    if (dbSchool?.logo_url) {
      await drawImageFromUrl(
        w.doc,
        w.page,
        dbSchool.logo_url,
        w.margin + 4,
        headerY - 51,
        42,
        42
      );
    }

    // Center Column: Centered school text details
    const centerX = w.width / 2;
    const schoolName = sanitizeText(dbSchool?.name ?? "SPOTLIGHT COMPREHENSIVE COLLEGE");
    const addressLine = sanitizeText(dbSchool?.address ?? "28, OVIAWEH STREET OFF AYEPE ROAD, SAGAMU, OGUN STATE");
    const contactLine = sanitizeText("spotlightinternationalschool@gmail.com, 07063639808, 07037819024");
    const mottoLine = sanitizeText(`MOTTO: ${dbSchool?.motto ?? "LIGHT THE WAY TO SUCCESS"}`);

    w.page.drawText(schoolName, {
      x: centerX - (w.bold.widthOfTextAtSize(schoolName, 13) / 2),
      y: headerY - 5,
      size: 13,
      font: w.bold,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });
    w.page.drawText(addressLine, {
      x: centerX - (w.font.widthOfTextAtSize(addressLine, 7.5) / 2),
      y: headerY - 17,
      size: 7.5,
      font: w.font,
      color: rgb(0.3, 0.3, 0.3),
    });
    w.page.drawText(contactLine, {
      x: centerX - (w.font.widthOfTextAtSize(contactLine, 7) / 2),
      y: headerY - 27,
      size: 7,
      font: w.font,
      color: rgb(0.4, 0.4, 0.4),
    });
    w.page.drawText(mottoLine, {
      x: centerX - (w.bold.widthOfTextAtSize(mottoLine, 8) / 2),
      y: headerY - 40,
      size: 8,
      font: w.bold,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

    // Right Column: Stylized avatar/student placeholder box
    const photoX = w.width - w.margin - 55;
    const photoWidth = 55;
    const photoHeight = 65;

    w.page.drawRectangle({
      x: photoX,
      y: headerY - photoHeight + 15,
      width: photoWidth,
      height: photoHeight,
      borderColor: thinBorderColor,
      borderWidth: 1,
    });

    if (student.passport_url) {
      await drawImageFromUrl(
        w.doc,
        w.page,
        student.passport_url,
        photoX + 1.5,
        headerY - photoHeight + 16.5,
        photoWidth - 3,
        photoHeight - 3
      );
    } else {
      // Draw minimal silhouette vector placeholder
      const avatarCenter = photoX + (photoWidth / 2);
      w.page.drawCircle({
        x: avatarCenter,
        y: headerY - 22,
        radius: 8,
        color: rgb(0.85, 0.88, 0.88),
      });
      w.page.drawRectangle({
        x: photoX + 10,
        y: headerY - 45,
        width: photoWidth - 20,
        height: 12,
        color: rgb(0.85, 0.88, 0.88),
      });
    }

    // ── 2. STUDENT INFORMATION BLOCK (Outer Box) ───────────────
    w.y = headerY - headerHeight - 10;
    const infoBoxY = w.y;
    const infoBoxHeight = 110;

    w.page.drawRectangle({
      x: w.margin,
      y: infoBoxY - infoBoxHeight,
      width: w.width - (w.margin * 2),
      height: infoBoxHeight,
      borderColor: thinBorderColor,
      borderWidth: 1,
    });

    // Box Header Label
    w.page.drawText("SECOND TERM REPORT SHEET", {
      x: centerX - (w.bold.widthOfTextAtSize("SECOND TERM REPORT SHEET", 9.5) / 2),
      y: infoBoxY - 14,
      size: 9.5,
      font: w.bold,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

    // Key-value Grid Coordinate Calculator
    const drawGridField = (lbl: string, val: string, x: number, y: number, length: number) => {
      w.page.drawText(lbl, { x, y, size: 7, font: w.bold, color: rgb(0.3, 0.3, 0.3) });
      const labelOffset = w.bold.widthOfTextAtSize(lbl, 7) + 5;
      const valText = sanitizeText(val || 'N/A');
      w.page.drawText(valText, { x: x + labelOffset, y: y, size: 7, font: w.font, color: textDarkColor });
      // Draw Underline
      w.page.drawLine({
        start: { x: x + labelOffset, y: y - 1.5 },
        end: { x: x + length, y: y - 1.5 },
        thickness: 0.5,
        color: thinBorderColor,
      });
    };

    const rowH = 15;
    const gridY = infoBoxY - 32;

    // Row 1
    drawGridField("NAME OF PUPIL:", `${student.full_name ?? ''}`, w.margin + 10, gridY, 230);
    drawGridField("CLASS:", `${student.class_name ?? ''}`, w.margin + 245, gridY, 130);
    drawGridField("NO. IN CLASS:", `${data.class_count ?? '0'}`, w.margin + 385, gridY, 100);

    // Row 2
    drawGridField("REGISTRATION NUMBER:", `${student.admission_number ?? ''}`, w.margin + 10, gridY - rowH, 230);
    drawGridField("SESSION:", `${data.academic_year ?? '2024/2025'}`, w.margin + 245, gridY - rowH, 130);
    drawGridField("TIMES SCHOOL OPENED:", "116", w.margin + 385, gridY - rowH, 100);

    // Row 3
    drawGridField("CLOSING DATE:", "18/12/2026", w.margin + 10, gridY - (rowH * 2), 230);
    drawGridField("TERM:", "SECOND TERM", w.margin + 245, gridY - (rowH * 2), 130);
    drawGridField("TIMES PRESENT:", "114", w.margin + 385, gridY - (rowH * 2), 100);

    // Row 4
    drawGridField("RESUMPTION DATE:", "11/01/2027", w.margin + 10, gridY - (rowH * 3), 230);
    drawGridField("GENDER:", `${student.gender ?? 'N/A'}`, w.margin + 245, gridY - (rowH * 3), 130);
    drawGridField("TIMES ABSENT:", "2", w.margin + 385, gridY - (rowH * 3), 100);

    // Metric Summary Sub-boxes
    const metricsY = infoBoxY - infoBoxHeight + 5;
    const metricsH = 18;
    const metricW = 90;
    const metricSpacing = (w.width - (w.margin * 2) - (metricW * 4)) / 5;

    const drawMetricBox = (title: string, val: string, index: number) => {
      const boxX = w.margin + metricSpacing + (index * (metricW + metricSpacing));
      w.page.drawRectangle({
        x: boxX,
        y: metricsY,
        width: metricW,
        height: metricsH,
        borderColor: thinBorderColor,
        borderWidth: 0.5,
      });
      const dispText = `${title}: ${sanitizeText(val)}`;
      w.page.drawText(dispText, {
        x: boxX + (metricW / 2) - (w.bold.widthOfTextAtSize(dispText, 6.5) / 2),
        y: metricsY + 5.5,
        size: 6.5,
        font: w.bold,
        color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
      });
    };

    drawMetricBox("OVERALL TOTAL", String(data.total_score ?? '0'), 0);
    drawMetricBox("AVERAGE", String(data.average ?? '0'), 1);
    drawMetricBox("PERCENTAGE", `${data.average ?? '0'}%`, 2);
    drawMetricBox("POSITION", `${data.position ?? ''}`, 3);

    // ── 3. ACADEMIC PERFORMANCE TABLE ─────────────────────────
    w.y = infoBoxY - infoBoxHeight - 12;
    const tableHeaderHeight = 15;

    w.page.drawRectangle({
      x: w.margin,
      y: w.y - tableHeaderHeight,
      width: w.width - (w.margin * 2),
      height: tableHeaderHeight,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

    const tblHeaderText = "STUDENT'S ACADEMIC PERFORMANCE (JUNIOR SECONDARY CATEGORY)";
    w.page.drawText(tblHeaderText, {
      x: centerX - (w.bold.widthOfTextAtSize(tblHeaderText, 7.5) / 2),
      y: w.y - 11,
      size: 7.5,
      font: w.bold,
      color: whiteColor,
    });

    w.y -= tableHeaderHeight;

    const colWidths = [145, 55, 55, 55, 60, 50, 75]; // Total: 495
    const colAlign: Array<'left' | 'center'> = ['left', 'center', 'center', 'center', 'center', 'center', 'center'];
    const tblHeaders = ["SUBJECT", "1ST C.A (10)", "2ND C.A (20)", "EXAM (70)", "TOTAL (100)", "GRADE", "REMARKS"];

    // Draw Table Header Columns
    let colX = w.margin;
    const tblSubHeaderH = 13;
    w.page.drawRectangle({
      x: w.margin,
      y: w.y - tblSubHeaderH,
      width: w.width - (w.margin * 2),
      height: tblSubHeaderH,
      borderColor: thinBorderColor,
      borderWidth: 0.5,
    });

    for (let c = 0; c < tblHeaders.length; c++) {
      const colTitle = tblHeaders[c];
      const textW = w.bold.widthOfTextAtSize(colTitle, 6.5);
      const textX = colAlign[c] === 'left' ? colX + 8 : colX + (colWidths[c] / 2) - (textW / 2);
      w.page.drawText(colTitle, {
        x: textX,
        y: w.y - 9,
        size: 6.5,
        font: w.bold,
        color: textDarkColor,
      });
      colX += colWidths[c];
    }
    w.y -= tblSubHeaderH;

    // Fixed subjects schema requirements
    const standardSubjects = [
      "Mathematics", "English Language", "Yoruba Language", "Social Studies", "Business Studies",
      "Home Economics", "Basic Science", "Basic Technology", "Literature in English", "Civic Education",
      "Cultural & Creative Art", "Computer Science", "C.R.S", "Agricultural Science", "History", "P.H.E"
    ];

    const rowHeight = 11.2;

    for (let s = 0; s < standardSubjects.length; s++) {
      const subName = standardSubjects[s];
      const matchingScore = subjects.find(
        (x) => String(x.name).trim().toLowerCase() === subName.toLowerCase()
      );

      // Extract details, mapping defaults safely
      const ca1 = matchingScore ? String(matchingScore.ca_score ?? '0') : '0';
      const ca2 = matchingScore ? String(matchingScore.ca2_score ?? '0') : '0';
      const exam = matchingScore ? String(matchingScore.exam_score ?? '0') : '0';
      const totalScoreVal = matchingScore ? parseFloat(String(matchingScore.total ?? '0')) : 0;
      const total = matchingScore ? String(matchingScore.total ?? '0') : '0';
      const grade = matchingScore ? String(matchingScore.grade ?? 'F') : 'F';
      
      // Determine remark based on WAEC standard or grade mapping
      const remark = matchingScore ? String(matchingScore.remark ?? 'POOR') : 'POOR';

      const rowY = w.y - rowHeight;

      // Draw row container box
      w.page.drawRectangle({
        x: w.margin,
        y: rowY,
        width: w.width - (w.margin * 2),
        height: rowHeight,
        color: s % 2 === 1 ? zebraColor : whiteColor,
        borderColor: thinBorderColor,
        borderWidth: 0.3,
      });

      const rowValues = [subName, ca1, ca2, exam, total, grade, remark];
      let rowX = w.margin;

      for (let c = 0; c < rowValues.length; c++) {
        const valText = sanitizeText(rowValues[c]);
        const textW = w.font.widthOfTextAtSize(valText, 6.5);
        const textX = colAlign[c] === 'left' ? rowX + 8 : rowX + (colWidths[c] / 2) - (textW / 2);
        w.page.drawText(valText, {
          x: textX,
          y: rowY + 3.5,
          size: 6.5,
          font: c === 0 ? w.bold : w.font,
          color: textDarkColor,
        });
        rowX += colWidths[c];
      }
      w.y -= rowHeight;
    }

    // ── 4. BOTTOM THREE-COLUMN GRID ────────────────────────────
    w.y -= 12;
    const threeColY = w.y;
    const colSpace = 9;
    const colW = (w.width - (w.margin * 2) - (colSpace * 2)) / 3;

    // --- COLUMN 1: AFFECTIVE TRAITS ---
    const drawAffectiveTraits = (x: number) => {
      const traitsHeaderH = 12;
      w.page.drawRectangle({ x, y: threeColY - traitsHeaderH, width: colW, height: traitsHeaderH, color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]) });
      w.page.drawText("AFFECTIVE TRAITS", { x: x + 6, y: threeColY - 9, size: 6.5, font: w.bold, color: whiteColor });
      w.page.drawText("RATING", { x: x + colW - 35, y: threeColY - 9, size: 6.5, font: w.bold, color: whiteColor });

      const traits = [
        "PUNCTUALITY", "MENTAL ALERTNESS", "BEHAVIOR", "RELIABILITY", "RESPECT",
        "NEATNESS", "POLITENESS", "HONESTY", "RELATION WITH STAFF", "RELATION WITH OTHERS"
      ];
      const traitRowH = 9.5;
      let currY = threeColY - traitsHeaderH;

      for (let t = 0; t < traits.length; t++) {
        currY -= traitRowH;
        w.page.drawRectangle({ x, y: currY, width: colW, height: traitRowH, borderColor: thinBorderColor, borderWidth: 0.3 });
        w.page.drawText(traits[t], { x: x + 6, y: currY + 3, size: 5.5, font: w.bold, color: textDarkColor });
        // Draw Rating Box Placeholder
        w.page.drawRectangle({ x: x + colW - 24, y: currY + 1.5, width: 14, height: 6.5, borderColor: thinBorderColor, borderWidth: 0.5 });
      }
    };

    // --- COLUMN 2: KEYS TO GRADING & RATINGS ---
    const drawKeys = (x: number) => {
      const headerH = 12;
      
      // Grading Header
      w.page.drawRectangle({ x, y: threeColY - headerH, width: colW, height: headerH, color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]) });
      w.page.drawText("KEYS TO GRADING", { x: x + 6, y: threeColY - 9, size: 6.5, font: w.bold, color: whiteColor });

      const gradingText = ["70 - 100 = A - Excellent", "60 - 69   = B - Very Good", "50 - 59   = C - Good", "40 - 49   = D - Fair", "0 - 39     = F - Poor"];
      let currY = threeColY - headerH - 4;
      for (const grad of gradingText) {
        currY -= 9;
        w.page.drawText(grad, { x: x + 6, y: currY, size: 6.5, font: w.font, color: textDarkColor });
      }

      // Rating Header
      currY -= 15;
      w.page.drawRectangle({ x, y: currY, width: colW, height: headerH, color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]) });
      w.page.drawText("KEYS TO RATING", { x: x + 6, y: currY + 3.5, size: 6.5, font: w.bold, color: whiteColor });

      const ratingText = ["5 = EXCELLENT", "4 = VERY GOOD", "3 = GOOD", "2 = POOR", "1 = VERY POOR"];
      currY -= 4;
      for (const rate of ratingText) {
        currY -= 9;
        w.page.drawText(rate, { x: x + 6, y: currY, size: 6.5, font: w.font, color: textDarkColor });
      }
    };

    // --- COLUMN 3: SCHOOL BILLS ---
    const drawSchoolBills = (x: number) => {
      const headerH = 12;
      w.page.drawRectangle({ x, y: threeColY - headerH, width: colW, height: headerH, color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]) });
      w.page.drawText("SCHOOL BILLS", { x: x + 6, y: threeColY - 9, size: 6.5, font: w.bold, color: whiteColor });

      const bills = [
        { label: "TUITION FEE:", amount: "50,000" },
        { label: "UNIFORM:", amount: "1,000" },
        { label: "BOOKS:", amount: "233" },
        { label: "LESSON FEE:", amount: "1,300" },
        { label: "DICTION/PHONICS:", amount: "4,500" },
        { label: " ", amount: " " }, // empty padding row
        { label: " ", amount: "3,500" }, // placeholder
        { label: "OUTSTANDING FEE:", amount: "5,000" },
        { label: "TOTAL:", amount: "65,533", bold: true }
      ];

      const billRowH = 10.5;
      let currY = threeColY - headerH;

      for (const bill of bills) {
        currY -= billRowH;
        w.page.drawRectangle({ x, y: currY, width: colW, height: billRowH, borderColor: thinBorderColor, borderWidth: 0.3 });
        
        const fontType = bill.bold ? w.bold : w.font;
        w.page.drawText(bill.label, { x: x + 5, y: currY + 3, size: 6, font: fontType, color: textDarkColor });
        if (bill.amount.trim() !== "") {
          const formattedAmt = `N ${bill.amount}`;
          const textW = fontType.widthOfTextAtSize(formattedAmt, 6);
          w.page.drawText(formattedAmt, { x: x + colW - textW - 5, y: currY + 3, size: 6, font: fontType, color: textDarkColor });
        }
      }
    };

    drawAffectiveTraits(w.margin);
    drawKeys(w.margin + colW + colSpace);
    drawSchoolBills(w.margin + (colW * 2) + (colSpace * 2));

    // ── 5. FOOTER SECTION ──────────────────────────────────────
    w.y = threeColY - 110 - 20; // safe coordinate calculation
    const footerY = w.y;
    const footerHeight = 65;

    // Draw bottom dark teal border stripe
    w.page.drawRectangle({
      x: w.margin,
      y: w.margin - 10,
      width: w.width - (w.margin * 2),
      height: 4,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

    // Left Side: Three stacked comments lines with bordered box look
    const drawCommentLine = (lbl: string, y: number) => {
      w.page.drawText(lbl, { x: w.margin, y, size: 6.5, font: w.bold, color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]) });
      const labelW = w.bold.widthOfTextAtSize(lbl, 6.5);
      w.page.drawRectangle({
        x: w.margin + labelW + 8,
        y: y - 3,
        width: w.width - (w.margin * 2) - labelW - 145, // leave space for right column
        height: 11,
        borderColor: thinBorderColor,
        borderWidth: 0.5,
      });
    };

    drawCommentLine("TEACHER'S COMMENT:", footerY - 10);
    drawCommentLine("PRINCIPAL'S COMMENT:", footerY - 26);
    drawCommentLine("PROPRIETOR'S COMMENT:", footerY - 42);

    // Right Side: Rectangular Stamp & Signature box
    const sigX = w.width - w.margin - 120;
    const sigW = 120;
    const sigH = 50;

    w.page.drawRectangle({
      x: sigX,
      y: footerY - sigH,
      width: sigW,
      height: sigH,
      borderColor: thinBorderColor,
      borderWidth: 1,
    });
    w.page.drawText("SIGNATURE & STAMP", {
      x: sigX + (sigW / 2) - (w.bold.widthOfTextAtSize("SIGNATURE & STAMP", 6.5) / 2),
      y: footerY - sigH + 5,
      size: 6.5,
      font: w.bold,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

    // Embed Dynamic Principal Signature & Stamps inside the box if present
    if (dbSchool?.principal_signature_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.principal_signature_url, sigX + 10, footerY - sigH + 15, 100, 30);
    }
    if (dbSchool?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.stamp_url, sigX + sigW - 55, footerY - sigH + 8, 45, 45, 0.7);
    }

    // Generate output
    const bytes = await w.bytes();
    const adm = (student.admission_number ?? 'student').replace(/[^A-Za-z0-9]/g, '');

    return uploadPdf(bytes, `results/result-${adm}.pdf`);
  }
}
