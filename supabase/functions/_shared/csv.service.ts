// ============================================================
// SCHOOLBOT - CSV SERVICE
// supabase/functions/_shared/csv.service.ts
// ✅ Fixed: Auto-creates classes if they don't exist
// ✅ Fixed: Auto-creates arms A, B, C based on CSV data
// ✅ Fixed: Class name normalization (JSS1 → JSS 1)
// ✅ Fixed: Arm auto-detection from CSV
// ============================================================

import { getSupabase } from './supabase.ts';

const db = getSupabase();

// ─── Expected CSV column headers ──────────────────────────────
export const STUDENT_CSV_HEADERS = [
  'first_name',
  'last_name',
  'admission_number',
  'class_name',
  'class_arm',
  'gender',
  'date_of_birth',
  'parent_name',
  'parent_phone',
  'parent_email',
  'blood_group',
  'medical_notes',
];

// ─── Types ────────────────────────────────────────────────────
export type UploadResult = {
  success:    boolean;
  total:      number;
  created:    number;
  updated:    number;
  failed:     number;
  errors:     Array<{
    row:     number;
    field:   string;
    message: string;
  }>;
  studentIds: string[];
};

export type ParsedStudent = {
  first_name:       string;
  last_name:        string;
  admission_number: string;
  class_name:       string;
  class_arm:        string;
  gender:           string | null;
  date_of_birth:    string | null;
  parent_name:      string | null;
  parent_phone:     string | null;
  parent_email:     string | null;
  blood_group:      string | null;
  medical_notes:    string | null;
};

export type BulkUploadStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

// ─── Score CSV ──────────────────────────────────────────────────
export const SCORE_CSV_HEADERS = [
  'admission_number',
  'subject',
  'ca_score',
  'exam_score',
];

export type ScoreUploadResult = {
  success: boolean;
  total:   number;
  created: number;
  updated: number;
  failed:  number;
  errors:  Array<{
    row:     number;
    field:   string;
    message: string;
  }>;
};

// ============================================================
// CLASS NAME NORMALIZER
// ✅ Converts JSS1 → JSS 1, SS2 → SS 2, etc.
// ✅ Handles common Nigerian school class name formats
// ============================================================

function normalizeClassName(raw: string): string {
  const name = raw.trim();

  // Already has a space — return as-is
  if (/\s/.test(name)) return name;

  // Pattern: letters followed by digits
  // e.g. JSS1 → JSS 1, SS2 → SS 2, KG1 → KG 1
  const match = name.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    return `${match[1].toUpperCase()} ${match[2]}`;
  }

  return name;
}

// ============================================================
// AUTO-CREATE CLASS
// ✅ Creates class + arms if not found
// ✅ Returns { id, arms } for the class
// ============================================================

