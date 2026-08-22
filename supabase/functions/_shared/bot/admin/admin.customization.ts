// ============================================================
// SCHOOLBOT - SCHOOL CUSTOMIZATION FLOW
// _shared/bot/admin/admin.customization.ts
// ✅ Live sample preview generator with REAL school branding
// ============================================================

import { WhatsApp }       from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AdminService }   from '../../services/admin.service.ts';
import { getSupabase }    from '../../supabase.ts';
import { PdfService }     from '../../pdf.service.ts';
import { delay }          from '../../utils.ts';
import type {
  BotSession,
  IncomingMessage,
} from '../../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();
const pdfSvc   = new PdfService();
const db       = getSupabase();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style:    'currency',
    currency: 'NGN',
  }).format(n);

// ============================================================
// START CUSTOMIZATION MENU
// ============================================================

export async function startCustomization(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    `🎨 School Customization`,
    `Personalize your school's branding\n` +
    `on all documents:\n\n` +
    `📄 Reports & report cards\n` +
    `🧾 Payment receipts\n` +
    `🎓 Result sheets\n` +
    `📋 Letterheads`,
    `Upload once — used everywhere`,
    `🎨 Customize`,
    [
      {
        title: 'Branding',
        rows: [
          {
            id:          'CUSTOM_LOGO',
            title:       '🏫 School Logo',
            description: 'Upload school logo/crest',
          },
          {
            id:          'CUSTOM_STAMP',
            title:       '📮 Official Stamp',
            description: 'Upload school stamp/seal',
          },
          {
            id:          'CUSTOM_SIGNATURE',
            title:       '✍️ Principal Signature',
            description: 'Upload signature image',
          },
        ],
      },
      {
        title: 'School Info',
        rows: [
          {
            id:          'CUSTOM_MOTTO',
            title:       '📝 School Motto',
            description: 'Set your school motto',
          },
          {
            id:          'CUSTOM_PRINCIPAL',
            title:       '👤 Principal Name',
            description: 'Set principal/head name',
          },
          {
            id:          'CUSTOM_FOOTER',
            title:       '📄 Document Footer',
            description: 'Custom text on receipts/reports',
          },
        ],
      },
      {
        title: 'Advanced & Previews',
        rows: [
          {
            id:          'CUSTOM_GRADE_SCALE',
            title:       '🎓 Grade Scale',
            description: 'Set A/B/C/D grade cutoffs',
          },
          {
            id:          'CUSTOM_STUDENT_PHOTO',
            title:       '📸 Student Passports',
            description: 'Upload student photos',
          },
          {
            id:          'CUSTOM_PREVIEW_DOCS',
            title:       '📄 Preview Documents',
            description: 'See sample branded Receipt & Result',
          },
          {
            id:          'CUSTOM_VIEW_CURRENT',
            title:       '👀 View Setup Summary',
            description: 'See what is currently active',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'ADMIN_CUSTOMIZATION_MENU');
}

export async function handleCustomizationMenu(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  switch (input) {
    case 'custom_logo':
      await promptImageUpload(phone, 'logo', wa);
      break;
    case 'custom_stamp':
      await promptImageUpload(phone, 'stamp', wa);
      break;
    case 'custom_signature':
      await promptImageUpload(phone, 'signature', wa);
      break;
    case 'custom_motto':
      await promptTextInput(
        phone, 'motto', wa,
        `📝 *School Motto*\n\nEnter your school's motto:\n\n_Examples:_\n• Knowledge is Power\n• Discipline & Excellence\n\nType your motto or *0* to cancel.`
      );
      break;
    case 'custom_principal':
      await promptTextInput(
        phone, 'principal_name', wa,
        `👤 *Principal Name*\n\nEnter full name:\n_Example: Mr. Adekunle Bello_\n\nType name or *0* to cancel.`
      );
      break;
    case 'custom_footer':
      await promptTextInput(
        phone, 'receipt_footer', wa,
        `📄 *Document Footer*\n\nText that appears at the bottom of receipts and reports.\n\nType footer or *0* to cancel.`
      );
      break;
    case 'custom_grade_scale':
      await showGradeScaleMenu(phone, session, wa);
      break;
    case 'custom_student_photo':
      await startStudentPassportUpload(phone, session, wa);
      break;
    case 'custom_preview_docs':
      await showPreviewOptions(phone, session, wa);
      break;
    case 'custom_view_current':
      await showCurrentBranding(phone, session, wa);
      break;
    default:
      await startCustomization(phone, session, wa);
  }
}

async function promptImageUpload(
  phone:    string,
  category: 'logo' | 'stamp' | 'signature',
  wa:       WhatsApp
): Promise<void> {
  const labels: Record<string, { title: string; icon: string; tips: string }> = {
    logo: {
      title: 'School Logo / Crest', icon: '🏫',
      tips: '• Square or rectangular\n• Clear background\n• Under 5MB',
    },
    stamp: {
      title: 'Official School Stamp', icon: '📮',
      tips: '• Round or square stamp\n• Transparent background preferred',
    },
    signature: {
      title: 'Principal Signature', icon: '✍️',
      tips: '• Scan or photo of signature\n• White background',
    },
  };

  const info = labels[category];

  await wa.text(
    phone,
    `${info.icon} *Upload ${info.title}*\n\nSend the image as a photo or document.\n\n*Tips:*\n${info.tips}\n\n_Waiting for your image..._`
  );

  await sessions.setState(phone, 'ADMIN_AWAITING_IMAGE', null, {
    data: { imageCategory: category },
  });
}

export async function handleImageUpload(
  phone:      string,
  session:    BotSession,
  message:    IncomingMessage,
  downloadWa: WhatsApp,
  replyWa?:   WhatsApp
): Promise<void> {
  const sendWa = replyWa ?? downloadWa;
  const category = (session.data?.imageCategory as string) ?? 'logo';
  const mediaId = message.image?.id ?? message.document?.id;

  if (!mediaId) {
    await sendWa.text(phone, `❌ No image found. Please send an image.`);
    return;
  }

  await sendWa.text(phone, `⏳ *Uploading your image...*`);

  try {
    const imageBuffer = await downloadWa.downloadMediaBinary(mediaId);

    if (!imageBuffer) {
      await sendWa.text(phone, `❌ Could not download image. Please try again.`);
      return;
    }

    const mimeType = message.image?.mime_type ?? message.document?.mime_type ?? 'image/png';
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.includes('png') ? 'png' : 'png';
    const fileName = `${session.school_id}/${category}.${ext}`;

    const { error: uploadErr } = await db.storage
      .from('school-branding')
      .upload(fileName, imageBuffer, { contentType: mimeType, upsert: true });

    if (uploadErr) {
      await sendWa.text(phone, `❌ Failed to upload image: ${uploadErr.message}`);
      return;
    }

    const { data: urlData } = db.storage.from('school-branding').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    const columnMap: Record<string, string> = {
      logo: 'logo_url', stamp: 'stamp_url', signature: 'principal_signature_url',
    };

    await db.from('schools').update({ [columnMap[category]]: publicUrl, updated_at: new Date().toISOString() }).eq('id', session.school_id);
    await adminSvc.logAction(session.school_id, session.school_user_id ?? '', 'upload_branding_image', { category, file_name: fileName });

    await sendWa.buttons(
      phone,
      `✅ *${category === 'logo' ? 'Logo' : category === 'stamp' ? 'Stamp' : 'Signature'} Uploaded!*\n\nSaved and applied to all official documents.`,
      [
        { id: 'ADMIN_CUSTOMIZATION', title: '🎨 Upload More' },
        { id: 'CUSTOM_PREVIEW_DOCS', title: '📄 Preview Docs' },
        { id: 'MAIN_MENU',           title: '🏠 Menu' },
      ]
    );

    await sessions.setState(phone, 'ADMIN_CUSTOMIZATION_MENU');
  } catch (err) {
    console.error('[Customization] Image error:', err);
    await sendWa.text(phone, `❌ Error uploading image: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function promptTextInput(phone: string, field: string, wa: WhatsApp, prompt: string): Promise<void> {
  await wa.text(phone, prompt);
  await sessions.setState(phone, 'ADMIN_AWAITING_TEXT_INPUT', null, { data: { textField: field } });
}

export async function handleTextInput(phone: string, session: BotSession, rawText: string, wa: WhatsApp): Promise<void> {
  const text  = rawText.trim();
  const field = (session.data?.textField as string) ?? '';

  if (text === '0') {
    await startCustomization(phone, session, wa);
    return;
  }

  const fieldMap: Record<string, string> = {
    motto: 'motto', principal_name: 'principal_name', receipt_footer: 'receipt_footer',
  };

  const column = fieldMap[field];
  if (!column) {
    await startCustomization(phone, session, wa);
    return;
  }

  await db.from('schools').update({ [column]: text, updated_at: new Date().toISOString() }).eq('id', session.school_id);
  await adminSvc.logAction(session.school_id, session.school_user_id ?? '', 'update_school_info', { field: column, value: text });

  const labels: Record<string, string> = { motto: 'School Motto', principal_name: 'Principal Name', receipt_footer: 'Document Footer' };

  await wa.buttons(
    phone,
    `✅ *${labels[field]} Updated!*\n\nSaved: _"${text}"_`,
    [
      { id: 'ADMIN_CUSTOMIZATION', title: '🎨 Customize More' },
      { id: 'CUSTOM_PREVIEW_DOCS', title: '📄 Preview Docs' },
      { id: 'MAIN_MENU',           title: '🏠 Menu' },
    ]
  );

  await sessions.setState(phone, 'ADMIN_CUSTOMIZATION_MENU');
}

async function showGradeScaleMenu(phone: string, session: BotSession, wa: WhatsApp): Promise<void> {
  const { data: school } = await db.from('schools').select('grade_scale').eq('id', session.school_id).maybeSingle();
  const scale = (school?.grade_scale as any) ?? { A: { min: 75, remark: 'Excellent' } };

  await wa.buttons(
    phone,
    `🎓 *Grade Scale*\n━━━━━━━━━━━━━━━━\nGrade Cutoffs & Remarks configured.\n\nChange the scale?`,
    [
      { id: 'GRADE_USE_WAEC',      title: '📋 Use WAEC Scale' },
      { id: 'GRADE_USE_STANDARD',  title: '📋 Standard Scale' },
      { id: 'ADMIN_CUSTOMIZATION', title: '↩️ Back' },
    ]
  );

  await sessions.setState(phone, 'ADMIN_GRADE_SCALE_MENU');
}

export async function handleGradeScaleSelect(phone: string, session: BotSession, input: string, wa: WhatsApp): Promise<void> {
  let newScale: any;

  if (input === 'grade_use_waec') {
    newScale = { A: { min: 75, remark: 'Excellent' }, B: { min: 70, remark: 'Very Good' }, C: { min: 60, remark: 'Good' }, D: { min: 50, remark: 'Credit' }, E: { min: 45, remark: 'Pass' }, F: { min: 0, remark: 'Fail' } };
  } else if (input === 'grade_use_standard') {
    newScale = { A: { min: 75, remark: 'Excellent' }, B: { min: 65, remark: 'Very Good' }, C: { min: 55, remark: 'Good' }, D: { min: 45, remark: 'Pass' }, E: { min: 40, remark: 'Fair' }, F: { min: 0, remark: 'Fail' } };
  } else {
    await startCustomization(phone, session, wa);
    return;
  }

  await db.from('schools').update({ grade_scale: newScale, updated_at: new Date().toISOString() }).eq('id', session.school_id);

  await wa.buttons(
    phone,
    `✅ *Grade Scale Updated!*`,
    [
      { id: 'ADMIN_CUSTOMIZATION', title: '🎨 More Options' },
      { id: 'MAIN_MENU',           title: '🏠 Menu' },
    ]
  );

  await sessions.setState(phone, 'ADMIN_CUSTOMIZATION_MENU');
}

async function startStudentPassportUpload(phone: string, session: BotSession, wa: WhatsApp): Promise<void> {
  await wa.text(phone, `📸 *Upload Student Passport*\n\nType student name or admission number:\n\nType *0* to go back.`);
  await sessions.setState(phone, 'ADMIN_PASSPORT_SEARCH_STUDENT');
}

export async function handlePassportStudentSearch(phone: string, session: BotSession, searchText: string, wa: WhatsApp): Promise<void> {
  const text = searchText.trim();
  if (text === '0') { await startCustomization(phone, session, wa); return; }

  const results = await adminSvc.searchStudents(session.school_id, text);
  if (!results.length) {
    await wa.buttons(phone, `❌ No students found for *"${text}"*`, [
      { id: 'CUSTOM_STUDENT_PHOTO', title: '📸 Search Again' },
      { id: 'ADMIN_CUSTOMIZATION',  title: '↩️ Back' },
    ]);
    return;
  }

  if (results.length === 1) {
    await promptPassportImage(phone, session, results[0].id, `${results[0].first_name} ${results[0].last_name}`, wa);
    return;
  }

  const rows = results.slice(0, 10).map((s) => ({
    id: `PASSPORT_STUDENT_${s.id}`, title: s.full_name.substring(0, 24), description: `${s.class_name} • ${s.admission_number}`,
  }));

  await wa.list(phone, `🔍 Search Results`, `Select a student to upload passport:`, `Select`, `👤 Select`, [{ title: 'Students', rows }]);
  await sessions.setState(phone, 'ADMIN_PASSPORT_SELECT_STUDENT');
}

export async function handlePassportStudentSelect(phone: string, session: BotSession, input: string, wa: WhatsApp): Promise<void> {
  if (!input.startsWith('passport_student_')) { await startCustomization(phone, session, wa); return; }
  const studentId = input.replace('passport_student_', '');
  const { data: student } = await db.from('students').select('first_name, last_name').eq('id', studentId).maybeSingle();
  if (!student) { await wa.text(phone, `❌ Student not found.`); return; }
  await promptPassportImage(phone, session, studentId, `${student.first_name} ${student.last_name}`, wa);
}

async function promptPassportImage(phone: string, session: BotSession, studentId: string, studentName: string, wa: WhatsApp): Promise<void> {
  await wa.text(phone, `📸 *Upload Passport for ${studentName}*\n\nSend the photo now.`);
  await sessions.setState(phone, 'ADMIN_AWAITING_PASSPORT', null, { data: { passportStudentId: studentId, passportStudentName: studentName } });
}

export async function handlePassportUpload(phone: string, session: BotSession, message: IncomingMessage, downloadWa: WhatsApp, replyWa?: WhatsApp): Promise<void> {
  const sendWa = replyWa ?? downloadWa;
  const studentId = session.data?.passportStudentId as string;
  const studentName = (session.data?.passportStudentName as string) ?? 'Student';
  const mediaId = message.image?.id ?? message.document?.id;

  if (!mediaId || !studentId) { await sendWa.text(phone, `❌ No image or student ID found.`); return; }

  await sendWa.text(phone, `⏳ Uploading passport for ${studentName}...`);

  try {
    const imageBuffer = await downloadWa.downloadMediaBinary(mediaId);
    if (!imageBuffer) { await sendWa.text(phone, `❌ Could not download photo.`); return; }

    const fileName = `${session.school_id}/${studentId}.jpg`;
    await db.storage.from('student-passports').upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: true });
    const { data: urlData } = db.storage.from('student-passports').getPublicUrl(fileName);

    await db.from('students').update({ passport_url: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('id', studentId);

    await sendWa.buttons(phone, `✅ *Passport Photo Saved for ${studentName}!*`, [
      { id: 'CUSTOM_STUDENT_PHOTO', title: '📸 Upload Another' },
      { id: 'ADMIN_CUSTOMIZATION',  title: '🎨 More Options' },
      { id: 'MAIN_MENU',            title: '🏠 Menu' },
    ]);

    await sessions.setState(phone, 'ADMIN_CUSTOMIZATION_MENU');
  } catch (err) {
    await sendWa.text(phone, `❌ Error uploading passport.`);
  }
}

// ============================================================
// ✅ LIVE PREVIEWS WITH REAL SCHOOL NAME & BRANDING
// ============================================================

async function showPreviewOptions(phone: string, session: BotSession, wa: WhatsApp): Promise<void> {
  await wa.buttons(
    phone,
    `📄 *Live Branding Preview*\n\nSee how your real school details and documents look in PDF format:\n\nSelect a sample document below:`,
    [
      { id: 'PREVIEW_RECEIPT', title: '🧾 Sample Receipt' },
      { id: 'PREVIEW_RESULT',  title: '🎓 Sample Result'  },
      { id: 'ADMIN_CUSTOMIZATION', title: '↩️ Back' },
    ]
  );

  await sessions.setState(phone, 'ADMIN_CUSTOM_PREVIEW');
}

export async function handlePreviewSelect(phone: string, session: BotSession, input: string, wa: WhatsApp): Promise<void> {
  const schoolId = session.school_id;

  // Query real school name and details
  const { data: school } = await db
    .from('schools')
    .select('name, address, phone, motto')
    .eq('id', schoolId)
    .single();

  const realSchoolName = school?.name ?? 'Greenfield Academy';

  if (input === 'preview_receipt') {
    await wa.text(phone, `⏳ Generating sample receipt for *${realSchoolName}*...`);

    try {
      const pdfUrl = await pdfSvc.buildReceiptPdf({
        receiptNumber: 'SAMPLE-RCP-001',
        schoolName: realSchoolName,
        schoolAddress: school?.address ?? 'School Campus Address, Nigeria',
        schoolPhone: school?.phone ?? '08012345678',
        studentName: 'Chidi Okonkwo (Sample Student)',
        admissionNumber: 'SCH/SAMPLE/001',
        className: 'JSS 3A',
        feeTitle: 'First Term School Fees',
        term: 'First Term',
        academicYear: '2024/2025',
        amount: 50000,
        paymentMethod: 'Paystack Online',
        reference: 'SAMPLE-PAYSTACK-TRX-REF',
        paymentDate: new Date().toISOString(),
        issuedTo: 'Mr. & Mrs. Okonkwo',
        schoolId,
      });

      await wa.document(phone, pdfUrl, `Sample-Receipt.pdf`, `Sample receipt for ${realSchoolName}`);
    } catch (err) {
      console.error('[Preview] Receipt build error:', err);
      await wa.text(phone, `❌ Failed to build sample receipt.`);
    }
    return;
  }

  if (input === 'preview_result') {
    await wa.text(phone, `⏳ Generating sample report card for *${realSchoolName}*...`);

    try {
      const pdfUrl = await pdfSvc.buildResultPdf({
        school_id: schoolId,
        school_name: realSchoolName,
        term: 'Second Term',
        academic_year: '2024/2025',
        average: 78.6,
        position: '4th out of 38 students',
        total_score: 786,
        class_count: 38,
        student: {
          full_name: 'Chidi Okonkwo (Sample)',
          admission_number: 'SCH/SAMPLE/001',
          class_name: 'JSS 3A',
          gender: 'Male',
          school_id: schoolId,
          passport_url: (await db.from('students').select('passport_url').eq('school_id', schoolId).not('passport_url', 'is', null).limit(1).maybeSingle()).data?.passport_url ?? null,
        },
        subjects: [
          { name: 'Mathematics', ca_score: 8, ca2_score: 18, exam_score: 58, total: 84, grade: 'A', remark: 'EXCELLENT' },
          { name: 'English Language', ca_score: 7, ca2_score: 16, exam_score: 52, total: 75, grade: 'A', remark: 'EXCELLENT' },
          { name: 'Basic Science', ca_score: 8, ca2_score: 15, exam_score: 48, total: 71, grade: 'A', remark: 'EXCELLENT' },
          { name: 'Social Studies', ca_score: 6, ca2_score: 14, exam_score: 44, total: 64, grade: 'B', remark: 'VERY GOOD' },
          { name: 'Business Studies', ca_score: 7, ca2_score: 14, exam_score: 42, total: 63, grade: 'B', remark: 'VERY GOOD' },
          { name: 'Computer Science', ca_score: 8, ca2_score: 17, exam_score: 54, total: 79, grade: 'A', remark: 'EXCELLENT' },
          { name: 'Agricultural Science', ca_score: 6, ca2_score: 12, exam_score: 38, total: 56, grade: 'C', remark: 'GOOD' },
        ]
      });

      await wa.document(phone, pdfUrl, `Sample-Result-Card.pdf`, `Sample report sheet for ${realSchoolName}`);
    } catch (err) {
      console.error('[Preview] Result build error:', err);
      await wa.text(phone, `❌ Failed to build result sheet preview.`);
    }
    return;
  }

  await startCustomization(phone, session, wa);
}

// ─── View Current Branding Setup ────────────────────────────
async function showCurrentBranding(phone: string, session: BotSession, wa: WhatsApp): Promise<void> {
  const { data: school } = await db
    .from('schools')
    .select('name, logo_url, stamp_url, principal_signature_url, motto, principal_name, receipt_footer, grade_scale')
    .eq('id', session.school_id)
    .maybeSingle();

  if (!school) {
    await wa.text(phone, `❌ School data not found.`);
    return;
  }

  const lines: string[] = [
    `🏫 *${school.name}*`,
    `━━━━━━━━━━━━━━━━\n`,
    `🎨 *Branding:*`,
    `Logo: ${school.logo_url ? '✅ Uploaded' : '❌ Missing'}`,
    `Stamp: ${school.stamp_url ? '✅ Uploaded' : '❌ Missing'}`,
    `Signature: ${school.principal_signature_url ? '✅ Uploaded' : '❌ Missing'}\n`,
    `📝 *School Info:*`,
    `Motto: ${school.motto ?? '_Not set_'}`,
    `Principal: ${school.principal_name ?? '_Not set_'}\n`,
  ];

  if (school.receipt_footer) {
    lines.push(`📄 *Footer:*\n_"${school.receipt_footer}"_\n`);
  }

  const { count: studentsWithPhotos } = await db.from('students').select('id', { count: 'exact' }).eq('school_id', session.school_id).not('passport_url', 'is', null);
  const { count: totalStudents } = await db.from('students').select('id', { count: 'exact' }).eq('school_id', session.school_id).eq('status', 'active');

  lines.push(`📸 *Passports:*\n${studentsWithPhotos ?? 0} of ${totalStudents ?? 0} students have photos`);

  await wa.buttons(phone, lines.join('\n'), [
    { id: 'ADMIN_CUSTOMIZATION', title: '🎨 Customize More' },
    { id: 'CUSTOM_PREVIEW_DOCS', title: '📄 Preview Docs' },
    { id: 'MAIN_MENU',           title: '🏠 Menu' },
  ]);
}
