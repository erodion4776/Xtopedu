// ============================================================
// SCHOOLBOT - SCHOOL CUSTOMIZATION FLOW
// _shared/bot/admin/admin.customization.ts
// ✅ Upload logo, stamp, signature
// ✅ Upload student passports
// ✅ Customize grade scale
// ✅ Customize receipt/result footer
// ✅ Set primary/secondary brand colors
// ============================================================

import { WhatsApp }       from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AdminService }   from '../../services/admin.service.ts';
import { getSupabase }    from '../../supabase.ts';
import type {
  BotSession,
  IncomingMessage,
} from '../../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();
const db       = getSupabase();

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
        title: 'Advanced',
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
            id:          'CUSTOM_VIEW_CURRENT',
            title:       '👀 View Current Setup',
            description: 'See what is currently set',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'ADMIN_CUSTOMIZATION_MENU');
}

// ============================================================
// HANDLE CUSTOMIZATION MENU
// ============================================================

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
        `📝 *School Motto*\n\n` +
        `Enter your school's motto:\n\n` +
        `_Examples:_\n` +
        `• Knowledge is Power\n` +
        `• Discipline & Excellence\n` +
        `• Learn, Grow, Excel\n\n` +
        `Type your motto or *0* to cancel.`
      );
      break;

    case 'custom_principal':
      await promptTextInput(
        phone, 'principal_name', wa,
        `👤 *Principal / Head Teacher Name*\n\n` +
        `Enter the full name:\n\n` +
        `_Example: Mr. Adekunle Bello_\n\n` +
        `This appears on results and letters.\n\n` +
        `Type name or *0* to cancel.`
      );
      break;

    case 'custom_footer':
      await promptTextInput(
        phone, 'receipt_footer', wa,
        `📄 *Document Footer*\n\n` +
        `Text that appears at the bottom\n` +
        `of receipts and reports.\n\n` +
        `_Examples:_\n` +
        `• "Thank you for your patronage"\n` +
        `• "For enquiries: 08012345678"\n` +
        `• Bank details for payments\n\n` +
        `Type your footer or *0* to cancel.`
      );
      break;

    case 'custom_grade_scale':
      await showGradeScaleMenu(phone, session, wa);
      break;

    case 'custom_student_photo':
      await startStudentPassportUpload(
        phone, session, wa
      );
      break;

    case 'custom_view_current':
      await showCurrentBranding(phone, session, wa);
      break;

    default:
      await startCustomization(phone, session, wa);
  }
}

// ============================================================
// PROMPT FOR IMAGE UPLOAD
// ============================================================

async function promptImageUpload(
  phone:    string,
  category: 'logo' | 'stamp' | 'signature',
  wa:       WhatsApp
): Promise<void> {
  const labels: Record<string, {
    title:   string;
    icon:    string;
    tips:    string;
  }> = {
    logo: {
      title: 'School Logo / Crest',
      icon:  '🏫',
      tips:
        `• Square or rectangular\n` +
        `• Clear background preferred\n` +
        `• At least 300x300 pixels\n` +
        `• Under 5MB`,
    },
    stamp: {
      title: 'Official School Stamp',
      icon:  '📮',
      tips:
        `• Round or square stamp\n` +
        `• Transparent background best\n` +
        `• At least 200x200 pixels\n` +
        `• Used on receipts and results`,
    },
    signature: {
      title: 'Principal Signature',
      icon:  '✍️',
      tips:
        `• Scan or photo of signature\n` +
        `• White background preferred\n` +
        `• Sign on plain paper\n` +
        `• Appears on all official docs`,
    },
  };

  const info = labels[category];

  await wa.text(
    phone,
    `${info.icon} *Upload ${info.title}*\n\n` +
    `Send the image as a photo or\n` +
    `document attachment.\n\n` +
    `*Tips for best quality:*\n` +
    `${info.tips}\n\n` +
    `_Waiting for your image..._`
  );

  await sessions.setState(
    phone,
    'ADMIN_AWAITING_IMAGE',
    null,
    { data: { imageCategory: category } }
  );
}

// ============================================================
// HANDLE IMAGE UPLOAD
// ✅ Downloads image, uploads to Supabase storage
// ✅ Saves URL to schools table
// ============================================================

