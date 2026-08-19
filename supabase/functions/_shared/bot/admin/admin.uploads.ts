// ============================================================
// SCHOOLBOT - ADMIN BULK UPLOAD FLOW
// supabase/functions/_shared/bot/admin/admin.uploads.ts
// ✅ Fixed: More lenient CSV file type detection
// ✅ Fixed: Detailed logging at every step
// ✅ Fixed: State check more lenient for document uploads
// ✅ Fixed: Better error messages
// ✅ Fixed: downloadMedia error handling
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { CSVService } from '../../csv.service.ts';
import { showAdminMenu } from './admin.menu.ts';
import { getSupabase } from '../../supabase.ts';
import type { BotSession, IncomingMessage } from '../../types.ts';

const sessions = new SessionService();
const csvSvc   = new CSVService();
const db       = getSupabase();

// ─── Start bulk upload flow ────────────────────────────────────────────────
export async function startBulkUpload(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    `📤 Bulk Student Upload`,
    `Upload multiple students at once\n` +
    `using a CSV spreadsheet file.\n\n` +
    `*How it works:*\n` +
    `1️⃣ Download the CSV template\n` +
    `2️⃣ Fill in student details\n` +
    `3️⃣ Send the CSV file here\n` +
    `4️⃣ Students imported automatically!\n\n` +
    `*Supports:*\n` +
    `✅ New students\n` +
    `✅ Update existing students\n` +
    `✅ Auto-link parents`,
    `Classes must exist before uploading`,
    `📤 Upload Options`,
    [
      {
        title: 'Get Started',
        rows: [
          {
            id:          'download_template',
            title:       '📥 Get CSV Template',
            description: 'Download the template format',
          },
          {
            id:          'upload_instructions',
            title:       '📖 How to Fill Template',
            description: 'Step by step guide',
          },
          {
            id:          'view_classes',
            title:       '📚 View My Classes',
            description: 'See available class names to use',
          },
        ],
      },
      {
        title: 'History',
        rows: [
          {
            id:          'upload_history',
            title:       '📋 Upload History',
            description: 'View previous uploads',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'ADMIN_UPLOAD_MENU');
}

// ─── Handle upload menu selections ────────────────────────────────────────
export async function handleUploadMenu(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  switch (input) {
    case 'download_template':
      await sendCSVTemplate(phone, session, wa);
      break;

    case 'upload_instructions':
      await showUploadInstructions(phone, session, wa);
      break;

    case 'view_classes':
      await showAvailableClasses(phone, session, wa);
      break;

    case 'upload_history':
      await showUploadHistory(phone, session, wa);
      break;

    case 'ready_to_upload':
      await promptForCSV(phone, session, wa);
      break;

    default:
      await startBulkUpload(phone, session, wa);
  }
}

// ─── Send CSV template as downloadable link ────────────────────────────────
async function sendCSVTemplate(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const template = csvSvc.generateTemplate();

  try {
    const fileName =
      `templates/student_template_${session.school_id}.csv`;

    await db.storage
      .from('school-files')
      .upload(
        fileName,
        new TextEncoder().encode(template),
        { contentType: 'text/csv', upsert: true }
      );

    const { data: urlData } = db.storage
      .from('school-files')
      .getPublicUrl(fileName);

    await wa.text(
      phone,
      `📥 *CSV Template Ready!*\n\n` +
      `Download your template here:\n` +
      `${urlData.publicUrl}\n\n` +
      `*Required Columns:*\n` +
      `• first_name *(required)*\n` +
      `• last_name *(required)*\n` +
      `• admission_number *(required)*\n` +
      `• class_name *(required)*\n\n` +
      `*Optional Columns:*\n` +
      `• class_arm (A, B, C)\n` +
      `• gender (Male/Female)\n` +
      `• date_of_birth (DD/MM/YYYY)\n` +
      `• parent_name\n` +
      `• parent_phone (08012345678)\n` +
      `• parent_email\n` +
      `• blood_group (A+, O-, etc)\n` +
      `• medical_notes\n\n` +
      `After filling, *send the CSV file\n` +
      `to this chat* and I will import\n` +
      `your students! 📤`
    );

    await wa.buttons(
      phone,
      `Need help filling the template?`,
      [
        { id: 'upload_instructions', title: '📖 Instructions' },
        { id: 'view_classes',        title: '📚 View Classes' },
      ]
    );

    // ✅ Set state to awaiting CSV
    await sessions.setState(phone, 'ADMIN_AWAITING_CSV');
  } catch (err) {
    console.error('[Upload] template error:', err);

    // Fallback — show template as text
    await wa.text(
      phone,
      `📥 *CSV Template*\n\n` +
      `Copy this header row into Excel\n` +
      `or Google Sheets:\n\n` +
      `\`first_name,last_name,admission_number,` +
      `class_name,class_arm,gender,date_of_birth,` +
      `parent_name,parent_phone,parent_email,` +
      `blood_group,medical_notes\`\n\n` +
      `Fill in student data below the\n` +
      `header row, save as CSV and\n` +
      `send the file here.`
    );

    await sessions.setState(phone, 'ADMIN_AWAITING_CSV');
  }
}

// ─── Show upload instructions ──────────────────────────────────────────────
async function showUploadInstructions(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `📖 *How to Upload Students*\n\n` +
    `*Step 1:* Download the CSV template\n\n` +
    `*Step 2:* Open in Excel or\n` +
    `Google Sheets\n\n` +
    `*Step 3:* Fill in student details\n` +
    `one row per student\n\n` +
    `*Step 4:* Save/Export as CSV\n` +
    `(File → Save As → CSV format)\n\n` +
    `*Step 5:* Come back here and\n` +
    `send the CSV file as attachment\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `⚠️ *Important Rules:*\n\n` +
    `• Do NOT change column headers\n` +
    `• One student per row\n` +
    `• Class names must match exactly\n` +
    `  (e.g., JSS 1 not JSS1)\n` +
    `• Date format: DD/MM/YYYY\n` +
    `• Phone: 08012345678 format\n` +
    `━━━━━━━━━━━━━━━━`
  );

  await wa.buttons(
    phone,
    `Ready to upload?`,
    [
      { id: 'download_template',  title: '📥 Get Template' },
      { id: 'view_classes',       title: '📚 View Classes' },
      { id: 'MAIN_MENU',          title: '🏠 Menu'         },
    ]
  );
}

// ─── Show available class names ────────────────────────────────────────────
async function showAvailableClasses(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: classes } = await db
    .from('classes')
    .select('name, level, class_arms( name )')
    .eq('school_id', session.school_id)
    .order('level', { ascending: true });

  if (!classes?.length) {
    await wa.buttons(
      phone,
      `📚 *No Classes Found!*\n\n` +
      `You need to add classes before\n` +
      `uploading students.\n\n` +
      `Go to Admin Menu → Settings\n` +
      `to add your classes first.`,
      [{ id: 'MAIN_MENU', title: '🏠 Menu' }]
    );
    return;
  }

  const classList = classes
    .map((cls) => {
      const arms = (
        cls.class_arms as Array<{ name: string }> | null
      )
        ?.map((a) => a.name)
        .join(', ');
      return (
        `📚 *${cls.name}*` +
        (arms ? ` — Arms: ${arms}` : '')
      );
    })
    .join('\n');

  await wa.buttons(
    phone,
    `📚 *Your Classes*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Use these *exact names* in your\n` +
    `CSV class_name column:\n\n` +
    `${classList}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `_Copy the class name exactly\n` +
    `as shown above_`,
    [
      { id: 'download_template', title: '📥 Get Template' },
      { id: 'MAIN_MENU',         title: '🏠 Menu'         },
    ]
  );
}

// ─── Prompt admin to send CSV file ────────────────────────────────────────
async function promptForCSV(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `📤 *Ready to Upload!*\n\n` +
    `Send your CSV file as an\n` +
    `attachment to this chat.\n\n` +
    `Make sure the file:\n` +
    `• Has .csv extension\n` +
    `• Uses the correct template\n` +
    `• Has correct class names\n\n` +
    `_Waiting for your CSV file..._`
  );

  await sessions.setState(phone, 'ADMIN_AWAITING_CSV');
}

// ─── Check if file is a CSV ────────────────────────────────────────────────
function isCSVFile(
  filename: string,
  mimeType: string
): boolean {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();

  return (
    name.endsWith('.csv')                          ||
    mime.includes('csv')                           ||
    mime.includes('text/plain')                    ||
    mime.includes('text/csv')                      ||
    mime.includes('application/vnd.ms-excel')      ||
    mime.includes('application/octet-stream')      ||
    name.includes('csv')
  );
}

// ─── Handle incoming CSV document ─────────────────────────────────────────
// ✅ Fixed: More lenient file type detection
// ✅ Fixed: Detailed logging at every step
// ✅ Fixed: Better error messages
export async function handleCSVDocument(
  phone:   string,
  session: BotSession,
  message: IncomingMessage,
  wa:      WhatsApp
): Promise<void> {
  const doc = message.document;

  console.log(
    `[Upload] handleCSVDocument called:\n` +
    `  phone: ${phone}\n` +
    `  state: ${session.state}\n` +
    `  doc id: ${doc?.id ?? 'none'}\n` +
    `  filename: ${doc?.filename ?? 'none'}\n` +
    `  mimeType: ${doc?.mime_type ?? 'none'}`
  );

  if (!doc) {
    await wa.text(
      phone,
      `❌ No document found.\n\nPlease send a CSV file.`
    );
    return;
  }

  const filename = doc.filename ?? '';
  const mimeType = doc.mime_type ?? '';

  // ✅ More lenient CSV check
  const isCSV = isCSVFile(filename, mimeType);

  console.log(
    `[Upload] File type check:\n` +
    `  filename: "${filename}"\n` +
    `  mimeType: "${mimeType}"\n` +
    `  isCSV: ${isCSV}`
  );

  if (!isCSV) {
    await wa.buttons(
      phone,
      `❌ *Wrong File Type!*\n\n` +
      `Please send a *.csv* file.\n\n` +
      `File received:\n` +
      `*${filename || mimeType || 'unknown type'}*\n\n` +
      `Steps to fix:\n` +
      `1. Open your spreadsheet\n` +
      `2. File → Save As\n` +
      `3. Choose *CSV* format\n` +
      `4. Send the CSV file here`,
      [
        { id: 'download_template',   title: '📥 Get Template' },
        { id: 'upload_instructions', title: '📖 Help'         },
      ]
    );
    return;
  }

  await wa.text(
    phone,
    `⏳ *Processing your CSV file...*\n\n` +
    `📁 File: ${filename || 'upload.csv'}\n\n` +
    `Please wait a moment.`
  );

  try {
    console.log(
      `[Upload] Downloading media id: ${doc.id}`
    );

    // Download the CSV file from WhatsApp
    const csvText = await wa.downloadMedia(doc.id);

    console.log(
      `[Upload] Media download result:\n` +
      `  success: ${csvText !== null}\n` +
      `  length: ${csvText?.length ?? 0} chars`
    );

    if (!csvText) {
      await wa.text(
        phone,
        `❌ *Could not download the file*\n\n` +
        `WhatsApp media download failed.\n\n` +
        `Please try:\n` +
        `• Send the file again\n` +
        `• Make sure file is under 16MB\n` +
        `• Try saving as CSV again`
      );
      return;
    }

    // Log preview for debugging
    console.log(
      `[Upload] CSV preview:\n` +
      `"${csvText.substring(0, 300)}"`
    );

    // Parse CSV
    const { rows, errors: parseErrors } =
      csvSvc.parseCSV(csvText);

    console.log(
      `[Upload] Parse result:\n` +
      `  rows: ${rows.length}\n` +
      `  parseErrors: ${parseErrors.length}`
    );

    // CSV format errors
    if (parseErrors.length > 0) {
      const errorList = parseErrors
        .slice(0, 3)
        .join('\n');

      await wa.buttons(
        phone,
        `❌ *CSV Format Error*\n\n` +
        `${errorList}\n\n` +
        `Please fix and try again.\n\n` +
        `*Common fixes:*\n` +
        `• Do not change column headers\n` +
        `• Save as CSV not Excel\n` +
        `• Use comma as separator`,
        [
          { id: 'download_template',   title: '📥 Get Template' },
          { id: 'upload_instructions', title: '📖 Help'         },
        ]
      );
      return;
    }

    // No data rows
    if (!rows.length) {
      await wa.text(
        phone,
        `❌ *Empty file!*\n\n` +
        `The CSV file has no student data.\n\n` +
        `Please add student rows below\n` +
        `the header row.`
      );
      return;
    }

    // Large file warning
    if (rows.length > 500) {
      await wa.text(
        phone,
        `⚠️ *Large File Detected*\n\n` +
        `Your file has *${rows.length}* students.\n\n` +
        `This may take a few minutes.\n` +
        `Please be patient. ☕`
      );
    }

    // Show preview of first 3 rows
    const preview = rows.slice(0, 3).map((r, i) => {
      const className =
        r.class_name?.trim() ?? 'Unknown';
      const arm =
        r.class_arm?.trim()  ?? 'A';
      return (
        `${i + 1}. *${r.first_name ?? '?'} ` +
        `${r.last_name ?? '?'}*\n` +
        `   📋 ${r.admission_number ?? 'No ADM'}\n` +
        `   🏫 ${className} ${arm}`
      );
    }).join('\n\n');

    const moreText =
      rows.length > 3
        ? `\n\n_...and ${rows.length - 3} more students_`
        : '';

    await wa.buttons(
      phone,
      `📊 *File Preview*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📁 File: ${filename || 'upload.csv'}\n` +
      `👥 Students found: *${rows.length}*\n\n` +
      `*First 3 students:*\n\n` +
      `${preview}${moreText}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Proceed with import?`,
      [
        {
          id:    `CONFIRM_UPLOAD_${rows.length}`,
          title: `✅ Import ${rows.length} Students`,
        },
        { id: 'CANCEL_UPLOAD', title: '❌ Cancel' },
      ]
    );

    // Save rows to session data
    await sessions.setState(
      phone,
      'ADMIN_CONFIRM_UPLOAD',
      null,
      {
        data: {
          pendingRows:     rows,
          pendingCount:    rows.length,
          pendingFileName: filename || 'upload.csv',
        },
      }
    );

    console.log(
      `[Upload] ✅ Preview shown for ` +
      `${rows.length} students`
    );

  } catch (err) {
    console.error(
      '[Upload] CSV processing error:',
      err instanceof Error ? err.message : String(err)
    );
    await wa.text(
      phone,
      `❌ *Error processing file*\n\n` +
      `Something went wrong.\n\n` +
      `Error: ${
        err instanceof Error
          ? err.message
          : String(err)
      }\n\n` +
      `Please check the file and try again.\n\n` +
      `Type *0* to go back.`
    );
  }
}

// ─── Handle upload confirmation ────────────────────────────────────────────
export async function handleConfirmUpload(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  // Cancel
  if (input === 'cancel_upload') {
    await wa.text(phone, `❌ Upload cancelled.`);
    await startBulkUpload(phone, session, wa);
    return;
  }

  // Must be confirm upload
  if (!input.startsWith('confirm_upload_')) return;

  const rows = session.data?.pendingRows as
    | Array<Record<string, string>>
    | null;

  const fileName =
    (session.data?.pendingFileName as string) ??
    'upload.csv';

  if (!rows?.length) {
    await wa.text(
      phone,
      `❌ No data to import.\n\nPlease start over.`
    );
    await startBulkUpload(phone, session, wa);
    return;
  }

  await wa.text(
    phone,
    `⏳ *Importing ${rows.length} students...*\n\n` +
    `This may take a few minutes.\n` +
    `Please do not close this chat.`
  );

  // Create upload job record
  const { data: job, error: jobError } = await db
    .from('bulk_upload_jobs')
    .insert({
      school_id:   session.school_id,
      upload_type: 'students',
      file_name:   fileName,
      total_rows:  rows.length,
      status:      'processing',
      started_at:  new Date().toISOString(),
      created_at:  new Date().toISOString(),
    })
    .select()
    .single();

  if (jobError || !job) {
    await wa.text(
      phone,
      `❌ Failed to start upload.\n\nPlease try again.`
    );
    return;
  }

  // Process the CSV import
  const result = await csvSvc.importStudents(
    session.school_id,
    rows,
    job.id
  );

  // Build result message
  const statusIcon =
    result.failed === 0
      ? '🎉'
      : result.created + result.updated === 0
      ? '❌'
      : '⚠️';

  let resultMsg =
    `${statusIcon} *Upload Complete!*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📁 File: ${fileName}\n\n` +
    `📊 *Results:*\n` +
    `📋 Total Rows:  *${result.total}*\n` +
    `✅ Created:     *${result.created}*\n` +
    `🔄 Updated:     *${result.updated}*\n`;

  if (result.failed > 0) {
    resultMsg += `❌ Failed:      *${result.failed}*\n`;
  }

  resultMsg += `━━━━━━━━━━━━━━━━\n`;

  // Show first 5 errors if any
  if (result.errors.length > 0) {
    resultMsg += `\n⚠️ *Errors (first 5):*\n`;
    result.errors.slice(0, 5).forEach((err) => {
      resultMsg += `• Row ${err.row}: ${err.message}\n`;
    });

    if (result.errors.length > 5) {
      resultMsg +=
        `_...and ${result.errors.length - 5} more errors_\n`;
    }
  }

  await wa.buttons(
    phone,
    resultMsg,
    [
      { id: 'download_template', title: '📤 Upload More' },
      { id: 'MAIN_MENU',         title: '🏠 Menu'        },
    ]
  );

  await sessions.setState(phone, 'ADMIN_UPLOAD_MENU');
}

// ─── Start score upload flow ──────────────────────────────────────────────
export async function startScoreUpload(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: terms } = await db
    .from('terms')
    .select('id, name, is_current, academic_years ( name )')
    .order('created_at', { ascending: false })
    .limit(6);

  if (!terms?.length) {
    await wa.buttons(
      phone,
      `🎓 *Upload Scores*\n\n` +
      `No terms found.\n\n` +
      `Please set up academic terms\n` +
      `before uploading scores.`,
      [{ id: 'MAIN_MENU', title: '🏠 Menu' }]
    );
    return;
  }

  const rows = terms.map((t) => {
    const year =
      (t.academic_years as Record<string, string> | null)
        ?.name ?? '';
    return {
      id:          `SCORE_UPLOAD_TERM_${t.id}`,
      title:       `${t.name}${
        t.is_current ? ' ⭐' : ''
      }`.substring(0, 24),
      description: year,
    };
  });

  await wa.list(
    phone,
    `🎓 Upload Scores`,
    `Which term are these scores for?\n\n` +
    `⭐ = Current term`,
    `Bulk import exam scores via CSV`,
    `🎓 Select Term`,
    [{ title: 'Available Terms', rows }]
  );

  await sessions.setState(
    phone, 'ADMIN_SCORE_UPLOAD_TERM_SELECT'
  );
}