async function getOrCreateClass(
  schoolId:  string,
  className: string,
  armName:   string,
  classMap:  Map<string, { id: string; arms: Map<string, string> }>
): Promise<{
  classId: string;
  armId:   string | null;
}> {
  const classKey = className.toUpperCase();
  const armKey   = (armName || 'A').toUpperCase();

  // Check cache first
  const cached = classMap.get(classKey);
  if (cached) {
    // Class exists — check if arm exists
    let armId = cached.arms.get(armKey) ?? null;

    if (!armId) {
      // Arm doesn't exist yet — create it
      console.log(
        `[CSV] Creating arm "${armName}" ` +
        `for class "${className}"`
      );

      const { data: newArm } = await db
        .from('class_arms')
        .insert({
          class_id:   cached.id,
          name:       armName || 'A',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (newArm) {
        armId = newArm.id;
        cached.arms.set(armKey, armId);
      }
    }

    return { classId: cached.id, armId };
  }

  // Class doesn't exist — create it
  console.log(
    `[CSV] Auto-creating class "${className}" ` +
    `for school: ${schoolId}`
  );

  // Determine level from class name
  // This is best-effort ordering
  const level = inferClassLevel(className);

  const { data: newClass, error: classError } = await db
    .from('classes')
    .insert({
      school_id:  schoolId,
      name:       className,
      level,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (classError || !newClass) {
    console.error(
      `[CSV] Failed to create class "${className}":`,
      classError?.message
    );
    // Try to find it — might be a race condition
    const { data: existing } = await db
      .from('classes')
      .select('id')
      .eq('school_id', schoolId)
      .ilike('name', className)
      .maybeSingle();

    if (existing) {
      const armsMap = new Map<string, string>();
      classMap.set(classKey, {
        id:   existing.id,
        arms: armsMap,
      });
      return { classId: existing.id, armId: null };
    }

    throw new Error(
      `Could not create class "${className}": ` +
      `${classError?.message}`
    );
  }

  // Create the arms for this class
  // Always create A, B, C by default
  const defaultArms = ['A', 'B', 'C'];
  const armInserts  = defaultArms.map((a) => ({
    class_id:   newClass.id,
    name:       a,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { data: insertedArms } = await db
    .from('class_arms')
    .insert(armInserts)
    .select('id, name');

  const armsMap = new Map<string, string>();
  for (const arm of insertedArms ?? []) {
    armsMap.set(arm.name.toUpperCase(), arm.id);
  }

  // Update cache
  classMap.set(classKey, {
    id:   newClass.id,
    arms: armsMap,
  });

  console.log(
    `[CSV] ✅ Created class "${className}" ` +
    `with arms A, B, C`
  );

  const armId = armsMap.get(armKey) ?? null;
  return { classId: newClass.id, armId };
}

// ─── Infer class level from name ──────────────────────────────
// Used for ordering classes in the admin UI
function inferClassLevel(className: string): number {
  const name = className.toUpperCase().trim();

  // Nursery / Crèche
  if (name.includes('CRECHE') || name.includes('CRÈCHE'))
    return 1;
  if (name.includes('NURSERY 1') || name === 'N1') return 2;
  if (name.includes('NURSERY 2') || name === 'N2') return 3;
  if (name.includes('KG 1') || name === 'KG1') return 4;
  if (name.includes('KG 2') || name === 'KG2') return 5;

  // Primary
  if (name.includes('PRIMARY 1') || name === 'P1') return 6;
  if (name.includes('PRIMARY 2') || name === 'P2') return 7;
  if (name.includes('PRIMARY 3') || name === 'P3') return 8;
  if (name.includes('PRIMARY 4') || name === 'P4') return 9;
  if (name.includes('PRIMARY 5') || name === 'P5') return 10;
  if (name.includes('PRIMARY 6') || name === 'P6') return 11;

  // JSS
  if (name.includes('JSS 1') || name === 'JSS1') return 12;
  if (name.includes('JSS 2') || name === 'JSS2') return 13;
  if (name.includes('JSS 3') || name === 'JSS3') return 14;

  // SS
  if (name.includes('SS 1') || name === 'SS1') return 15;
  if (name.includes('SS 2') || name === 'SS2') return 16;
  if (name.includes('SS 3') || name === 'SS3') return 17;

  // Default — put at end
  return 99;
}

export class CSVService {

  // ─── Generate CSV template ───────────────────────────────────
  generateTemplate(): string {
    const headers = STUDENT_CSV_HEADERS.join(',');

    const example = [
      'John',
      'Doe',
      'ADM/2024/001',
      'JSS 1',
      'A',
      'Male',
      '15/03/2012',
      'Mrs. Jane Doe',
      '08012345678',
      'jane@email.com',
      'O+',
      '',
    ].join(',');

    const example2 = [
      'Amara',
      'Okafor',
      'ADM/2024/002',
      'Primary 3',
      'B',
      'Female',
      '20/07/2014',
      'Mr. Chidi Okafor',
      '08087654321',
      '',
      'A+',
      'Allergic to peanuts',
    ].join(',');

    return (
      headers + '\n' + example + '\n' + example2 + '\n'
    );
  }

  // ─── Parse CSV text into rows ────────────────────────────────
  parseCSV(
    csvText: string,
    requiredHeaders: string[] = [
      'first_name',
      'last_name',
      'admission_number',
      'class_name',
    ]
  ): {
    headers: string[];
    rows:    Record<string, string>[];
    errors:  string[];
  } {
    const errors: string[] = [];

    const normalized = csvText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const lines = normalized
      .split('\n')
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return {
        headers: [],
        rows:    [],
        errors:  ['File is empty'],
      };
    }

    if (lines.length === 1) {
      return {
        headers: [],
        rows:    [],
        errors:  ['File has headers but no data rows'],
      };
    }

    const headers = this.parseLine(lines[0]).map((h) =>
      h.toLowerCase().trim().replace(/\s+/g, '_')
    );

    const missing = requiredHeaders.filter(
      (r) => !headers.includes(r)
    );

    if (missing.length > 0) {
      errors.push(
        `Missing required columns: ${missing.join(', ')}. ` +
        `Please use the template.`
      );
    }

    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseLine(line);
      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = (values[index] ?? '').trim();
      });

      rows.push(row);
    }

    return { headers, rows, errors };
  }

  // ─── Parse a single CSV line ─────────────────────────────────
  private parseLine(line: string): string[] {
    const result: string[] = [];
    let current  = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  // ─── Import students from parsed rows ───────────────────────
  // ✅ Fixed: Auto-creates classes if they don't exist
  // ✅ Fixed: Normalizes class names (JSS1 → JSS 1)
  // ✅ Fixed: Auto-creates arms A, B, C for new classes
  async importStudents(
    schoolId: string,
    rows:     Record<string, string>[],
    jobId:    string
  ): Promise<UploadResult> {
    const result: UploadResult = {
      success:    true,
      total:      rows.length,
      created:    0,
      updated:    0,
      failed:     0,
      errors:     [],
      studentIds: [],
    };

    // ── Cache existing classes ──────────────────────────────
    const { data: classes } = await db
      .from('classes')
      .select('id, name, class_arms(id, name)')
      .eq('school_id', schoolId);

    // Build class map keyed by UPPERCASE name
    const classMap = new Map<
      string,
      { id: string; arms: Map<string, string> }
    >();

    for (const cls of classes ?? []) {
      const arms = new Map<string, string>();
      const clsArms = cls.class_arms as Array<{
        id:   string;
        name: string;
      }> | null;

      for (const arm of clsArms ?? []) {
        arms.set(arm.name.toUpperCase(), arm.id);
      }

      classMap.set(cls.name.toUpperCase(), {
        id:   cls.id,
        arms,
      });
    }

    console.log(
      `[CSV] Starting import: ` +
      `${rows.length} rows | ` +
      `${classMap.size} existing classes`
    );

    // ── Process each row ────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const row       = rows[i];
      const rowNumber = i + 2;

      try {
        // ── Validate required fields ──────────────────────
        if (!row.first_name?.trim()) {
          result.errors.push({
            row:     rowNumber,
            field:   'first_name',
            message: 'First name is required',
          });
          result.failed++;
          continue;
        }

        if (!row.last_name?.trim()) {
          result.errors.push({
            row:     rowNumber,
            field:   'last_name',
            message: 'Last name is required',
          });
          result.failed++;
          continue;
        }

        if (!row.admission_number?.trim()) {
          result.errors.push({
            row:     rowNumber,
            field:   'admission_number',
            message: 'Admission number is required',
          });
          result.failed++;
          continue;
        }

        if (!row.class_name?.trim()) {
          result.errors.push({
            row:     rowNumber,
            field:   'class_name',
            message: 'Class name is required',
          });
          result.failed++;
          continue;
        }

        // ── Normalize class name ──────────────────────────
        // Converts JSS1 → JSS 1, SS2 → SS 2, etc.
        const rawClassName    = row.class_name.trim();
        const className       =
          normalizeClassName(rawClassName);
        const rawArmName      = row.class_arm?.trim() ?? 'A';
        const armName         =
          rawArmName.toUpperCase() || 'A';

        console.log(
          `[CSV] Row ${rowNumber}: ` +
          `class="${rawClassName}" → ` +
          `normalized="${className}" | ` +
          `arm="${armName}"`
        );

        // ── Get or auto-create class ──────────────────────
        // ✅ This is the key fix — if class doesn't exist
        // it gets created automatically
        let classId: string;
        let armId:   string | null;

        try {
          const result_ = await getOrCreateClass(
            schoolId,
            className,
            armName,
            classMap
          );
          classId = result_.classId;
          armId   = result_.armId;
        } catch (classErr) {
          result.errors.push({
            row:     rowNumber,
            field:   'class_name',
            message: `Could not create class "${className}": ` +
              `${
                classErr instanceof Error
                  ? classErr.message
                  : String(classErr)
              }`,
          });
          result.failed++;
          continue;
        }

        // ── Parse date of birth ───────────────────────────
        let dateOfBirth: string | null = null;
        if (row.date_of_birth?.trim()) {
          dateOfBirth =
            this.parseDate(row.date_of_birth.trim());
        }

        // ── Check if student already exists ───────────────
        const { data: existing } = await db
          .from('students')
          .select('id')
          .eq('school_id', schoolId)
          .eq(
            'admission_number',
            row.admission_number.trim()
          )
          .single();

        const studentData = {
          school_id:        schoolId,
          first_name:       this.capitalize(
            row.first_name.trim()
          ),
          last_name:        this.capitalize(
            row.last_name.trim()
          ),
          admission_number: row.admission_number
            .trim()
            .toUpperCase(),
          class_id:         classId,
          class_arm_id:     armId,
          gender:           row.gender?.trim() || null,
          date_of_birth:    dateOfBirth,
          blood_group:      row.blood_group?.trim() || null,
          medical_notes:    row.medical_notes?.trim() || null,
          status:           'active',
          updated_at:       new Date().toISOString(),
        };

        let studentId: string;

        if (existing) {
          // ── Update existing student ───────────────────
          await db
            .from('students')
            .update(studentData)
            .eq('id', existing.id);
          studentId = existing.id;
          result.updated++;
        } else {
          // ── Create new student ────────────────────────
          const {
            data:  newStudent,
            error: insertError,
          } = await db
            .from('students')
            .insert({
              ...studentData,
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (insertError || !newStudent) {
            throw new Error(
              insertError?.message ??
              'Student insert failed'
            );
          }

          studentId = newStudent.id;
          result.created++;
        }

        result.studentIds.push(studentId);

        // ── Upsert parent if phone provided ───────────────
        if (
          row.parent_name?.trim() &&
          row.parent_phone?.trim()
        ) {
          await this.upsertParent(schoolId, studentId, {
            full_name: row.parent_name.trim(),
            phone:     this.formatPhone(
              row.parent_phone.trim()
            ),
            email:     row.parent_email?.trim() || null,
          });
        }

        // ── Progress update every 10 rows ─────────────────
        if (i % 10 === 0) {
          await db
            .from('bulk_upload_jobs')
            .update({
              processed_rows: i + 1,
              success_rows:
                result.created + result.updated,
              failed_rows: result.failed,
            })
            .eq('id', jobId);
        }

      } catch (err) {
        console.error(
          `[CSV] Row ${rowNumber} error:`,
          err instanceof Error ? err.message : String(err)
        );
        result.errors.push({
          row:     rowNumber,
          field:   'general',
          message: err instanceof Error
            ? err.message
            : String(err),
        });
        result.failed++;
      }
    }

    // ── Final status ────────────────────────────────────────
    let finalStatus: BulkUploadStatus = 'completed';
    if (result.failed === result.total) {
      finalStatus = 'failed';
    } else if (result.failed > 0) {
      finalStatus = 'completed_with_errors';
    }

    await db
      .from('bulk_upload_jobs')
      .update({
        processed_rows: rows.length,
        success_rows:
          result.created + result.updated,
        failed_rows:    result.failed,
        status:         finalStatus,
        errors:         result.errors.slice(0, 50),
        result_summary: {
          total:   result.total,
          created: result.created,
          updated: result.updated,
          failed:  result.failed,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(
      `[CSV] Import complete:\n` +
      `  total:   ${result.total}\n` +
      `  created: ${result.created}\n` +
      `  updated: ${result.updated}\n` +
      `  failed:  ${result.failed}`
    );

    return result;
  }

  // ─── Generate score CSV template ─────────────────────────────
  generateScoreTemplate(): string {
    const headers = SCORE_CSV_HEADERS.join(',');

    const example = [
      'ADM/2024/001',
      'Mathematics',
      '28',
      '65',
    ].join(',');

    const example2 = [
      'ADM/2024/001',
      'English Language',
      '25',
      '60',
    ].join(',');

    return (
      headers + '\n' + example + '\n' + example2 + '\n'
    );
  }

  // ─── Import scores from parsed rows ──────────────────────────
  async importScores(
    schoolId: string,
    termId:   string,
    rows:     Record<string, string>[],
    jobId:    string
  ): Promise<ScoreUploadResult> {
    const result: ScoreUploadResult = {
      success: true,
      total:   rows.length,
      created: 0,
      updated: 0,
      failed:  0,
      errors:  [],
    };

    // Cache students by admission number
    const { data: students } = await db
      .from('students')
      .select('id, admission_number')
      .eq('school_id', schoolId);

    const studentMap = new Map<string, string>();
    for (const s of students ?? []) {
      studentMap.set(
        String(s.admission_number).trim().toUpperCase(),
        s.id
      );
    }

    // Cache subjects by name — create on the fly if missing
    const { data: subjects } = await db
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId);

    const subjectMap = new Map<string, string>();
    for (const sub of subjects ?? []) {
      subjectMap.set(
        String(sub.name).trim().toUpperCase(),
        sub.id
      );
    }

    for (let i = 0; i < rows.length; i++) {
      const row       = rows[i];
      const rowNumber = i + 2;

      try {
        const admNo =
          row.admission_number?.trim().toUpperCase();
        if (!admNo) {
          result.errors.push({
            row:     rowNumber,
            field:   'admission_number',
            message: 'Admission number is required',
          });
          result.failed++;
          continue;
        }

        const studentId = studentMap.get(admNo);
        if (!studentId) {
          result.errors.push({
            row:     rowNumber,
            field:   'admission_number',
            message: `No student found with ` +
              `admission number "${row.admission_number}"`,
          });
          result.failed++;
          continue;
        }

        const subjectName = row.subject?.trim();
        if (!subjectName) {
          result.errors.push({
            row:     rowNumber,
            field:   'subject',
            message: 'Subject is required',
          });
          result.failed++;
          continue;
        }

        const subjectKey = subjectName.toUpperCase();
        let subjectId    = subjectMap.get(subjectKey);

        if (!subjectId) {
          const {
            data:  newSubject,
            error: subErr,
          } = await db
            .from('subjects')
            .insert({
              school_id: schoolId,
              name:      subjectName,
            })
            .select('id')
            .single();

          if (subErr || !newSubject) {
            result.errors.push({
              row:     rowNumber,
              field:   'subject',
              message: `Could not create subject ` +
                `"${subjectName}"`,
            });
            result.failed++;
            continue;
          }

          subjectId = newSubject.id;
          subjectMap.set(subjectKey, subjectId);
        }

        const caScore =
          parseFloat(row.ca_score?.trim() || '0');
        const examScore =
          parseFloat(row.exam_score?.trim() || '0');

        if (isNaN(caScore) || isNaN(examScore)) {
          result.errors.push({
            row:     rowNumber,
            field:   'ca_score/exam_score',
            message: 'Scores must be numbers',
          });
          result.failed++;
          continue;
        }

        const { data: existing } = await db
          .from('student_scores')
          .select('id')
          .eq('student_id', studentId)
          .eq('subject_id', subjectId)
          .eq('term_id', termId)
          .maybeSingle();

        if (existing) {
          await db
            .from('student_scores')
            .update({
              ca_score:   caScore,
              exam_score: examScore,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          result.updated++;
        } else {
          const { error: insertErr } = await db
            .from('student_scores')
            .insert({
              school_id:  schoolId,
              student_id: studentId,
              subject_id: subjectId,
              term_id:    termId,
              ca_score:   caScore,
              exam_score: examScore,
            });

          if (insertErr) {
            throw new Error(insertErr.message);
          }
          result.created++;
        }

        if (i % 10 === 0) {
          await db
            .from('bulk_upload_jobs')
            .update({
              processed_rows: i + 1,
              success_rows:
                result.created + result.updated,
              failed_rows: result.failed,
            })
            .eq('id', jobId);
        }
      } catch (err) {
        result.errors.push({
          row:     rowNumber,
          field:   'general',
          message: err instanceof Error
            ? err.message
            : String(err),
        });
        result.failed++;
      }
    }

    let finalStatus: BulkUploadStatus = 'completed';
    if (result.failed === result.total) {
      finalStatus = 'failed';
    } else if (result.failed > 0) {
      finalStatus = 'completed_with_errors';
    }

    await db
      .from('bulk_upload_jobs')
      .update({
        processed_rows: rows.length,
        success_rows:
          result.created + result.updated,
        failed_rows:    result.failed,
        status:         finalStatus,
        errors:         result.errors.slice(0, 50),
        result_summary: {
          total:   result.total,
          created: result.created,
          updated: result.updated,
          failed:  result.failed,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return result;
  }

  // ─── Upsert parent ───────────────────────────────────────────
  private async upsertParent(
    schoolId:  string,
    studentId: string,
    parent: {
      full_name: string;
      phone:     string;
      email:     string | null;
    }
  ): Promise<void> {
    const { data: existing } = await db
      .from('parents')
      .select('id')
      .eq('school_id', schoolId)
      .eq('phone', parent.phone)
      .single();

    let parentId: string;

    if (existing) {
      await db
        .from('parents')
        .update({
          full_name:  parent.full_name,
          email:      parent.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      parentId = existing.id;
    } else {
      const { data: newParent } = await db
        .from('parents')
        .insert({
          school_id:       schoolId,
          full_name:       parent.full_name,
          phone:           parent.phone,
          whatsapp_number: parent.phone,
          email:           parent.email,
          created_at:      new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!newParent) return;
      parentId = newParent.id;
    }

    const { data: existingLink } = await db
      .from('student_parents')
      .select('id')
      .eq('student_id', studentId)
      .eq('parent_id', parentId)
      .single();

    if (!existingLink) {
      await db.from('student_parents').insert({
        student_id:                    studentId,
        parent_id:                     parentId,
        relationship:                  'Parent',
        is_primary:                    true,
        can_receive_attendance:        true,
        can_receive_fee_notifications: true,
        can_receive_results:           true,
        can_pickup:                    true,
        created_at:                    new Date().toISOString(),
      });
    }
  }

  // ─── Parse date ──────────────────────────────────────────────
  private parseDate(dateStr: string): string | null {
    try {
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          return (
            `${y}-` +
            `${m.padStart(2, '0')}-` +
            `${d.padStart(2, '0')}`
          );
        }
      }
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (
          parts.length === 3 &&
          parts[2].length === 4
        ) {
          const [d, m, y] = parts;
          return (
            `${y}-` +
            `${m.padStart(2, '0')}-` +
            `${d.padStart(2, '0')}`
          );
        }
      }
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      return null;
    } catch {
      return null;
    }
  }

  // ─── Capitalize ──────────────────────────────────────────────
  private capitalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // ─── Format phone ────────────────────────────────────────────
  private formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (
      cleaned.startsWith('0') &&
      cleaned.length === 11
    ) {
      return '234' + cleaned.slice(1);
    }
    if (
      cleaned.startsWith('234') &&
      cleaned.length === 13
    ) {
      return cleaned;
    }
    return cleaned;
  }
}