export async function handleImageUpload(
  phone:      string,
  session:    BotSession,
  message:    IncomingMessage,
  downloadWa: WhatsApp,
  replyWa?:   WhatsApp
): Promise<void> {
  const sendWa = replyWa ?? downloadWa;
  const category =
    (session.data?.imageCategory as string) ?? 'logo';

  // Get media ID from image or document
  const mediaId =
    message.image?.id ?? message.document?.id;

  if (!mediaId) {
    await sendWa.text(
      phone,
      `❌ No image found.\n\n` +
      `Please send an image file.`
    );
    return;
  }

  await sendWa.text(
    phone,
    `⏳ *Uploading your image...*\n\n` +
    `Please wait a moment.`
  );

  try {
    // Download image binary from WhatsApp
    const imageBuffer =
      await downloadWa.downloadMediaBinary(mediaId);

    if (!imageBuffer) {
      await sendWa.text(
        phone,
        `❌ Could not download image.\n\n` +
        `Please try sending it again.`
      );
      return;
    }

    console.log(
      `[Customization] Image downloaded:\n` +
      `  category: ${category}\n` +
      `  size: ${imageBuffer.byteLength} bytes`
    );

    // Determine file extension
    const mimeType =
      message.image?.mime_type ??
      message.document?.mime_type ??
      'image/png';
    const ext = mimeType.includes('jpeg') ||
                mimeType.includes('jpg') ? 'jpg' :
                mimeType.includes('png') ? 'png' :
                mimeType.includes('webp') ? 'webp' : 'png';

    // Upload to Supabase Storage
    const fileName =
      `${session.school_id}/${category}.${ext}`;

    const { error: uploadErr } = await db.storage
      .from('school-branding')
      .upload(fileName, imageBuffer, {
        contentType: mimeType,
        upsert:      true,
      });

    if (uploadErr) {
      console.error(
        '[Customization] Upload error:',
        uploadErr.message
      );
      await sendWa.text(
        phone,
        `❌ Failed to upload image.\n\n` +
        `Error: ${uploadErr.message}\n\n` +
        `Please try again.`
      );
      return;
    }

    // Get public URL
    const { data: urlData } = db.storage
      .from('school-branding')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Update school record
    const columnMap: Record<string, string> = {
      logo:      'logo_url',
      stamp:     'stamp_url',
      signature: 'signature_url',
    };

    const column = columnMap[category];

    await db
      .from('schools')
      .update({
        [column]:   publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.school_id);

    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'upload_branding_image',
      { category, file_name: fileName }
    );

    // Success confirmation
    await sendWa.buttons(
      phone,
      `✅ *${
        category === 'logo' ? 'Logo' :
        category === 'stamp' ? 'Stamp' :
        'Signature'
      } Uploaded!*\n\n` +
      `Your image is now saved and will\n` +
      `appear on all future receipts,\n` +
      `reports, and results.\n\n` +
      `📎 File: ${fileName}`,
      [
        {
          id:    'ADMIN_CUSTOMIZATION',
          title: '🎨 Upload More',
        },
        {
          id:    'CUSTOM_VIEW_CURRENT',
          title: '👀 View Setup',
        },
        {
          id:    'MAIN_MENU',
          title: '🏠 Menu',
        },
      ]
    );

    await sessions.setState(
      phone, 'ADMIN_CUSTOMIZATION_MENU'
    );
  } catch (err) {
    console.error(
      '[Customization] Image handler error:', err
    );
    await sendWa.text(
      phone,
      `❌ Error uploading image.\n\n` +
      `Error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ============================================================
// TEXT INPUTS (motto, principal, footer)
// ============================================================

async function promptTextInput(
  phone:  string,
  field:  string,
  wa:     WhatsApp,
  prompt: string
): Promise<void> {
  await wa.text(phone, prompt);
  await sessions.setState(
    phone,
    'ADMIN_AWAITING_TEXT_INPUT',
    null,
    { data: { textField: field } }
  );
}

export async function handleTextInput(
  phone:   string,
  session: BotSession,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const text  = rawText.trim();
  const field = (session.data?.textField as string) ?? '';

  if (text === '0') {
    await startCustomization(phone, session, wa);
    return;
  }

  if (text.length < 2 || text.length > 500) {
    await wa.text(
      phone,
      `⚠️ Please enter between 2 and 500 characters.`
    );
    return;
  }

  const fieldMap: Record<string, string> = {
    motto:           'motto',
    principal_name:  'principal_name',
    receipt_footer:  'receipt_footer',
  };

  const column = fieldMap[field];
  if (!column) {
    await startCustomization(phone, session, wa);
    return;
  }

  await db
    .from('schools')
    .update({
      [column]:   text,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.school_id);

  await adminSvc.logAction(
    session.school_id,
    session.school_user_id ?? '',
    'update_school_info',
    { field: column, value: text.substring(0, 100) }
  );

  const labels: Record<string, string> = {
    motto:           'School Motto',
    principal_name:  'Principal Name',
    receipt_footer:  'Document Footer',
  };

  await wa.buttons(
    phone,
    `✅ *${labels[field]} Updated!*\n\n` +
    `Saved: _"${text}"_\n\n` +
    `This will now appear on all\n` +
    `official documents.`,
    [
      { id: 'ADMIN_CUSTOMIZATION',  title: '🎨 Customize More' },
      { id: 'CUSTOM_VIEW_CURRENT',  title: '👀 View Setup'     },
      { id: 'MAIN_MENU',            title: '🏠 Menu'           },
    ]
  );

  await sessions.setState(
    phone, 'ADMIN_CUSTOMIZATION_MENU'
  );
}

// ============================================================
// GRADE SCALE MENU
// ============================================================

async function showGradeScaleMenu(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: school } = await db
    .from('schools')
    .select('grade_scale')
    .eq('id', session.school_id)
    .maybeSingle();

  const scale = (school?.grade_scale as Record<
    string,
    { min: number; remark: string }
  >) ?? {
    A: { min: 75, remark: 'Excellent' },
    B: { min: 65, remark: 'Very Good' },
    C: { min: 55, remark: 'Good' },
    D: { min: 45, remark: 'Pass' },
    E: { min: 40, remark: 'Fair' },
    F: { min: 0,  remark: 'Fail' },
  };

  await wa.buttons(
    phone,
    `🎓 *Grade Scale*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Current grading system:\n\n` +
    `🅰️ A (${scale.A.min}+): ${scale.A.remark}\n` +
    `🅱️ B (${scale.B.min}+): ${scale.B.remark}\n` +
    `🆑 C (${scale.C.min}+): ${scale.C.remark}\n` +
    `🇩 D (${scale.D.min}+): ${scale.D.remark}\n` +
    `🇪 E (${scale.E.min}+): ${scale.E.remark}\n` +
    `❌ F (<${scale.E.min}): ${scale.F.remark}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Want to change the scale?`,
    [
      { id: 'GRADE_USE_WAEC',      title: '📋 Use WAEC Scale'   },
      { id: 'GRADE_USE_STANDARD',  title: '📋 Standard Scale'  },
      { id: 'ADMIN_CUSTOMIZATION', title: '↩️ Back'             },
    ]
  );

  await sessions.setState(
    phone, 'ADMIN_GRADE_SCALE_MENU'
  );
}

export async function handleGradeScaleSelect(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  let newScale: Record<string, {
    min:    number;
    remark: string;
  }>;

  if (input === 'grade_use_waec') {
    newScale = {
      A: { min: 75, remark: 'Excellent'   },
      B: { min: 70, remark: 'Very Good'   },
      C: { min: 60, remark: 'Good'        },
      D: { min: 50, remark: 'Credit'      },
      E: { min: 45, remark: 'Pass'        },
      F: { min: 0,  remark: 'Fail'        },
    };
  } else if (input === 'grade_use_standard') {
    newScale = {
      A: { min: 75, remark: 'Excellent'   },
      B: { min: 65, remark: 'Very Good'   },
      C: { min: 55, remark: 'Good'        },
      D: { min: 45, remark: 'Pass'        },
      E: { min: 40, remark: 'Fair'        },
      F: { min: 0,  remark: 'Fail'        },
    };
  } else {
    await startCustomization(phone, session, wa);
    return;
  }

  await db
    .from('schools')
    .update({
      grade_scale: newScale,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', session.school_id);

  await wa.buttons(
    phone,
    `✅ *Grade Scale Updated!*\n\n` +
    `🅰️ A (${newScale.A.min}+): ${newScale.A.remark}\n` +
    `🅱️ B (${newScale.B.min}+): ${newScale.B.remark}\n` +
    `🆑 C (${newScale.C.min}+): ${newScale.C.remark}\n` +
    `🇩 D (${newScale.D.min}+): ${newScale.D.remark}\n` +
    `🇪 E (${newScale.E.min}+): ${newScale.E.remark}\n\n` +
    `Applied to all future result cards.`,
    [
      { id: 'ADMIN_CUSTOMIZATION', title: '🎨 More Options' },
      { id: 'MAIN_MENU',           title: '🏠 Menu'         },
    ]
  );

  await sessions.setState(
    phone, 'ADMIN_CUSTOMIZATION_MENU'
  );
}

// ============================================================
// STUDENT PASSPORT UPLOAD
// ============================================================

async function startStudentPassportUpload(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `📸 *Upload Student Passport Photo*\n\n` +
    `Search for the student first:\n\n` +
    `Type student name or admission no.\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(
    phone, 'ADMIN_PASSPORT_SEARCH_STUDENT'
  );
}

export async function handlePassportStudentSearch(
  phone:      string,
  session:    BotSession,
  searchText: string,
  wa:         WhatsApp
): Promise<void> {
  const text = searchText.trim();

  if (text === '0') {
    await startCustomization(phone, session, wa);
    return;
  }

  if (text.length < 2) {
    await wa.text(
      phone,
      `⚠️ Please type at least 2 characters.`
    );
    return;
  }

  const results = await adminSvc.searchStudents(
    session.school_id, text
  );

  if (!results.length) {
    await wa.buttons(
      phone,
      `❌ No students found for *"${text}"*`,
      [
        { id: 'CUSTOM_STUDENT_PHOTO', title: '🔍 Search Again' },
        { id: 'ADMIN_CUSTOMIZATION',  title: '↩️ Back'         },
      ]
    );
    return;
  }

  if (results.length === 1) {
    await promptPassportImage(
      phone, session, results[0].id,
      `${results[0].first_name} ${results[0].last_name}`,
      wa
    );
    return;
  }

  const rows = results.slice(0, 10).map((s) => ({
    id:          `PASSPORT_STUDENT_${s.id}`,
    title:       s.full_name.substring(0, 24),
    description:
      `${s.class_name} ${s.arm_name} • ` +
      `${s.admission_number}`,
  }));

  await wa.list(
    phone,
    `🔍 Search Results`,
    `Found *${results.length}* students.\n\n` +
    `Select one to upload passport:`,
    `Tap to select`,
    `👤 Select Student`,
    [{ title: 'Students', rows }]
  );

  await sessions.setState(
    phone, 'ADMIN_PASSPORT_SELECT_STUDENT'
  );
}

export async function handlePassportStudentSelect(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('passport_student_')) {
    await startCustomization(phone, session, wa);
    return;
  }

  const studentId =
    input.replace('passport_student_', '');

  const { data: student } = await db
    .from('students')
    .select('first_name, last_name, admission_number')
    .eq('id', studentId)
    .maybeSingle();

  if (!student) {
    await wa.text(phone, `❌ Student not found.`);
    return;
  }

  await promptPassportImage(
    phone, session, studentId,
    `${student.first_name} ${student.last_name}`,
    wa
  );
}

async function promptPassportImage(
  phone:       string,
  session:     BotSession,
  studentId:   string,
  studentName: string,
  wa:          WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `📸 *Upload Passport for ${studentName}*\n\n` +
    `Send the student's passport photo\n` +
    `now as an image.\n\n` +
    `*Tips:*\n` +
    `• Clear headshot\n` +
    `• White or plain background\n` +
    `• Square or portrait aspect\n` +
    `• At least 200x200 pixels\n\n` +
    `_Waiting for photo..._`
  );

  await sessions.setState(
    phone,
    'ADMIN_AWAITING_PASSPORT',
    null,
    {
      data: {
        passportStudentId:   studentId,
        passportStudentName: studentName,
      },
    }
  );
}