// ─── Handle term selection for score upload ────────────────────────────────
export async function handleScoreUploadTermSelect(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('score_upload_term_')) return;

  const termId =
    input.replace('score_upload_term_', '');
  const template = csvSvc.generateScoreTemplate();

  try {
    const fileName =
      `templates/score_template_${session.school_id}.csv`;

    await db.storage
      .from('school-files')
      .upload(
        fileName,
        new TextEncoder().encode(template),
        { contentType: 'text/csv', upsert: true }
      );

    const { data: urlData } = db.storage
      .from('school-files')
      .getPublicUrl(fileName);

    await wa.text(
      phone,
      `📥 *Score Template Ready!*\n\n` +
      `Download your template here:\n` +
      `${urlData.publicUrl}\n\n` +
      `*Required Columns:*\n` +
      `• admission_number *(required)*\n` +
      `• subject *(required)*\n` +
      `• ca_score *(required, 0-40 typical)*\n` +
      `• exam_score *(required, 0-60 typical)*\n\n` +
      `*One row = one student score for one subject.*\n` +
      `Add a new row for each subject per student.\n\n` +
      `After filling, *send the CSV file\n` +
      `to this chat* and I'll import the scores! 📤`
    );

    await sessions.setState(
      phone,
      'ADMIN_AWAITING_SCORE_CSV',
      null,
      { data: { scoreTermId: termId } }
    );
  } catch (err) {
    console.error('[Upload] score template error:', err);

    await wa.text(
      phone,
      `📥 *Score Template*\n\n` +
      `Copy this header row into Excel\n` +
      `or Google Sheets:\n\n` +
      `\`admission_number,subject,ca_score,exam_score\`\n\n` +
      `Fill in one row per student per subject,\n` +
      `save as CSV and send the file here.`
    );

    await sessions.setState(
      phone,
      'ADMIN_AWAITING_SCORE_CSV',
      null,
      { data: { scoreTermId: termId } }
    );
  }
}

