// ============================================================
// SCHOOLBOT - CSV SERVICE
// supabase/functions/_shared/csv.service.ts
// ✅ Fixed: Auto-creates classes if they don't exist
// ✅ Fixed: Auto-creates arms A, B, C for new classes
// ✅ Fixed: Class name normalization (JSS1 → JSS 1)
// ✅ Fixed: rowOffset parameter for batch processing
// ✅ Fixed: Correct row numbers in error messages
// ✅ Fixed: Race condition handling for class creation
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
// ✅ Preserves names that already have spaces
// ============================================================

function normalizeClassName(raw: string): string {
  const name = raw.trim();

  // Already has a space — return as-is
  // e.g. "JSS 1", "Primary 3", "SS 2A"
  if (/\s/.test(name)) return name;

  // Pattern: letters followed by digits
  // e.g. JSS1 → JSS 1, SS2 → SS 2, KG1 → KG 1
  const match = name.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    return `${match[1].toUpperCase()} ${match[2]}`;
  }

  // Return original if no pattern matches
  return name;
}

// ============================================================
// INFER CLASS LEVEL
// Used for ordering classes correctly in admin UI
// ============================================================

function inferClassLevel(className: string): number {
  const name = className.toUpperCase().trim();

  // Creche / Nursery
  if (
    name.includes('CRECHE') ||
    name.includes('CRÈCHE') ||
    name.includes('CRCHE')
  ) return 1;
  if (
    name === 'NURSERY 1' || name === 'N1' ||
    name === 'NURSERY1'
  ) return 2;
  if (
    name === 'NURSERY 2' || name === 'N2' ||
    name === 'NURSERY2'
  ) return 3;
  if (
    name === 'KG 1' || name === 'KG1' ||
    name === 'KINDERGARTEN 1'
  ) return 4;
  if (
    name === 'KG 2' || name === 'KG2' ||
    name === 'KINDERGARTEN 2'
  ) return 5;

  // Primary
  if (
    name === 'PRIMARY 1' || name === 'P1' ||
    name === 'BASIC 1'   || name === 'B1'
  ) return 6;
  if (
    name === 'PRIMARY 2' || name === 'P2' ||
    name === 'BASIC 2'   || name === 'B2'
  ) return 7;
  if (
    name === 'PRIMARY 3' || name === 'P3' ||
    name === 'BASIC 3'   || name === 'B3'
  ) return 8;
  if (
    name === 'PRIMARY 4' || name === 'P4' ||
    name === 'BASIC 4'   || name === 'B4'
  ) return 9;
  if (
    name === 'PRIMARY 5' || name === 'P5' ||
    name === 'BASIC 5'   || name === 'B5'
  ) return 10;
  if (
    name === 'PRIMARY 6' || name === 'P6' ||
    name === 'BASIC 6'   || name === 'B6'
  ) return 11;

  // JSS
  if (
    name === 'JSS 1' || name === 'JSS1' ||
    name === 'JHS 1' || name === 'JHS1' ||
    name === 'JS 1'  || name === 'JS1'
  ) return 12;
  if (
    name === 'JSS 2' || name === 'JSS2' ||
    name === 'JHS 2' || name === 'JHS2' ||
    name === 'JS 2'  || name === 'JS2'
  ) return 13;
  if (
    name === 'JSS 3' || name === 'JSS3' ||
    name === 'JHS 3' || name === 'JHS3' ||
    name === 'JS 3'  || name === 'JS3'
  ) return 14;

  // SS / SHS
  if (
    name === 'SS 1'  || name === 'SS1'  ||
    name === 'SHS 1' || name === 'SHS1' ||
    name === 'SSS 1' || name === 'SSS1'
  ) return 15;
  if (
    name === 'SS 2'  || name === 'SS2'  ||
    name === 'SHS 2' || name === 'SHS2' ||
    name === 'SSS 2' || name === 'SSS2'
  ) return 16;
  if (
    name === 'SS 3'  || name === 'SS3'  ||
    name === 'SHS 3' || name === 'SHS3' ||
    name === 'SSS 3' || name === 'SSS3'
  ) return 17;

  // Default — put at end
  return 99;
}

// ============================================================
// GET OR CREATE CLASS
// ✅ Finds class by name (case-insensitive)
// ✅ Creates class + arms A, B, C if not found
// ✅ Creates specific arm if class exists but arm missing
// ✅ Handles race conditions gracefully
// ============================================================