export async function handlePassportUpload(
  phone:      string,
  session:    BotSession,
  message:    IncomingMessage,
  downloadWa: WhatsApp,
  replyWa?:   WhatsApp
): Promise<void> {
  const sendWa    = replyWa ?? downloadWa;
  const studentId =
    session.data?.passportStudentId as string;
  const studentName =
    (session.data?.passportStudentName as string) ??
    'Student';

  const mediaId =
    message.image?.id ?? message.document?.id;

  if (!mediaId || !studentId) {
    await sendWa.text(
      phone,
      `❌ No image or student ID found.`
    );
    return;
  }

  await sendWa.text(
    phone,
    `⏳ Uploading ${studentName}'s passport...`
  );

  try {
    const imageBuffer =
      await downloadWa.downloadMediaBinary(mediaId);

    if (!imageBuffer) {
      await sendWa.text(
        phone,
        `❌ Could not download image.`
      );
      return;
    }

    const mimeType =
      message.image?.mime_type ??
      message.document?.mime_type ??
      'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' :
                mimeType.includes('webp') ? 'webp' : 'jpg';

    const fileName =
      `${session.school_id}/${studentId}.${ext}`;

    const { error: uploadErr } = await db.storage
      .from('student-passports')
      .upload(fileName, imageBuffer, {
        contentType: mimeType,
        upsert:      true,
      });

    if (uploadErr) {
      await sendWa.text(
        phone,
        `❌ Upload failed: ${uploadErr.message}`
      );
      return;
    }

    const { data: urlData } = db.storage
      .from('student-passports')
      .getPublicUrl(fileName);

    await db
      .from('students')
      .update({
        passport_url: urlData.publicUrl,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', studentId);

    await sendWa.buttons(
      phone,
      `✅ *Passport Uploaded!*\n\n` +
      `👤 *${studentName}*\n\n` +
      `Photo will now appear on their\n` +
      `results, ID cards, and reports.`,
      [
        {
          id:    'CUSTOM_STUDENT_PHOTO',
          title: '📸 Upload Another',
        },
        {
          id:    'ADMIN_CUSTOMIZATION',
          title: '🎨 More Options',
        },
        {
          id:    'MAIN_MENU',
          title: '🏠 Menu',
        },
      ]
    );

    await sessions.setState(
      phone, 'ADMIN_CUSTOMIZATION_MENU'
    );
  } catch (err) {
    console.error(
      '[Customization] Passport error:', err
    );
    await sendWa.text(
      phone,
      `❌ Error uploading passport.`
    );
  }
}

// ============================================================
// VIEW CURRENT BRANDING
// ============================================================

async function showCurrentBranding(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: school } = await db
    .from('schools')
    .select(`
      name, logo_url, stamp_url, signature_url,
      motto, principal_name, receipt_footer,
      grade_scale
    `)
    .eq('id', session.school_id)
    .maybeSingle();

  if (!school) {
    await wa.text(phone, `❌ School data not found.`);
    return;
  }

  const scale = school.grade_scale as Record<
    string,
    { min: number; remark: string }
  > | null;

  const lines: string[] = [];

  lines.push(`🏫 *${school.name}*`);
  lines.push(`━━━━━━━━━━━━━━━━`);
  lines.push('');

  lines.push(`🎨 *Branding:*`);
  lines.push(
    `Logo: ${school.logo_url ? '✅ Uploaded' : '❌ Missing'}`
  );
  lines.push(
    `Stamp: ${school.stamp_url ? '✅ Uploaded' : '❌ Missing'}`
  );
  lines.push(
    `Signature: ${
      school.signature_url ? '✅ Uploaded' : '❌ Missing'
    }`
  );
  lines.push('');

  lines.push(`📝 *School Info:*`);
  lines.push(
    `Motto: ${school.motto ?? '_Not set_'}`
  );
  lines.push(
    `Principal: ${school.principal_name ?? '_Not set_'}`
  );
  lines.push('');

  if (school.receipt_footer) {
    lines.push(`📄 *Footer:*`);
    lines.push(`_"${school.receipt_footer}"_`);
    lines.push('');
  }

  if (scale) {
    lines.push(`🎓 *Grade Scale:*`);
    lines.push(
      `A (${scale.A.min}+) B (${scale.B.min}+) ` +
      `C (${scale.C.min}+)`
    );
    lines.push(
      `D (${scale.D.min}+) E (${scale.E.min}+) F`
    );
    lines.push('');
  }

  // Count students with passports
  const { count: studentsWithPhotos } = await db
    .from('students')
    .select('id', { count: 'exact' })
    .eq('school_id', session.school_id)
    .not('passport_url', 'is', null);

  const { count: totalStudents } = await db
    .from('students')
    .select('id', { count: 'exact' })
    .eq('school_id', session.school_id)
    .eq('status', 'active');

  lines.push(`📸 *Passports:*`);
  lines.push(
    `${studentsWithPhotos ?? 0} of ` +
    `${totalStudents ?? 0} students have photos`
  );

  await wa.buttons(
    phone,
    lines.join('\n'),
    [
      {
        id:    'ADMIN_CUSTOMIZATION',
        title: '🎨 Customize More',
      },
      {
        id:    'MAIN_MENU',
        title: '🏠 Menu',
      },
    ]
  );
}