// ─── Handle incoming score CSV document ────────────────────────────────────
// ✅ Fixed: More lenient file type detection
// ✅ Fixed: Detailed logging
export async function handleScoreCSVDocument(
  phone:   string,
  session: BotSession,
  message: IncomingMessage,
  wa:      WhatsApp
): Promise<void> {
  const doc = message.document;

  console.log(
    `[Upload] handleScoreCSVDocument called:\n` +
    `  phone: ${phone}\n` +
    `  state: ${session.state}\n` +
    `  doc id: ${doc?.id ?? 'none'}\n` +
    `  filename: ${doc?.filename ?? 'none'}\n` +
    `  mimeType: ${doc?.mime_type ?? 'none'}`
  );

  if (!doc) {
    await wa.text(
      phone,
      `❌ No document found. Please send a CSV file.`
    );
    return;
  }

  const filename = doc.filename ?? '';
  const mimeType = doc.mime_type ?? '';
  const isCSV    = isCSVFile(filename, mimeType);

  if (!isCSV) {
    await wa.text(
      phone,
      `❌ *Wrong File Type!*\n\n` +
      `Please send a *.csv* file with your scores.\n\n` +
      `File received: *${filename || mimeType || 'unknown'}*`
    );
    return;
  }

  await wa.text(
    phone,
    `⏳ *Processing your score file...*\n\n` +
    `📁 File: ${filename || 'scores.csv'}\n\n` +
    `Please wait a moment.`
  );

  try {
    console.log(
      `[Upload] Downloading score CSV: ${doc.id}`
    );

    const csvText = await wa.downloadMedia(doc.id);

    console.log(
      `[Upload] Score CSV download result:\n` +
      `  success: ${csvText !== null}\n` +
      `  length: ${csvText?.length ?? 0} chars`
    );

    if (!csvText) {
      await wa.text(
        phone,
        `❌ Could not download the file.\n\n` +
        `Please try sending it again.`
      );
      return;
    }

    const { rows, errors: parseErrors } =
      csvSvc.parseCSV(csvText);

    console.log(
      `[Upload] Score CSV parse result:\n` +
      `  rows: ${rows.length}\n` +
      `  errors: ${parseErrors.length}`
    );

    if (parseErrors.length > 0) {
      await wa.text(
        phone,
        `❌ *CSV Format Error*\n\n` +
        `${parseErrors.slice(0, 3).join('\n')}\n\n` +
        `Please fix and try again.`
      );
      return;
    }

    if (!rows.length) {
      await wa.text(
        phone,
        `❌ *Empty file!*\n\n` +
        `The CSV file has no score data.`
      );
      return;
    }

    const preview = rows.slice(0, 3).map((r, i) => {
      return (
        `${i + 1}. ${r.admission_number ?? '?'} — ` +
        `${r.subject ?? '?'}\n` +
        `   CA: ${r.ca_score ?? '?'} | ` +
        `Exam: ${r.exam_score ?? '?'}`
      );
    }).join('\n\n');

    const moreText =
      rows.length > 3
        ? `\n\n_...and ${rows.length - 3} more rows_`
        : '';

    await wa.buttons(
      phone,
      `📊 *File Preview*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📁 File: ${filename || 'scores.csv'}\n` +
      `📝 Score rows found: *${rows.length}*\n\n` +
      `*First 3 rows:*\n\n` +
      `${preview}${moreText}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Proceed with import?`,
      [
        {
          id:    `CONFIRM_SCORE_UPLOAD_${rows.length}`,
          title: `✅ Import ${rows.length} Scores`,
        },
        { id: 'CANCEL_SCORE_UPLOAD', title: '❌ Cancel' },
      ]
    );

    await sessions.setState(
      phone,
      'ADMIN_CONFIRM_SCORE_UPLOAD',
      null,
      {
        data: {
          scoreTermId:        session.data?.scoreTermId,
          pendingScoreRows:   rows,
          pendingScoreCount:  rows.length,
          pendingScoreFileName: filename || 'scores.csv',
        },
      }
    );

    console.log(
      `[Upload] ✅ Score preview shown for ` +
      `${rows.length} rows`
    );

  } catch (err) {
    console.error(
      '[Upload] Score CSV processing error:',
      err instanceof Error ? err.message : String(err)
    );
    await wa.text(
      phone,
      `❌ *Error processing file*\n\n` +
      `Something went wrong.\n\n` +
      `Error: ${
        err instanceof Error
          ? err.message
          : String(err)
      }\n\n` +
      `Type *0* to go back.`
    );
  }
}

