// ============================================================
// SCHOOLBOT - ADMIN FEE SETUP FLOW
// _shared/bot/admin/admin.fee.setup.ts
// ✅ Create custom fees (tuition, uniform, books, etc.)
// ✅ Bill by class, arm, or individual students
// ✅ Bulk invoice generation
// ✅ Platform commission auto-applies to all payments
// ============================================================

import { WhatsApp }      from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AdminService }  from '../../services/admin.service.ts';
import { FeesService }   from '../../services/fees.service.ts';
import { getSupabase }   from '../../supabase.ts';
import type { BotSession } from '../../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();
const feesSvc  = new FeesService();
const db       = getSupabase();

// ============================================================
// START FEE SETUP MENU
// ============================================================

export async function startFeeSetup(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    `💰 Fee Setup`,
    `Create and manage fees for your school.\n\n` +
    `All fees automatically include our\n` +
    `1.5% platform commission (added on\n` +
    `top — your school gets 100%).`,
    `Set up any fee type your school needs`,
    `💰 Fee Options`,
    [
      {
        title: 'Create Fees',
        rows: [
          {
            id:          'FEE_CREATE_TUITION',
            title:       '📚 Tuition Fee',
            description: 'Term/session school fees',
          },
          {
            id:          'FEE_CREATE_CUSTOM',
            title:       '➕ Create Custom Fee',
            description: 'Uniform, books, excursion, etc.',
          },
        ],
      },
      {
        title: 'Manage Fees',
        rows: [
          {
            id:          'FEE_LIST_ACTIVE',
            title:       '📋 View All Fees',
            description: 'See all fee structures',
          },
          {
            id:          'FEE_ONE_STUDENT',
            title:       '👤 Bill One Student',
            description: 'Custom fee for one student',
          },
          {
            id:          'FEE_TEMPLATES',
            title:       '📦 Common Fee Templates',
            description: 'Quick setup for common fees',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'ADMIN_FEE_SETUP_MENU');
}

// ============================================================
// HANDLE FEE SETUP MENU
// ============================================================

export async function handleFeeSetupMenu(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  switch (input) {
    case 'fee_create_tuition':
      await promptFeeName(phone, session, 'tuition', wa);
      break;

    case 'fee_create_custom':
      await promptFeeName(phone, session, 'custom', wa);
      break;

    case 'fee_list_active':
      await showActiveFees(phone, session, wa);
      break;

    case 'fee_one_student':
      await promptStudentForFee(phone, session, wa);
      break;

    case 'fee_templates':
      await showFeeTemplates(phone, session, wa);
      break;

    default:
      if (input.startsWith('fee_template_')) {
        await applyFeeTemplate(
          phone, session, input, wa
        );
      } else if (input.startsWith('fee_delete_')) {
        await confirmDeleteFee(
          phone, session, input, wa
        );
      } else if (input.startsWith('confirm_delete_fee_')) {
        await deleteFee(
          phone, session, input, wa
        );
      } else {
        await startFeeSetup(phone, session, wa);
      }
  }
}

// ============================================================
// STEP 1: PROMPT FOR FEE NAME
// ============================================================

async function promptFeeName(
  phone:   string,
  session: BotSession,
  feeType: 'tuition' | 'custom',
  wa:      WhatsApp
): Promise<void> {
  const examples =
    feeType === 'tuition'
      ? `_Examples:_\n` +
        `• First Term Tuition 2024/2025\n` +
        `• Second Term School Fees\n` +
        `• Third Term Fees`
      : `_Examples:_\n` +
        `• School Uniform\n` +
        `• Textbooks - JSS 1\n` +
        `• Excursion to Lekki\n` +
        `• PTA Levy\n` +
        `• Development Levy\n` +
        `• Sports Kit\n` +
        `• ID Card\n` +
        `• WAEC Registration`;

  await wa.text(
    phone,
    `📝 *Create ${
      feeType === 'tuition' ? 'Tuition' : 'Custom'
    } Fee*\n\n` +
    `Enter the fee name/title:\n\n` +
    `${examples}\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(
    phone,
    'ADMIN_FEE_ENTER_NAME',
    null,
    { data: { feeType } }
  );
}

// ─── Handle fee name input ─────────────────────────────────
export async function handleFeeName(
  phone:   string,
  session: BotSession,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const name = rawText.trim();

  if (name === '0') {
    await startFeeSetup(phone, session, wa);
    return;
  }

  if (name.length < 3) {
    await wa.text(
      phone,
      `⚠️ Fee name too short.\n\n` +
      `Please enter a proper name.\n` +
      `_Example: First Term Tuition_`
    );
    return;
  }

  await sessions.setState(
    phone,
    'ADMIN_FEE_ENTER_AMOUNT',
    null,
    { data: { ...session.data, feeName: name } }
  );

  await wa.text(
    phone,
    `💵 *${name}*\n\n` +
    `Enter the amount in Naira:\n\n` +
    `_Example: 50000 for ₦50,000_\n\n` +
    `Do not include commas or ₦ sign.\n\n` +
    `Type *0* to go back.`
  );
}

// ─── Handle amount input ───────────────────────────────────
export async function handleFeeAmount(
  phone:   string,
  session: BotSession,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const text = rawText.trim();

  if (text === '0') {
    await startFeeSetup(phone, session, wa);
    return;
  }

  const amount = parseFloat(text.replace(/,/g, ''));

  if (isNaN(amount) || amount < 100) {
    await wa.text(
      phone,
      `⚠️ Invalid amount.\n\n` +
      `Please enter a number ≥ 100.\n` +
      `_Example: 50000_`
    );
    return;
  }

  await sessions.setState(
    phone,
    'ADMIN_FEE_SELECT_TARGET',
    null,
    { data: { ...session.data, feeAmount: amount } }
  );

  const feeName =
    (session.data?.feeName as string) ?? 'Fee';

  await wa.list(
    phone,
    `🎯 Bill Target`,
    `📋 *${feeName}*\n` +
    `💵 ${feesSvc.currency(amount)}\n\n` +
    `Who should this fee apply to?`,
    `Select target group`,
    `🎯 Select Target`,
    [
      {
        title: 'Target Options',
        rows: [
          {
            id:          'TARGET_ALL_SCHOOL',
            title:       '🏫 All Students',
            description: 'Every student in school',
          },
          {
            id:          'TARGET_CLASS',
            title:       '📚 Specific Class',
            description: 'Choose a class (JSS 1, SS 2, etc.)',
          },
          {
            id:          'TARGET_CLASS_ARM',
            title:       '🎓 Specific Arm',
            description: 'Only one arm (e.g. JSS 1A)',
          },
        ],
      },
    ]
  );
}

// ─── Handle target selection ───────────────────────────────
export async function handleFeeTarget(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (input === 'target_all_school') {
    await promptDueDate(phone, session, {
      targetType: 'all',
    }, wa);
    return;
  }

  if (input === 'target_class' || input === 'target_class_arm') {
    await showClassSelector(
      phone,
      session,
      input === 'target_class_arm',
      wa
    );
    return;
  }

  if (input.startsWith('fee_target_class_')) {
    const classId = input.replace('fee_target_class_', '');
    await promptDueDate(phone, session, {
      targetType: 'class',
      classId,
    }, wa);
    return;
  }

  if (input.startsWith('fee_target_arm_')) {
    const parts   = input.replace('fee_target_arm_', '').split('_');
    const classId = parts[0];
    const armId   = parts.slice(1).join('_');
    await promptDueDate(phone, session, {
      targetType: 'arm',
      classId,
      armId,
    }, wa);
    return;
  }

  await startFeeSetup(phone, session, wa);
}

// ─── Show class selector ───────────────────────────────────
async function showClassSelector(
  phone:      string,
  session:    BotSession,
  showArms:   boolean,
  wa:         WhatsApp
): Promise<void> {
  const classes = await adminSvc.getClasses(
    session.school_id
  );

  if (!classes.length) {
    await wa.text(
      phone,
      `❌ No classes found.\n\n` +
      `Add classes first before creating fees.`
    );
    return;
  }

  const rows: Array<{
    id: string;
    title: string;
    description?: string;
  }> = [];

  for (const cls of classes as Record<string, unknown>[]) {
    const arms = cls.class_arms as Array<{
      id:   string;
      name: string;
    }> | null;

    if (showArms && arms?.length) {
      // Show each arm separately
      for (const arm of arms) {
        rows.push({
          id:          `FEE_TARGET_ARM_${cls.id}_${arm.id}`,
          title:       `${cls.name} ${arm.name}`
                         .substring(0, 24),
          description: 'Bill only this arm',
        });
      }
    } else {
      // Show class as a whole
      rows.push({
        id:          `FEE_TARGET_CLASS_${cls.id}`,
        title:       String(cls.name).substring(0, 24),
        description: 'Bill all students in this class',
      });
    }
  }

  await wa.list(
    phone,
    `📚 Select ${showArms ? 'Class Arm' : 'Class'}`,
    `Which ${
      showArms ? 'class arm' : 'class'
    } should be billed?`,
    `Tap to select`,
    `📚 Choose`,
    [{ title: 'Classes', rows: rows.slice(0, 10) }]
  );
}

// ─── Prompt for due date ───────────────────────────────────
async function promptDueDate(
  phone:   string,
  session: BotSession,
  target: {
    targetType: 'all' | 'class' | 'arm';
    classId?:   string;
    armId?:     string;
  },
  wa:      WhatsApp
): Promise<void> {
  await sessions.setState(
    phone,
    'ADMIN_FEE_ENTER_DUE_DATE',
    null,
    {
      data: {
        ...session.data,
        target,
      },
    }
  );

  const today = new Date();
  const in30  = new Date(today);
  in30.setDate(in30.getDate() + 30);
  const suggestion =
    `${in30.getDate().toString().padStart(2, '0')}/` +
    `${(in30.getMonth() + 1).toString().padStart(2, '0')}/` +
    `${in30.getFullYear()}`;

  await wa.buttons(
    phone,
    `📅 *Due Date*\n\n` +
    `When should this fee be paid by?\n\n` +
    `Enter date in DD/MM/YYYY format.\n\n` +
    `_Suggestion: ${suggestion}_ (30 days)\n\n` +
    `Or tap a quick option:`,
    [
      {
        id:    'DUE_DATE_30',
        title: '📅 In 30 days',
      },
      {
        id:    'DUE_DATE_60',
        title: '📅 In 60 days',
      },
      {
        id:    'DUE_DATE_NONE',
        title: '❌ No due date',
      },
    ]
  );
}

// ─── Handle due date ───────────────────────────────────────
export async function handleFeeDueDate(
  phone:   string,
  session: BotSession,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  let dueDate: string | null = null;

  if (input === 'due_date_none') {
    dueDate = null;
  } else if (input === 'due_date_30') {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    dueDate = d.toISOString().split('T')[0];
  } else if (input === 'due_date_60') {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    dueDate = d.toISOString().split('T')[0];
  } else {
    // Parse DD/MM/YYYY
    const text = rawText.trim();
    if (text === '0') {
      await startFeeSetup(phone, session, wa);
      return;
    }

    const match = text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

    if (!match) {
      await wa.text(
        phone,
        `⚠️ Invalid date format.\n\n` +
        `Use DD/MM/YYYY format.\n` +
        `_Example: 30/11/2024_`
      );
      return;
    }

    const [, d, m, y] = match;
    dueDate =
      `${y}-${m.padStart(2, '0')}-` +
      `${d.padStart(2, '0')}`;

    // Validate it's not in the past
    if (new Date(dueDate) < new Date()) {
      await wa.text(
        phone,
        `⚠️ Due date is in the past.\n\n` +
        `Please enter a future date.`
      );
      return;
    }
  }

  await showFeeConfirmation(
    phone, session, dueDate, wa
  );
}

// ─── Show final confirmation ───────────────────────────────
async function showFeeConfirmation(
  phone:   string,
  session: BotSession,
  dueDate: string | null,
  wa:      WhatsApp
): Promise<void> {
  const feeName =
    (session.data?.feeName as string) ?? 'Fee';
  const amount =
    (session.data?.feeAmount as number) ?? 0;
  const target = session.data?.target as {
    targetType: 'all' | 'class' | 'arm';
    classId?:   string;
    armId?:     string;
  };

  // Get target description
  let targetDesc = 'All students in school';
  let studentCount = 0;

  if (target.targetType === 'all') {
    const { count } = await db
      .from('students')
      .select('id', { count: 'exact' })
      .eq('school_id', session.school_id)
      .eq('status', 'active');
    studentCount = count ?? 0;
    targetDesc = `All ${studentCount} students`;
  } else if (target.classId) {
    let q = db
      .from('students')
      .select('id, classes(name), class_arms(name)', {
        count: 'exact',
      })
      .eq('school_id', session.school_id)
      .eq('class_id', target.classId)
      .eq('status', 'active');

    if (target.armId) {
      q = q.eq('class_arm_id', target.armId);
    }

    const { data, count } = await q;
    studentCount = count ?? 0;

    if (data?.length) {
      const first = data[0] as Record<string, unknown>;
      const cls =
        (first.classes as Record<string, string> | null)
          ?.name ?? '';
      const arm =
        target.armId
          ? (first.class_arms as
              Record<string, string> | null
            )?.name ?? ''
          : '';
      targetDesc =
        `${studentCount} students in ${cls} ${arm}`.trim();
    }
  }

  await sessions.setState(
    phone,
    'ADMIN_FEE_CONFIRM_CREATE',
    null,
    {
      data: {
        ...session.data,
        dueDate,
        studentCount,
      },
    }
  );

  const dueLabel = dueDate
    ? new Date(dueDate).toLocaleDateString('en-NG', {
        day:   'numeric',
        month: 'long',
        year:  'numeric',
      })
    : 'No due date';

  const totalRevenue = amount * studentCount;

  await wa.buttons(
    phone,
    `📋 *Confirm Fee Creation*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📝 *Name:* ${feeName}\n` +
    `💵 *Amount:* ${feesSvc.currency(amount)}\n` +
    `🎯 *Target:* ${targetDesc}\n` +
    `📅 *Due Date:* ${dueLabel}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 *Expected Revenue:*\n` +
    `${feesSvc.currency(totalRevenue)}\n\n` +
    `_(if all ${studentCount} students pay)_\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `⚡ *What happens next:*\n` +
    `1. Fee structure created\n` +
    `2. Invoices generated for ${studentCount} students\n` +
    `3. Parents can see & pay immediately\n` +
    `4. 1.5% platform fee added on top\n` +
    `5. School gets 100% of the fee`,
    [
      {
        id:    'FEE_CONFIRM_CREATE',
        title: '✅ Create & Bill',
      },
      {
        id:    'ADMIN_FEE_SETUP',
        title: '❌ Cancel',
      },
    ]
  );
}

// ─── Create fee and generate invoices ──────────────────────
export async function confirmCreateFee(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const feeName =
    (session.data?.feeName as string) ?? 'Fee';
  const amount =
    (session.data?.feeAmount as number) ?? 0;
  const dueDate =
    session.data?.dueDate as string | null;
  const target = session.data?.target as {
    targetType: 'all' | 'class' | 'arm';
    classId?:   string;
    armId?:     string;
  };
  const feeType =
    (session.data?.feeType as string) ?? 'custom';

  await wa.text(
    phone,
    `⏳ *Creating fee and generating invoices...*\n\n` +
    `This may take a moment for large classes.`
  );

  try {
    // Get current term and academic year
    const { data: term } = await db
      .from('terms')
      .select('id, academic_year_id')
      .eq('school_id', session.school_id)
      .eq('is_current', true)
      .maybeSingle();

    // Create fee structure
    const { data: feeStructure, error: feeError } = await db
      .from('fee_structures')
      .insert({
        school_id:        session.school_id,
        title:            feeName,
        amount,
        due_date:         dueDate,
        term_id:          term?.id ?? null,
        academic_year_id: term?.academic_year_id ?? null,
        fee_type:         feeType,
        is_active:        true,
        applies_to:       target.targetType,
        target_class_id:  target.classId ?? null,
        target_arm_id:    target.armId ?? null,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .select('id')
      .single();

    if (feeError || !feeStructure) {
      throw new Error(
        `Fee creation failed: ${feeError?.message}`
      );
    }

    // Get target students
    let studentQuery = db
      .from('students')
      .select('id')
      .eq('school_id', session.school_id)
      .eq('status', 'active');

    if (target.classId) {
      studentQuery = studentQuery.eq(
        'class_id', target.classId
      );
    }
    if (target.armId) {
      studentQuery = studentQuery.eq(
        'class_arm_id', target.armId
      );
    }

    const { data: students } = await studentQuery;

    if (!students?.length) {
      await wa.buttons(
        phone,
        `⚠️ *No students to bill*\n\n` +
        `Fee structure was created but there\n` +
        `are no active students matching\n` +
        `your target.\n\n` +
        `The fee will apply automatically to\n` +
        `any new students added.`,
        [
          { id: 'ADMIN_FEE_SETUP', title: '➕ Create Another' },
          { id: 'MAIN_MENU',       title: '🏠 Menu'          },
        ]
      );
      return;
    }

    // Generate invoices in bulk
    const now = new Date().toISOString();
    const invoiceInserts = students.map((s, i) => ({
      school_id:        session.school_id,
      student_id:       s.id,
      fee_structure_id: feeStructure.id,
      invoice_number:
        `INV-${Date.now().toString(36).toUpperCase()}-${i + 1}`,
      amount,
      amount_paid:      0,
      balance:          amount,
      status:           'Pending',
      due_date:         dueDate,
      created_at:       now,
      updated_at:       now,
    }));

    // Insert in chunks of 500
    const CHUNK = 500;
    let inserted = 0;

    for (let i = 0; i < invoiceInserts.length; i += CHUNK) {
      const chunk = invoiceInserts.slice(i, i + CHUNK);
      const { error: invError } = await db
        .from('student_invoices')
        .insert(chunk);

      if (invError) {
        console.error(
          '[FeeSetup] Invoice insert error:',
          invError.message
        );
      } else {
        inserted += chunk.length;
      }
    }

    // Log action
    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'create_fee_structure',
      {
        fee_id:      feeStructure.id,
        fee_name:    feeName,
        amount,
        target_type: target.targetType,
        invoices:    inserted,
      }
    );

    const totalRevenue = amount * inserted;

    await wa.buttons(
      phone,
      `🎉 *Fee Created Successfully!*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `📝 *${feeName}*\n` +
      `💵 ${feesSvc.currency(amount)}\n\n` +
      `📊 *Results:*\n` +
      `✅ Invoices created: *${inserted}*\n` +
      `👥 Students billed: *${inserted}*\n` +
      `💰 Expected revenue: *${feesSvc.currency(totalRevenue)}*\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Parents can now see and pay\n` +
      `this fee on WhatsApp!\n\n` +
      `Reminders will be sent as the\n` +
      `due date approaches. 📱`,
      [
        { id: 'ADMIN_FEE_SETUP', title: '➕ Create Another' },
        { id: 'ADMIN_BROADCAST', title: '📢 Notify Parents' },
        { id: 'MAIN_MENU',       title: '🏠 Menu'           },
      ]
    );

    await sessions.setState(
      phone, 'ADMIN_FEE_SETUP_MENU'
    );
  } catch (err) {
    console.error(
      '[FeeSetup] Create fee error:', err
    );
    await wa.text(
      phone,
      `❌ *Failed to create fee*\n\n` +
      `Error: ${
        err instanceof Error
          ? err.message
          : String(err)
      }\n\n` +
      `Please try again.`
    );
  }
}

// ============================================================
// LIST ACTIVE FEES
// ============================================================

async function showActiveFees(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: fees } = await db
    .from('fee_structures')
    .select(`
      id, title, amount, due_date,
      fee_type, is_active, applies_to,
      created_at
    `)
    .eq('school_id', session.school_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!fees?.length) {
    await wa.buttons(
      phone,
      `📋 *No Active Fees*\n\n` +
      `You have not created any fees yet.\n\n` +
      `Create your first fee to start\n` +
      `billing students!`,
      [
        { id: 'FEE_CREATE_TUITION', title: '📚 Tuition Fee' },
        { id: 'FEE_CREATE_CUSTOM',  title: '➕ Custom Fee'  },
      ]
    );
    return;
  }

  const rows = fees.slice(0, 9).map((fee) => {
    const dueText = fee.due_date
      ? ` • Due: ${new Date(fee.due_date)
          .toLocaleDateString('en-NG', {
            day:   'numeric',
            month: 'short',
          })}`
      : '';
    return {
      id:          `FEE_VIEW_${fee.id}`,
      title:       String(fee.title).substring(0, 24),
      description:
        `${feesSvc.currency(
          parseFloat(String(fee.amount))
        )}${dueText}`,
    };
  });

  await wa.list(
    phone,
    `📋 Active Fees`,
    `Your school has *${fees.length}* active fee(s).\n\n` +
    `Select a fee to view or manage:`,
    `Tap a fee to view options`,
    `📋 View Fees`,
    [{ title: 'Fee Structures', rows }]
  );

  await sessions.setState(
    phone, 'ADMIN_FEE_VIEW_LIST'
  );
}

// ============================================================
// BILL ONE STUDENT — Custom fee for individual
// ============================================================

async function promptStudentForFee(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `👤 *Bill One Student*\n\n` +
    `Search for the student to bill:\n\n` +
    `Type student name or admission number.\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(
    phone, 'ADMIN_FEE_SEARCH_STUDENT'
  );
}

// ─── Handle student search for individual bill ─────────────
export async function handleStudentSearchForFee(
  phone:      string,
  session:    BotSession,
  searchText: string,
  wa:         WhatsApp
): Promise<void> {
  const text = searchText.trim();

  if (text === '0') {
    await startFeeSetup(phone, session, wa);
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
        { id: 'FEE_ONE_STUDENT', title: '🔍 Search Again' },
        { id: 'ADMIN_FEE_SETUP', title: '↩️ Back'         },
      ]
    );
    return;
  }

  if (results.length === 1) {
    await promptIndividualFeeName(
      phone, session, results[0].id, wa
    );
    return;
  }

  const rows = results.map((s) => ({
    id:          `FEE_STUDENT_${s.id}`,
    title:       s.full_name.substring(0, 24),
    description:
      `${s.class_name} ${s.arm_name} • ` +
      `${s.admission_number}`,
  }));

  await wa.list(
    phone,
    `🔍 Search Results`,
    `Found *${results.length}* students.\n\n` +
    `Select one to bill:`,
    `Tap to select`,
    `👤 Select Student`,
    [{ title: 'Students', rows }]
  );

  await sessions.setState(
    phone, 'ADMIN_FEE_SELECT_STUDENT'
  );
}

// ─── Handle student selection for individual fee ───────────
export async function handleStudentSelectForFee(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('fee_student_')) {
    await startFeeSetup(phone, session, wa);
    return;
  }

  const studentId = input.replace('fee_student_', '');
  await promptIndividualFeeName(
    phone, session, studentId, wa
  );
}

// ─── Prompt fee name for individual student ────────────────
async function promptIndividualFeeName(
  phone:     string,
  session:   BotSession,
  studentId: string,
  wa:        WhatsApp
): Promise<void> {
  const { data: student } = await db
    .from('students')
    .select('first_name, last_name, admission_number')
    .eq('id', studentId)
    .maybeSingle();

  if (!student) {
    await wa.text(phone, `❌ Student not found.`);
    return;
  }

  await sessions.setState(
    phone,
    'ADMIN_FEE_IND_ENTER_NAME',
    null,
    {
      data: {
        individualStudentId: studentId,
        studentName:
          `${student.first_name} ${student.last_name}`,
      },
    }
  );

  await wa.text(
    phone,
    `👤 *${student.first_name} ${student.last_name}*\n` +
    `📋 ${student.admission_number}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📝 What is this fee for?\n\n` +
    `_Examples:_\n` +
    `• Late Registration Fee\n` +
    `• Damaged Book Replacement\n` +
    `• Extra Lesson Fee\n` +
    `• Uniform Replacement\n\n` +
    `Type the fee name or *0* to go back.`
  );
}

// ─── Handle individual fee name ────────────────────────────
export async function handleIndividualFeeName(
  phone:   string,
  session: BotSession,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const name = rawText.trim();

  if (name === '0') {
    await startFeeSetup(phone, session, wa);
    return;
  }

  if (name.length < 3) {
    await wa.text(
      phone,
      `⚠️ Fee name too short.\n\n` +
      `Please enter a proper name.`
    );
    return;
  }

  await sessions.setState(
    phone,
    'ADMIN_FEE_IND_ENTER_AMOUNT',
    null,
    { data: { ...session.data, feeName: name } }
  );

  await wa.text(
    phone,
    `💵 *${name}*\n\n` +
    `Enter the amount in Naira:\n\n` +
    `_Example: 5000 for ₦5,000_`
  );
}

// ─── Handle individual fee amount ──────────────────────────
export async function handleIndividualFeeAmount(
  phone:   string,
  session: BotSession,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const text = rawText.trim();

  if (text === '0') {
    await startFeeSetup(phone, session, wa);
    return;
  }

  const amount = parseFloat(text.replace(/,/g, ''));

  if (isNaN(amount) || amount < 100) {
    await wa.text(
      phone,
      `⚠️ Invalid amount. Minimum is ₦100.\n\n` +
      `Please try again.`
    );
    return;
  }

  const feeName =
    (session.data?.feeName as string) ?? 'Fee';
  const studentName =
    (session.data?.studentName as string) ?? 'Student';

  await sessions.setState(
    phone,
    'ADMIN_FEE_IND_CONFIRM',
    null,
    { data: { ...session.data, feeAmount: amount } }
  );

  await wa.buttons(
    phone,
    `📋 *Confirm Individual Bill*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `👤 *${studentName}*\n` +
    `📝 *Fee:* ${feeName}\n` +
    `💵 *Amount:* ${feesSvc.currency(amount)}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ Parent will see this fee\n` +
    `immediately on WhatsApp.\n\n` +
    `Proceed?`,
    [
      { id: 'IND_FEE_CONFIRM', title: '✅ Create Invoice' },
      { id: 'ADMIN_FEE_SETUP', title: '❌ Cancel'         },
    ]
  );
}

// ─── Create individual invoice ─────────────────────────────
export async function confirmIndividualFee(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const studentId =
    session.data?.individualStudentId as string;
  const studentName =
    (session.data?.studentName as string) ?? 'Student';
  const feeName =
    (session.data?.feeName as string) ?? 'Fee';
  const amount =
    (session.data?.feeAmount as number) ?? 0;

  await wa.text(
    phone, `⏳ Creating invoice...`
  );

  try {
    // Create fee structure for this specific fee
    const { data: term } = await db
      .from('terms')
      .select('id, academic_year_id')
      .eq('school_id', session.school_id)
      .eq('is_current', true)
      .maybeSingle();

    const { data: feeStructure } = await db
      .from('fee_structures')
      .insert({
        school_id:        session.school_id,
        title:            feeName,
        amount,
        due_date:         null,
        term_id:          term?.id ?? null,
        academic_year_id: term?.academic_year_id ?? null,
        fee_type:         'individual',
        is_active:        true,
        applies_to:       'individual',
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!feeStructure) {
      throw new Error('Fee structure creation failed');
    }

    // Create invoice
    await db.from('student_invoices').insert({
      school_id:        session.school_id,
      student_id:       studentId,
      fee_structure_id: feeStructure.id,
      invoice_number:
        `INV-${Date.now().toString(36).toUpperCase()}`,
      amount,
      amount_paid:      0,
      balance:          amount,
      status:           'Pending',
      due_date:         null,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    });

    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'create_individual_fee',
      {
        student_id: studentId,
        fee_name:   feeName,
        amount,
      }
    );

    await wa.buttons(
      phone,
      `✅ *Invoice Created!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${studentName}*\n` +
      `📝 ${feeName}\n` +
      `💵 ${feesSvc.currency(amount)}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Parent can now see and pay\n` +
      `this fee on WhatsApp! 📱`,
      [
        { id: 'FEE_ONE_STUDENT', title: '➕ Bill Another' },
        { id: 'ADMIN_FEE_SETUP', title: '💰 Fee Menu'    },
        { id: 'MAIN_MENU',       title: '🏠 Menu'         },
      ]
    );

    await sessions.setState(
      phone, 'ADMIN_FEE_SETUP_MENU'
    );
  } catch (err) {
    console.error(
      '[FeeSetup] Individual fee error:', err
    );
    await wa.text(
      phone,
      `❌ Failed to create invoice.\n\n` +
      `Error: ${
        err instanceof Error
          ? err.message
          : String(err)
      }`
    );
  }
}

// ============================================================
// FEE TEMPLATES — Quick common fees
// ============================================================

async function showFeeTemplates(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    `📦 Fee Templates`,
    `Common fees Nigerian schools charge.\n\n` +
    `Tap one to quickly set up:`,
    `Amounts are suggestions — edit anytime`,
    `📦 Templates`,
    [
      {
        title: 'Academic Fees',
        rows: [
          {
            id:          'FEE_TEMPLATE_tuition',
            title:       '📚 Tuition Fee',
            description: 'Suggested: ₦50,000',
          },
          {
            id:          'FEE_TEMPLATE_pta',
            title:       '👥 PTA Levy',
            description: 'Suggested: ₦5,000',
          },
          {
            id:          'FEE_TEMPLATE_development',
            title:       '🏗️ Development Levy',
            description: 'Suggested: ₦10,000',
          },
        ],
      },
      {
        title: 'Physical Items',
        rows: [
          {
            id:          'FEE_TEMPLATE_uniform',
            title:       '👕 School Uniform',
            description: 'Suggested: ₦15,000',
          },
          {
            id:          'FEE_TEMPLATE_books',
            title:       '📖 Textbooks',
            description: 'Suggested: ₦20,000',
          },
          {
            id:          'FEE_TEMPLATE_idcard',
            title:       '🪪 ID Card',
            description: 'Suggested: ₦1,000',
          },
        ],
      },
      {
        title: 'Activities',
        rows: [
          {
            id:          'FEE_TEMPLATE_excursion',
            title:       '🚌 Excursion',
            description: 'Suggested: ₦8,000',
          },
          {
            id:          'FEE_TEMPLATE_sports',
            title:       '⚽ Sports Kit',
            description: 'Suggested: ₦5,000',
          },
        ],
      },
    ]
  );
}

// ─── Apply fee template ────────────────────────────────────
async function applyFeeTemplate(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const templateKey =
    input.replace('fee_template_', '');

  const templates: Record<string, {
    name:   string;
    amount: number;
    type:   string;
  }> = {
    tuition: {
      name:   'Term Tuition Fee',
      amount: 50000,
      type:   'tuition',
    },
    pta: {
      name:   'PTA Levy',
      amount: 5000,
      type:   'custom',
    },
    development: {
      name:   'Development Levy',
      amount: 10000,
      type:   'custom',
    },
    uniform: {
      name:   'School Uniform',
      amount: 15000,
      type:   'custom',
    },
    books: {
      name:   'Textbooks',
      amount: 20000,
      type:   'custom',
    },
    idcard: {
      name:   'ID Card',
      amount: 1000,
      type:   'custom',
    },
    excursion: {
      name:   'Excursion',
      amount: 8000,
      type:   'custom',
    },
    sports: {
      name:   'Sports Kit',
      amount: 5000,
      type:   'custom',
    },
  };

  const template = templates[templateKey];
  if (!template) {
    await startFeeSetup(phone, session, wa);
    return;
  }

  // Pre-fill and jump to amount step (allow editing)
  await sessions.setState(
    phone,
    'ADMIN_FEE_ENTER_AMOUNT',
    null,
    {
      data: {
        feeType: template.type,
        feeName: template.name,
      },
    }
  );

  await wa.text(
    phone,
    `📦 *Template: ${template.name}*\n\n` +
    `Enter the amount (or use suggested):\n\n` +
    `💡 Suggested: *${feesSvc.currency(template.amount)}*\n\n` +
    `Type the amount or type *${template.amount}*\n` +
    `to use the suggested amount.\n\n` +
    `Type *0* to go back.`
  );
}

// ============================================================
// DELETE FEE
// ============================================================

async function confirmDeleteFee(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const feeId = input.replace('fee_delete_', '');

  const { data: fee } = await db
    .from('fee_structures')
    .select('title, amount')
    .eq('id', feeId)
    .maybeSingle();

  if (!fee) {
    await wa.text(phone, `❌ Fee not found.`);
    return;
  }

  const { count } = await db
    .from('student_invoices')
    .select('id', { count: 'exact' })
    .eq('fee_structure_id', feeId)
    .not('status', 'in', '("Paid","paid")');

  await wa.buttons(
    phone,
    `🗑️ *Delete Fee?*\n\n` +
    `📝 *${fee.title}*\n` +
    `💵 ${feesSvc.currency(
      parseFloat(String(fee.amount))
    )}\n\n` +
    `⚠️ This will deactivate ${count ?? 0} unpaid\n` +
    `invoices. Paid invoices remain.\n\n` +
    `This cannot be undone.`,
    [
      {
        id:    `CONFIRM_DELETE_FEE_${feeId}`,
        title: '✅ Yes, Delete',
      },
      {
        id:    'FEE_LIST_ACTIVE',
        title: '❌ Cancel',
      },
    ]
  );
}

async function deleteFee(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const feeId =
    input.replace('confirm_delete_fee_', '');

  await db
    .from('fee_structures')
    .update({
      is_active:  false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', feeId);

  await db
    .from('student_invoices')
    .update({
      status:     'Cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('fee_structure_id', feeId)
    .not('status', 'in', '("Paid","paid")');

  await wa.buttons(
    phone,
    `✅ *Fee Deleted*\n\n` +
    `Unpaid invoices have been cancelled.\n` +
    `Paid records are preserved.`,
    [
      { id: 'FEE_LIST_ACTIVE', title: '📋 View Fees' },
      { id: 'ADMIN_FEE_SETUP', title: '💰 Fee Menu'  },
      { id: 'MAIN_MENU',       title: '🏠 Menu'       },
    ]
  );

  await sessions.setState(
    phone, 'ADMIN_FEE_SETUP_MENU'
  );
}
