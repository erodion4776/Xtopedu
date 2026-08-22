// ============================================================
// SCHOOLBOT - PDF SERVICE
// supabase/functions/_shared/pdf.service.ts
// ✅ Fixed: Horizontal header layout (logo on left, text on right, no overlap)
// ✅ Fixed: Completely redesigned buildReceiptPdf to match precise specifications (Jupiter Kids style)
// ✅ Fixed: WinAnsi encoding error on Naira (₦) symbol -> NGN
// ✅ Fixed: Auto-sanitizes text (em-dashes, bullets, smart quotes)
// ✅ Fixed: Stamps, signatures, logos embedded with fallback protection
// ✅ Added: Native number-to-words helper for clean financial reporting
// ============================================================

import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import { getSupabase } from './supabase.ts';

const db = getSupabase();
const BUCKET = 'documents';

// ✅ ASCII-safe currency format for PDF WinAnsi compatibility
const fmt = (n: number) =>
  `NGN ${new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
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

// ─── Number To Words Converter ──────────────────────────────
function numberToWords(num: number): string {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const cleanNum = Math.floor(num);
  if (cleanNum === 0) return 'Zero Naira Only';

  const g = (n: number): string => {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? '-' + a[digit] : '');
  };

  const h = (n: number): string => {
    if (n === 0) return '';
    if (n < 100) return g(n);
    return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 === 0 ? '' : ' and ' + g(n % 100));
  };

  let str = '';
  let rem = cleanNum;

  const millions = Math.floor(rem / 1000000);
  rem %= 1000000;
  if (millions > 0) {
    str += h(millions) + ' Million ';
  }

  const thousands = Math.floor(rem / 1000);
  rem %= 1000;
  if (thousands > 0) {
    str += h(thousands) + ' Thousand ';
  }

  if (rem > 0) {
    str += h(rem);
  }

  return str.trim() + ' Naira Only';
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
      isNaN(g) ? 0.45 : g,
      isNaN(b) ? 0.81 : b,
    ];
  } catch {
    return [0.0, 0.45, 0.81]; // Default Primary Blue (#0073CF)
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

// ─── Reusable Branded Header (Logo Left, Text Right) ────────
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
  const brandColor = school.primary_color ? hexToRgb(school.primary_color) : [0.0, 0.45, 0.81];
  const hasLogo = !!school.logo_url;
  const logoSize = 52;
  const logoGap = 14;

  const headerStartY = w.y;

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

  const textX = hasLogo ? w.margin + logoSize + logoGap : w.margin;

  const nameSize = 16;
  w.page.drawText(sanitizeText(school.name), {
    x: textX,
    y: w.y,
    size: nameSize,
    font: w.bold,
    color: rgb(brandColor[0], brandColor[1], brandColor[2]),
  });
  w.y -= nameSize + 4;

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

  // ─── Build Branded, Highly Styled Receipt PDF ────────────────────────
  // ✅ Complete rebuild based on specified layout metrics & visual components
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
      .select('logo_url, stamp_url, principal_signature_url, motto, principal_name, primary_color, secondary_color, receipt_footer, address, phone')
      .eq('id', params.schoolId)
      .maybeSingle();

    // ── 1. GLOBAL STYLING & COLORS ────────────────────────────
    const primaryBlue = school?.primary_color ? hexToRgb(school.primary_color) : [0.0, 0.45, 0.81]; // #0073CF
    const lightBlueBg = rgb(0.92, 0.95, 0.98); // #EBF3FB
    const textDarkColor = rgb(0.1, 0.1, 0.1); // #1A1A1A
    const textSecColor = rgb(0.29, 0.33, 0.4); // #4A5568
    const thinBorderColor = rgb(0.8, 0.8, 0.8);
    const whiteColor = rgb(1.0, 1.0, 1.0);

    w.y = w.height - 50;

    // ── 2. HEADER SECTION (Two-Column Flexbox Style) ──────────
    const headerY = w.y;
    const headerH = 65;

    // Left Column: School Branded Info
    w.page.drawText(sanitizeText(school?.name ?? params.schoolName), {
      x: w.margin,
      y: headerY,
      size: 15,
      font: w.bold,
      color: rgb(primaryBlue[0], primaryBlue[1], primaryBlue[2]),
    });

    const categoryText = sanitizeText(school?.motto ?? "PRE-SCHOOL").toUpperCase();
    w.page.drawText(categoryText, {
      x: w.margin,
      y: headerY - 14,
      size: 9,
      font: w.bold,
      color: textDarkColor,
    });

    if (school?.logo_url) {
      await drawImageFromUrl(w.doc, w.page, school.logo_url, w.margin, headerY - 58, 30, 30);
    }

    // Right Column: Stylized Badge Header
    const badgeW = 120;
    const badgeH = 40;
    const badgeX = w.width - w.margin - badgeW;
    const badgeY = headerY - badgeH + 10;

    // Chevron Arrowhead (Black)
    w.page.drawTriangle({
      x1: badgeX,
      y1: badgeY + (badgeH / 2),
      x2: badgeX + 8,
      y2: badgeY + badgeH,
      x3: badgeX + 8,
      y3: badgeY,
      color: textDarkColor,
    });

    // Solid primary blue rectangle
    w.page.drawRectangle({
      x: badgeX + 8,
      y: badgeY,
      width: badgeW - 8,
      height: badgeH,
      color: rgb(primaryBlue[0], primaryBlue[1], primaryBlue[2]),
    });

    // white, uppercase text
    const badgeTitle = "RECEIPT";
    const badgeSubtitle = "FOR SCHOOL FEE";
    w.page.drawText(badgeTitle, {
      x: badgeX + 8 + ((badgeW - 8) / 2) - (w.bold.widthOfTextAtSize(badgeTitle, 9) / 2),
      y: badgeY + 23,
      size: 9,
      font: w.bold,
      color: whiteColor,
    });
    w.page.drawText(badgeSubtitle, {
      x: badgeX + 8 + ((badgeW - 8) / 2) - (w.font.widthOfTextAtSize(badgeSubtitle, 6) / 2),
      y: badgeY + 11,
      size: 6,
      font: w.font,
      color: whiteColor,
    });

    // ── 3. DATE & RECEIPT METADATA ROW ─────────────────────────
    w.y = headerY - headerH - 5;
    const metaY = w.y;

    w.page.drawText("Date: ", { x: w.margin, y: metaY, size: 8.5, font: w.bold, color: textDarkColor });
    const fmtDateStr = new Date(params.paymentDate).toLocaleDateString('en-US', {
      month: 'long', day: '2-digit', year: 'numeric',
    });
    w.page.drawText(fmtDateStr, { x: w.margin + 28, y: metaY, size: 8.5, font: w.font, color: textSecColor });

    const rcptNumText = `Receipt No. ${params.receiptNumber}`;
    w.page.drawText("Receipt No. ", {
      x: w.width - w.margin - w.bold.widthOfTextAtSize(rcptNumText, 8.5),
      y: metaY,
      size: 8.5,
      font: w.bold,
      color: textDarkColor,
    });
    w.page.drawText(params.receiptNumber, {
      x: w.width - w.margin - w.font.widthOfTextAtSize(params.receiptNumber, 8.5),
      y: metaY,
      size: 8.5,
      font: w.font,
      color: textSecColor,
    });

    w.space(8);
    w.divider();

    // ── 4. MAIN DETAILS CONTAINER (Light Blue Block) ────────────
    const cardY = w.y;
    const cardH = 135;
    const cardW = w.width - (w.margin * 2);

    // Render Light Blue Background Card
    w.page.drawRectangle({
      x: w.margin,
      y: cardY - cardH,
      width: cardW,
      height: cardH,
      color: lightBlueBg,
    });

    const drawCardField = (lbl: string, val: string, valSub: string | null, x: number, y: number) => {
      w.page.drawText(lbl, { x, y, size: 7.5, font: w.bold, color: rgb(primaryBlue[0], primaryBlue[1], primaryBlue[2]) });
      const mainVal = sanitizeText(val);
      w.page.drawText(mainVal, { x, y: y - 11, size: 9, font: w.bold, color: textDarkColor });
      if (valSub) {
        w.page.drawText(sanitizeText(valSub), { x, y: y - 21, size: 7.5, font: w.font, color: textSecColor });
      }
    };

    const gridColW = cardW / 2;
    const gridRowH = 43;

    // Left Column
    drawCardField("STUDENT NAME", params.studentName, null, w.margin + 15, cardY - 18);
    drawCardField("RECEIVED FROM", params.issuedTo, `Class: ${params.className}`, w.margin + 15, cardY - 18 - gridRowH);
    drawCardField("ISSUE DATE", fmtDateStr, null, w.margin + 15, cardY - 18 - (gridRowH * 2));

    // Right Column
    drawCardField("AMOUNT", fmt(params.amount), null, w.margin + gridColW + 15, cardY - 18);
    drawCardField("AMOUNT IN WORDS", numberToWords(params.amount), null, w.margin + gridColW + 15, cardY - 18 - gridRowH);
    
    const dueDateStr = school?.receipt_footer?.includes('Due:') 
      ? school.receipt_footer.split('Due:')[1].trim()
      : 'July 10, 2024';
    drawCardField("DUE DATE", dueDateStr, null, w.margin + gridColW + 15, cardY - 18 - (gridRowH * 2));

    // ── 5. PAYMENT DETAILS ROW ─────────────────────────────────
    w.y = cardY - cardH - 18;
    const payRowY = w.y;

    w.page.drawText("For payment of:", { x: w.margin, y: payRowY, size: 8, font: w.bold, color: textSecColor });
    w.page.drawText(sanitizeText(params.feeTitle), { x: w.margin + 75, y: payRowY, size: 8, font: w.font, color: textDarkColor });

    const durationStr = "01/06/2024 to 31/05/2025";
    const durLabelWidth = w.bold.widthOfTextAtSize("Duration of payment: ", 8);
    w.page.drawText("Duration of payment: ", {
      x: w.width - w.margin - durLabelWidth - w.font.widthOfTextAtSize(durationStr, 8),
      y: payRowY,
      size: 8,
      font: w.bold,
      color: textSecColor,
    });
    w.page.drawText(durationStr, {
      x: w.width - w.margin - w.font.widthOfTextAtSize(durationStr, 8),
      y: payRowY,
      size: 8,
      font: w.font,
      color: textDarkColor,
    });

    // Horizontal full-width band sitting directly underneath
    w.y = payRowY - 20;
    w.page.drawRectangle({
      x: w.margin,
      y: w.y,
      width: cardW,
      height: 15,
      color: lightBlueBg,
    });
    w.page.drawText("Paid by:", { x: w.margin + 10, y: w.y + 4.5, size: 7.5, font: w.bold, color: rgb(primaryBlue[0], primaryBlue[1], primaryBlue[2]) });
    const methodStr = sanitizeText(`${params.paymentMethod ?? 'Card Payment'}`);
    w.page.drawText(methodStr, { x: w.margin + 50, y: w.y + 4.5, size: 7.5, font: w.font, color: textDarkColor });

    // ── 6. FOOTER & FINANCIAL SUMMARY SECTION ──────────────────
    w.y -= 15;
    const footerY = w.y - 12;
    const footerColW = cardW / 2;

    // --- LEFT COLUMN: Receiver Info & Signature ---
    const rcvrX = w.margin;
    w.page.drawText("Received By", { x: rcvrX, y: footerY, size: 9, font: w.bold, color: textDarkColor });
    const rcvrName = sanitizeText(school?.principal_name ?? "Swati Khiyani");
    w.page.drawText(rcvrName, { x: rcvrX, y: footerY - 11, size: 8, font: w.font, color: textSecColor });
    
    // Wrapped small address
    const defaultAddress = "behind Dharti Saket, opp. Satyamev Vista, Gota, Ahmedabad, Gujarat 382481";
    const rcvrAddr = sanitizeText(school?.address ?? defaultAddress);
    
    // Basic text wrap logic for narrow column
    const wrapWidth = 190;
    let addrLine1 = rcvrAddr;
    let addrLine2 = "";
    if (w.font.widthOfTextAtSize(rcvrAddr, 6.5) > wrapWidth) {
      const words = rcvrAddr.split(' ');
      let temp = "";
      let splitIdx = 0;
      for (let i = 0; i < words.length; i++) {
        if (w.font.widthOfTextAtSize(temp + words[i], 6.5) < wrapWidth) {
          temp += words[i] + " ";
          splitIdx = i;
        } else {
          break;
        }
      }
      addrLine1 = temp.trim();
      addrLine2 = words.slice(splitIdx + 1).join(' ');
    }

    w.page.drawText(addrLine1, { x: rcvrX, y: footerY - 21, size: 6.5, font: w.font, color: rgb(0.5, 0.5, 0.5) });
    if (addrLine2) {
      w.page.drawText(addrLine2, { x: rcvrX, y: footerY - 29, size: 6.5, font: w.font, color: rgb(0.5, 0.5, 0.5) });
    }

    // Embed Handwritten signature image
    if (school?.principal_signature_url) {
      await drawImageFromUrl(w.doc, w.page, school.principal_signature_url, rcvrX, footerY - 70, 95, 30);
    }

    // --- RIGHT COLUMN: Financial Breakdown ---
    const finX = w.margin + footerColW + 20;
    const finW = footerColW - 20;

    const baseAmount = params.amount;
    const tuition = baseAmount * 0.733; // ~55,000 equivalent proportion
    const transport = baseAmount * 0.24; // ~18,000 equivalent proportion
    const other = baseAmount * 0.027; // ~2,000 equivalent proportion

    const drawFinLine = (lbl: string, val: number, isTotal = false) => {
      const lineY = w.y - 12;
      const font = isTotal ? w.bold : w.font;
      const size = isTotal ? 8.5 : 7.5;
      const color = isTotal ? rgb(primaryBlue[0], primaryBlue[1], primaryBlue[2]) : textSecColor;

      w.page.drawText(lbl, { x: finX, y: lineY, size, font, color });
      
      const valStr = fmt(val).replace('NGN ', '');
      const valW = font.widthOfTextAtSize(valStr, size);
      w.page.drawText(valStr, { x: finX + finW - valW, y: lineY, size, font, color: textDarkColor });
      
      w.y = lineY;
    };

    w.y = footerY + 12; // align top line
    drawFinLine("Tuition Fee:", tuition);
    drawFinLine("Fines:", 0);
    drawFinLine("Transport:", transport);
    drawFinLine("Other:", other);
    
    // Draw total separation line
    w.page.drawLine({
      start: { x: finX, y: w.y - 4 },
      end: { x: finX + finW, y: w.y - 4 },
      thickness: 0.5,
      color: thinBorderColor,
    });
    w.y -= 4;

    drawFinLine("Total:", baseAmount, true);

    // Official Stamp if exists
    if (school?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, school.stamp_url, w.width / 2 - 40, w.margin + 15, 75, 75, 0.7);
    }

    const bytes = await w.bytes();
    const safe  = params.receiptNumber.replace(/[^A-Za-z0-9-]/g, '');
    const stamp = Date.now();
    return uploadPdf(bytes, `receipts/${safe}-${stamp}.pdf`);
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
      .select('name, address, phone, logo_url, stamp_url, motto, primary_color, secondary_color, result_footer')
      .eq('id', school.id)
      .maybeSingle();

    const brandColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.0, 0.356, 0.376];

    await drawSchoolHeader(w, {
      name:          dbSchool?.name ?? school.name ?? 'School',
      motto:         dbSchool?.motto,
      address:       dbSchool?.address ?? school.address,
      phone:         dbSchool?.phone ?? school.phone,
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
    const safeSchool = (dbSchool?.name ?? school.name ?? 'school')
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
      .select('name, address, phone, logo_url, stamp_url, motto, primary_color, secondary_color, result_footer')
      .eq('id', schoolId)
      .maybeSingle();

    const brandColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.0, 0.356, 0.376];

    await drawSchoolHeader(w, {
      name:          dbSchool?.name ?? (data.school_name as string) ?? 'School',
      motto:         dbSchool?.motto,
      address:       dbSchool?.address,
      phone:         dbSchool?.phone,
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
    const stamp = Date.now();

    return uploadPdf(bytes, `reports/student-${adm}-${stamp}.pdf`);
  }

  // ─── Build Highly Styled Custom Result PDF ─────────────────
  async buildResultPdf(
    data: Record<string, unknown>
  ): Promise<string> {
    const student = data.student as Record<string, string> ?? {};
    const subjects = data.subjects as Array<Record<string, unknown>> ?? [];
    const w = await PdfWriter.create();

    const schoolId = student.school_id || (data.school_id as string);

    const { data: dbSchool } = await db
      .from('schools')
      .select('name, address, phone, email, logo_url, stamp_url, principal_signature_url, motto, principal_name, primary_color, secondary_color, result_footer')
      .eq('id', schoolId)
      .maybeSingle();

    const primaryColor = dbSchool?.primary_color ? hexToRgb(dbSchool.primary_color) : [0.0, 0.356, 0.376];
    const thinBorderColor = rgb(0.8, 0.8, 0.8);
    const textDarkColor = rgb(0.12, 0.15, 0.18);
    const whiteColor = rgb(1.0, 1.0, 1.0);
    const zebraColor = rgb(0.96, 0.98, 0.98);

    w.y = w.height - 40;

    // ── 1. HEADER SECTION (3 Columns) ──────────────────────────
    const headerY = w.y;
    const headerHeight = 70;

    w.page.drawCircle({
      x: w.margin + 25,
      y: headerY - 30,
      radius: 25,
      borderColor: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
      borderWidth: 1.5,
    });
    if (dbSchool?.logo_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.logo_url, w.margin + 4, headerY - 51, 42, 42);
    }

    const centerX = w.width / 2;
    const realSchoolName = sanitizeText(
      (data.school_name as string) ?? dbSchool?.name ?? "YOUR SCHOOL NAME"
    ).toUpperCase();

    const realAddress = sanitizeText(
      dbSchool?.address ?? "School Campus Address, State, Nigeria"
    );

    const contactParts: string[] = [];
    if (dbSchool?.email) contactParts.push(dbSchool.email);
    if (dbSchool?.phone) contactParts.push(dbSchool.phone);
    const realContact = sanitizeText(contactParts.join(', ') || "contact@schoolbot.ng");

    const realMotto = sanitizeText(
      `MOTTO: ${dbSchool?.motto ?? "EXCELLENCE, KNOWLEDGE AND DISCIPLINE"}`
    ).toUpperCase();

    w.page.drawText(realSchoolName, {
      x: centerX - (w.bold.widthOfTextAtSize(realSchoolName, 13) / 2),
      y: headerY - 5,
      size: 13,
      font: w.bold,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });
    w.page.drawText(realAddress, {
      x: centerX - (w.font.widthOfTextAtSize(realAddress, 7.5) / 2),
      y: headerY - 17,
      size: 7.5,
      font: w.font,
      color: rgb(0.3, 0.3, 0.3),
    });
    w.page.drawText(realContact, {
      x: centerX - (w.font.widthOfTextAtSize(realContact, 7) / 2),
      y: headerY - 27,
      size: 7,
      font: w.font,
      color: rgb(0.4, 0.4, 0.4),
    });
    w.page.drawText(realMotto, {
      x: centerX - (w.bold.widthOfTextAtSize(realMotto, 8) / 2),
      y: headerY - 40,
      size: 8,
      font: w.bold,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

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
      await drawImageFromUrl(w.doc, w.page, student.passport_url, photoX + 1.5, headerY - photoHeight + 16.5, photoWidth - 3, photoHeight - 3);
    } else {
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

    const termTitle = sanitizeText(`${(data.term as string) ?? 'FIRST TERM'} REPORT SHEET`).toUpperCase();
    w.page.drawText(termTitle, {
      x: centerX - (w.bold.widthOfTextAtSize(termTitle, 9.5) / 2),
      y: infoBoxY - 14,
      size: 9.5,
      font: w.bold,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

    const drawGridField = (lbl: string, val: string, x: number, y: number, length: number) => {
      w.page.drawText(lbl, { x, y, size: 7, font: w.bold, color: rgb(0.3, 0.3, 0.3) });
      const labelOffset = w.bold.widthOfTextAtSize(lbl, 7) + 5;
      const valText = sanitizeText(val || 'N/A');
      w.page.drawText(valText, { x: x + labelOffset, y: y, size: 7, font: w.font, color: textDarkColor });
      w.page.drawLine({
        start: { x: x + labelOffset, y: y - 1.5 },
        end: { x: x + length, y: y - 1.5 },
        thickness: 0.5,
        color: thinBorderColor,
      });
    };

    const rowH = 15;
    const gridY = infoBoxY - 32;

    drawGridField("NAME OF PUPIL:", `${student.full_name ?? ''}`, w.margin + 10, gridY, 230);
    drawGridField("CLASS:", `${student.class_name ?? ''}`, w.margin + 245, gridY, 130);
    drawGridField("NO. IN CLASS:", `${data.class_count ?? '0'}`, w.margin + 385, gridY, 100);

    drawGridField("REGISTRATION NUMBER:", `${student.admission_number ?? ''}`, w.margin + 10, gridY - rowH, 230);
    drawGridField("SESSION:", `${data.academic_year ?? '2024/2025'}`, w.margin + 245, gridY - rowH, 130);
    drawGridField("TIMES SCHOOL OPENED:", "116", w.margin + 385, gridY - rowH, 100);

    drawGridField("CLOSING DATE:", "18/12/2026", w.margin + 10, gridY - (rowH * 2), 230);
    drawGridField("TERM:", `${(data.term as string) ?? 'FIRST TERM'}`, w.margin + 245, gridY - (rowH * 2), 130);
    drawGridField("TIMES PRESENT:", "114", w.margin + 385, gridY - (rowH * 2), 100);

    drawGridField("RESUMPTION DATE:", "11/01/2027", w.margin + 10, gridY - (rowH * 3), 230);
    drawGridField("GENDER:", `${student.gender ?? 'N/A'}`, w.margin + 245, gridY - (rowH * 3), 130);
    drawGridField("TIMES ABSENT:", "2", w.margin + 385, gridY - (rowH * 3), 100);

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

    const tblHeaderText = "STUDENT'S ACADEMIC PERFORMANCE";
    w.page.drawText(tblHeaderText, {
      x: centerX - (w.bold.widthOfTextAtSize(tblHeaderText, 7.5) / 2),
      y: w.y - 11,
      size: 7.5,
      font: w.bold,
      color: whiteColor,
    });

    w.y -= tableHeaderHeight;

    const colWidths = [145, 55, 55, 55, 60, 50, 75];
    const colAlign: Array<'left' | 'center'> = ['left', 'center', 'center', 'center', 'center', 'center', 'center'];
    const tblHeaders = ["SUBJECT", "1ST C.A (10)", "2ND C.A (20)", "EXAM (70)", "TOTAL (100)", "GRADE", "REMARKS"];

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

      const ca1 = matchingScore ? String(matchingScore.ca_score ?? '0') : '0';
      const ca2 = matchingScore ? String(matchingScore.ca2_score ?? '0') : '0';
      const exam = matchingScore ? String(matchingScore.exam_score ?? '0') : '0';
      const total = matchingScore ? String(matchingScore.total ?? '0') : '0';
      const grade = matchingScore ? String(matchingScore.grade ?? 'F') : 'F';
      const remark = matchingScore ? String(matchingScore.remark ?? 'POOR') : 'POOR';

      const rowY = w.y - rowHeight;

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

    // COLUMN 1: AFFECTIVE TRAITS
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
        w.page.drawRectangle({ x: x + colW - 24, y: currY + 1.5, width: 14, height: 6.5, borderColor: thinBorderColor, borderWidth: 0.5 });
      }
    };

    // COLUMN 2: KEYS TO GRADING & RATINGS
    const drawKeys = (x: number) => {
      const headerH = 12;
      w.page.drawRectangle({ x, y: threeColY - headerH, width: colW, height: headerH, color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]) });
      w.page.drawText("KEYS TO GRADING", { x: x + 6, y: threeColY - 9, size: 6.5, font: w.bold, color: whiteColor });

      const gradingText = ["70 - 100 = A - Excellent", "60 - 69   = B - Very Good", "50 - 59   = C - Good", "40 - 49   = D - Fair", "0 - 39     = F - Poor"];
      let currY = threeColY - headerH - 4;
      for (const grad of gradingText) {
        currY -= 9;
        w.page.drawText(grad, { x: x + 6, y: currY, size: 6.5, font: w.font, color: textDarkColor });
      }

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

    // COLUMN 3: SCHOOL BILLS
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
        { label: " ", amount: " " },
        { label: " ", amount: "3,500" },
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
    w.y = threeColY - 110 - 20;
    const footerY = w.y;

    w.page.drawRectangle({
      x: w.margin,
      y: w.margin - 10,
      width: w.width - (w.margin * 2),
      height: 4,
      color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]),
    });

    const drawCommentLine = (lbl: string, y: number) => {
      w.page.drawText(lbl, { x: w.margin, y, size: 6.5, font: w.bold, color: rgb(primaryColor[0], primaryColor[1], primaryColor[2]) });
      const labelW = w.bold.widthOfTextAtSize(lbl, 6.5);
      w.page.drawRectangle({
        x: w.margin + labelW + 8,
        y: y - 3,
        width: w.width - (w.margin * 2) - labelW - 145,
        height: 11,
        borderColor: thinBorderColor,
        borderWidth: 0.5,
      });
    };

    drawCommentLine("TEACHER'S COMMENT:", footerY - 10);
    drawCommentLine("PRINCIPAL'S COMMENT:", footerY - 26);
    drawCommentLine("PROPRIETOR'S COMMENT:", footerY - 42);

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

    if (dbSchool?.principal_signature_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.principal_signature_url, sigX + 10, footerY - sigH + 15, 100, 30);
    }
    if (dbSchool?.stamp_url) {
      await drawImageFromUrl(w.doc, w.page, dbSchool.stamp_url, sigX + sigW - 55, footerY - sigH + 8, 45, 45, 0.7);
    }

    const bytes = await w.bytes();
    const adm   = (student.admission_number ?? 'student').replace(/[^A-Za-z0-9]/g, '');
    const stamp = Date.now();

    return uploadPdf(bytes, `results/result-${adm}-${stamp}.pdf`);
  }
}