// ─── Handle score upload confirmation ──────────────────────────────────────
export async function handleConfirmScoreUpload(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (input === 'cancel_score_upload') {
    await wa.text(phone, `❌ Score upload cancelled.`);
    await showAdminMenu(phone, session, wa);
    return;
  }

  if (!input.startsWith('confirm_score_upload_')) return;

  const rows = session.data?.pendingScoreRows as
    | Array<Record<string, string>>
    | null;
  const termId =
    session.data?.scoreTermId as string;
  const fileName =
    (session.data?.pendingScoreFileName as string) ??
    'scores.csv';

  if (!rows?.length || !termId) {
    await wa.text(
      phone,
      `❌ No data to import.\n\nPlease start over.`
    );
    await showAdminMenu(phone, session, wa);
    return;
  }

  await wa.text(
    phone,
    `⏳ *Importing ${rows.length} scores...*\n\n` +
    `This may take a moment.\n` +
    `Please do not close this chat.`
  );

  const { data: job, error: jobError } = await db
    .from('bulk_upload_jobs')
    .insert({
      school_id:   session.school_id,
      upload_type: 'scores',
      file_name:   fileName,
      total_rows:  rows.length,
      status:      'processing',
      started_at:  new Date().toISOString(),
      created_at:  new Date().toISOString(),
    })
    .select()
    .single();

  if (jobError || !job) {
    await wa.text(
      phone,
      `❌ Failed to start upload.\n\nPlease try again.`
    );
    return;
  }

  const result = await csvSvc.importScores(
    session.school_id,
    termId,
    rows,
    job.id
  );

  const statusIcon =
    result.failed === 0
      ? '🎉'
      : result.created + result.updated === 0
      ? '❌'
      : '⚠️';

  let resultMsg =
    `${statusIcon} *Score Upload Complete!*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📁 File: ${fileName}\n\n` +
    `📊 *Results:*\n` +
    `📝 Total Rows:  *${result.total}*\n` +
    `✅ Created:     *${result.created}*\n` +
    `🔄 Updated:     *${result.updated}*\n`;

  if (result.failed > 0) {
    resultMsg += `❌ Failed:      *${result.failed}*\n`;
  }

  resultMsg += `━━━━━━━━━━━━━━━━\n`;

  if (result.errors.length > 0) {
    resultMsg += `\n⚠️ *Errors (first 5):*\n`;
    result.errors.slice(0, 5).forEach((err) => {
      resultMsg += `• Row ${err.row}: ${err.message}\n`;
    });

    if (result.errors.length > 5) {
      resultMsg +=
        `_...and ${result.errors.length - 5} more errors_\n`;
    }
  }

  await wa.buttons(
    phone,
    resultMsg,
    [
      { id: 'ADMIN_UPLOAD_SCORES', title: '📤 Upload More'    },
      { id: 'ADMIN_REPORTS',       title: '🎓 View Results'   },
      { id: 'MAIN_MENU',           title: '🏠 Menu'           },
    ]
  );

  await sessions.setState(phone, 'ADMIN_MENU');
}