async function getOrCreateClass(
  schoolId:  string,
  className: string,
  armName:   string,
  classMap:  Map<string, {
    id:   string;
    arms: Map<string, string>;
  }>
): Promise<{
  classId: string;
  armId:   string | null;
}> {
  const classKey = className.toUpperCase();
  const armKey   = (armName || 'A').toUpperCase();

  // ── Check cache first ───────────────────────────────────
  const cached = classMap.get(classKey);
  if (cached) {
    let armId = cached.arms.get(armKey) ?? null;

    if (!armId) {
      // Class exists but arm is missing — create it
      console.log(
        `[CSV] Creating missing arm "${armName}" ` +
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

  // ── Not in cache — check DB directly ───────────────────
  // Use case-insensitive search to find existing class
  const { data: existingClass } = await db
    .from('classes')
    .select('id, name, class_arms( id, name )')
    .eq('school_id', schoolId)
    .ilike('name', className)
    .maybeSingle();

  if (existingClass) {
    // Found in DB — add to cache and return
    const armsMap = new Map<string, string>();
    const clsArms = existingClass.class_arms as Array<{
      id:   string;
      name: string;
    }> | null;

    for (const arm of clsArms ?? []) {
      armsMap.set(arm.name.toUpperCase(), arm.id);
    }

    classMap.set(classKey, {
      id:   existingClass.id,
      arms: armsMap,
    });

    // Check if specific arm exists
    let armId = armsMap.get(armKey) ?? null;

    if (!armId) {
      // Arm missing — create it
      const { data: newArm } = await db
        .from('class_arms')
        .insert({
          class_id:   existingClass.id,
          name:       armName || 'A',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (newArm) {
        armId = newArm.id;
        armsMap.set(armKey, armId);
      }
    }

    return { classId: existingClass.id, armId };
  }

  // ── Class does not exist — create it ───────────────────
  console.log(
    `[CSV] Auto-creating class "${className}" ` +
    `for school: ${schoolId}`
  );

  const level = inferClassLevel(className);

  const {
    data:  newClass,
    error: classError,
  } = await db
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

    // Race condition — another row may have just created it
    // Try to find it again
    const { data: retry } = await db
      .from('classes')
      .select('id, class_arms( id, name )')
      .eq('school_id', schoolId)
      .ilike('name', className)
      .maybeSingle();

    if (retry) {
      const retryArms = new Map<string, string>();
      const retryClsArms = retry.class_arms as Array<{
        id:   string;
        name: string;
      }> | null;

      for (const arm of retryClsArms ?? []) {
        retryArms.set(arm.name.toUpperCase(), arm.id);
      }

      classMap.set(classKey, {
        id:   retry.id,
        arms: retryArms,
      });

      const armId = retryArms.get(armKey) ?? null;
      return { classId: retry.id, armId };
    }

    throw new Error(
      `Could not create class "${className}": ` +
      `${classError?.message ?? 'Unknown error'}`
    );
  }

  // ── Create default arms A, B, C for this new class ─────
  console.log(
    `[CSV] Creating arms A, B, C for ` +
    `class "${className}"`
  );

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

  // Build arms map and update cache
  const armsMap = new Map<string, string>();
  for (const arm of insertedArms ?? []) {
    armsMap.set(arm.name.toUpperCase(), arm.id);
  }

  classMap.set(classKey, {
    id:   newClass.id,
    arms: armsMap,
  });

  console.log(
    `[CSV] ✅ Created class "${className}" ` +
    `(level ${level}) with arms A, B, C`
  );

  // Return the specific arm requested
  // If the requested arm is not A/B/C it will be null
  // (a rare edge case — admin used D or other arm)
  let armId = armsMap.get(armKey) ?? null;

  if (!armId && armName) {
    // Create the specific arm if it's not A/B/C
    const { data: customArm } = await db
      .from('class_arms')
      .insert({
        class_id:   newClass.id,
        name:       armName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (customArm) {
      armId = customArm.id;
      armsMap.set(armKey, armId);
    }
  }

  return { classId: newClass.id, armId };
}

// ============================================================
// CSV SERVICE CLASS
// ============================================================

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
      headers + '\n' +
      example + '\n' +
      example2 + '\n'
    );
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
      headers + '\n' +
      example + '\n' +
      example2 + '\n'
    );
  }

  // ─── Parse CSV text into rows ────────────────────────────────
  parseCSV(
    csvText:         string,
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

    const headers = this.parseLine(lines[0]).map(
      (h) => h.toLowerCase().trim().replace(/\s+/g, '_')
    );

    const missing = requiredHeaders.filter(
      (r) => !headers.includes(r)
    );

    if (missing.length > 0) {
      errors.push(
        `Missing required columns: ` +
        `${missing.join(', ')}. ` +
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
  // ✅ Fixed: Auto-creates classes if not found
  // ✅ Fixed: Normalizes class names (JSS1 → JSS 1)
  // ✅ Fixed: rowOffset for correct error line numbers
  // ✅ Fixed: Progress updated in DB every 10 rows
  async importStudents(
    schoolId:  string,
    rows:      Record<string, string>[],
    jobId:     string,
    rowOffset: number = 0
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
      .select('id, name, class_arms( id, name )')
      .eq('school_id', schoolId);

    // Build class map keyed by UPPERCASE name
    const classMap = new Map<
      string,
      { id: string; arms: Map<string, string> }
    >();

    for (const cls of classes ?? []) {
      const arms    = new Map<string, string>();
      const clsArms = cls.class_arms as Array<{
        id:   string;
        name: string;
      }> | null;

      for (const arm of clsArms ?? []) {
        arms.set(arm.name.toUpperCase(), arm.id);
      }

      classMap.set(cls.name.toUpperCase(), {
        id: cls.id,
        arms,
      });
    }

    console.log(
      `[CSV] importStudents:\n` +
      `  rows: ${rows.length}\n` +
      `  rowOffset: ${rowOffset}\n` +
      `  existingClasses: ${classMap.size}`
    );

    // ── Process each row ────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // ✅ Correct row number in error messages
      // rowOffset=0 means first batch → row 2, 3, 4...
      // rowOffset=50 means second batch → row 52, 53...
      const rowNumber = rowOffset + i + 2;

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
        // JSS1 → JSS 1, SS2 → SS 2, etc.
        const rawClassName = row.class_name.trim();
        const className    = normalizeClassName(rawClassName);
        const rawArmName   = row.class_arm?.trim() ?? 'A';
        const armName      = rawArmName.toUpperCase() || 'A';

        console.log(
          `[CSV] Row ${rowNumber}: ` +
          `"${rawClassName}" → "${className}" | ` +
          `arm="${armName}"`
        );

        // ── Get or auto-create class ──────────────────────
        // ✅ This is the key fix — creates class if missing
        let classId: string;
        let armId:   string | null;

        try {
          const classResult = await getOrCreateClass(
            schoolId,
            className,
            armName,
            classMap
          );
          classId = classResult.classId;
          armId   = classResult.armId;
        } catch (classErr) {
          result.errors.push({
            row:     rowNumber,
            field:   'class_name',
            message:
              `Could not create class "${className}": ` +
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
          dateOfBirth = this.parseDate(
            row.date_of_birth.trim()
          );
        }

        // ── Check if student already exists ───────────────
        const { data: existing } = await db
          .from('students')
          .select('id')
          .eq('school_id', schoolId)
          .eq(
            'admission_number',
            row.admission_number.trim().toUpperCase()
          )
          .maybeSingle();

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
          gender:
            row.gender?.trim() || null,
          date_of_birth:    dateOfBirth,
          blood_group:
            row.blood_group?.trim() || null,
          medical_notes:
            row.medical_notes?.trim() || null,
          status:    'active',
          updated_at: new Date().toISOString(),
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
          await this.upsertParent(
            schoolId,
            studentId,
            {
              full_name: row.parent_name.trim(),
              phone:     this.formatPhone(
                row.parent_phone.trim()
              ),
              email:
                row.parent_email?.trim() || null,
            }
          );
        }

        // ── Update DB progress every 10 rows ──────────────
        if (i % 10 === 0) {
          await db
            .from('bulk_upload_jobs')
            .update({
              processed_rows: rowOffset + i + 1,
              success_rows:
                result.created + result.updated,
              failed_rows: result.failed,
            })
            .eq('id', jobId);
        }

      } catch (err) {
        console.error(
          `[CSV] Row ${rowNumber} error:`,
          err instanceof Error
            ? err.message
            : String(err)
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

    // ── Final DB update for this batch ──────────────────────
    let finalStatus: BulkUploadStatus = 'completed';
    if (result.failed === result.total) {
      finalStatus = 'failed';
    } else if (result.failed > 0) {
      finalStatus = 'completed_with_errors';
    }

    await db
      .from('bulk_upload_jobs')
      .update({
        processed_rows: rowOffset + rows.length,
        success_rows:
          result.created + result.updated,
        failed_rows: result.failed,
        // Only set final status on last batch
        // (caller handles the final completed status)
        status: finalStatus,
        errors: result.errors.slice(0, 50),
      })
      .eq('id', jobId);

    console.log(
      `[CSV] Batch complete:\n` +
      `  rows: ${rows.length}\n` +
      `  created: ${result.created}\n` +
      `  updated: ${result.updated}\n` +
      `  failed: ${result.failed}`
    );

    return result;
  }

  // ─── Import scores from parsed rows ──────────────────────────
  // Subjects are auto-created if they don't exist
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

    // Cache subjects by name
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
        // ── Validate admission number ─────────────────────
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
            message:
              `No student found with ` +
              `admission number "${admNo}"`,
          });
          result.failed++;
          continue;
        }

        // ── Validate subject ──────────────────────────────
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

        // ── Get or create subject ─────────────────────────
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
              message:
                `Could not create subject ` +
                `"${subjectName}"`,
            });
            result.failed++;
            continue;
          }

          subjectId = newSubject.id;
          subjectMap.set(subjectKey, subjectId);
        }

        // ── Validate scores ───────────────────────────────
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

        // ── Upsert score record ───────────────────────────
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

        // ── Update DB progress every 10 rows ──────────────
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
      `[CSV] Score import complete:\n` +
      `  total: ${result.total}\n` +
      `  created: ${result.created}\n` +
      `  updated: ${result.updated}\n` +
      `  failed: ${result.failed}`
    );

    return result;
  }

  // ─── Upsert parent record ────────────────────────────────────
  private async upsertParent(
    schoolId:  string,
    studentId: string,
    parent: {
      full_name: string;
      phone:     string;
      email:     string | null;
    }
  ): Promise<void> {
    try {
      // Find existing parent by phone
      const { data: existing } = await db
        .from('parents')
        .select('id')
        .eq('school_id', schoolId)
        .eq('phone', parent.phone)
        .maybeSingle();

      let parentId: string;

      if (existing) {
        // Update existing parent
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
        // Create new parent
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

      // Link parent to student if not already linked
      const { data: existingLink } = await db
        .from('student_parents')
        .select('id')
        .eq('student_id', studentId)
        .eq('parent_id', parentId)
        .maybeSingle();

      if (!existingLink) {
        await db.from('student_parents').insert({
          student_id:
            studentId,
          parent_id:
            parentId,
          relationship:
            'Parent',
          is_primary:
            true,
          can_receive_attendance:
            true,
          can_receive_fee_notifications:
            true,
          can_receive_results:
            true,
          can_pickup:
            true,
          created_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      // Non-fatal — student is imported even if
      // parent link fails
      console.warn(
        '[CSV] upsertParent error:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // ─── Parse date ──────────────────────────────────────────────
  // Handles DD/MM/YYYY and DD-MM-YYYY formats
  private parseDate(dateStr: string): string | null {
    try {
      // DD/MM/YYYY format
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          // Validate it looks like a real date
          if (y.length === 4) {
            return (
              `${y}-` +
              `${m.padStart(2, '0')}-` +
              `${d.padStart(2, '0')}`
            );
          }
        }
      }

      // DD-MM-YYYY format
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

      // Try native Date parsing as fallback
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }

      return null;
    } catch {
      return null;
    }
  }

  // ─── Capitalize words ────────────────────────────────────────
  private capitalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // ─── Format phone number ─────────────────────────────────────
  // Converts Nigerian local format to international
  private formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');

    // 08012345678 → 2348012345678
    if (
      cleaned.startsWith('0') &&
      cleaned.length === 11
    ) {
      return '234' + cleaned.slice(1);
    }

    // Already international
    if (
      cleaned.startsWith('234') &&
      cleaned.length === 13
    ) {
      return cleaned;
    }

    return cleaned;
  }
}