// ─── Show upload history ───────────────────────────────────────────────────
async function showUploadHistory(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: jobs } = await db
    .from('bulk_upload_jobs')
    .select(
      'file_name, total_rows, success_rows, ' +
      'failed_rows, status, created_at'
    )
    .eq('school_id', session.school_id)
    .eq('upload_type', 'students')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!jobs?.length) {
    await wa.buttons(
      phone,
      `📋 *Upload History*\n\n` +
      `No uploads yet.\n\n` +
      `Upload your first batch of students!`,
      [
        { id: 'download_template', title: '📥 Get Template' },
        { id: 'MAIN_MENU',         title: '🏠 Menu'         },
      ]
    );
    return;
  }

  const statusIcons: Record<string, string> = {
    completed:             '✅',
    processing:            '⏳',
    failed:                '❌',
    completed_with_errors: '⚠️',
    pending:               '🔄',
  };

  const lines = jobs
    .map((j) => {
      const date = new Date(j.created_at)
        .toLocaleDateString('en-NG', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
      const icon = statusIcons[j.status] ?? '•';

      return (
        `${icon} *${j.file_name ?? 'Upload'}*\n` +
        `   ✅ ${j.success_rows}/${j.total_rows} imported\n` +
        `   📅 ${date}`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `📋 *Upload History*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}`,
    [
      { id: 'download_template', title: '📤 New Upload' },
      { id: 'MAIN_MENU',         title: '🏠 Menu'       },
    ]
  );
}
