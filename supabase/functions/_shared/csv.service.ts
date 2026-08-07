// ============================================================
// SCHOOLBOT - CSV SERVICE
// supabase/functions/_shared/csv.service.ts
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
  success: boolean;
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  studentIds: string[];
};

export type ParsedStudent = {
  first_name: string;
  last_name: string;
  admission_number: string;
  class_name: string;
  class_arm: string;
  gender: string | null;
  date_of_birth: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  blood_group: string | null;
  medical_notes: string | null;
};

export type BulkUploadStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

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

    return headers + '\n' + example + '\n' + example2 + '\n';
  }

  // ─── Parse CSV text into rows ────────────────────────────────
  parseCSV(csvText: string): {
    headers: string[];
    rows: Record<string, string>[];
    errors: string[];
  } {
    const errors: string[] = [];

    const normalized = csvText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const lines = normalized
      .split('\n')
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return { headers: [], rows: [], errors: ['File is empty'] };
    }

    if (lines.length === 1) {
      return {
        headers: [],
        rows: [],
        errors: ['File has headers but no data rows'],
      };
    }

    const headers = this.parseLine(lines[0]).map((h) =>
      h.toLowerCase().trim().replace(/\s+/g, '_')
    );

    const required = [
      'first_name',
      'last_name',
      'admission_number',
      'class_name',
    ];

    const missing = required.filter((r) => !headers.includes(r));

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
    let current = '';
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
  async importStudents(
    schoolId: string,
    rows: Record<string, string>[],
    jobId: string
  ): Promise<UploadResult> {
    const result: UploadResult = {
      success: true,
      total: rows.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      studentIds: [],
    };

    // Cache classes
    const { data: classes } = await db
      .from('classes')
      .select('id, name, class_arms(id, name)')
      .eq('school_id', schoolId);

    const classMap = new Map<
      string,
      { id: string; arms: Map<string, string> }
    >();

    for (const cls of classes ?? []) {
      const arms = new Map<string, string>();
      const clsArms = cls.class_arms as Array<{
        id: string;
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

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      try {
        if (!row.first_name?.trim()) {
          result.errors.push({
            row: rowNumber,
            field: 'first_name',
            message: 'First name is required',
          });
          result.failed++;
          continue;
        }

        if (!row.last_name?.trim()) {
          result.errors.push({
            row: rowNumber,
            field: 'last_name',
            message: 'Last name is required',
          });
          result.failed++;
          continue;
        }

        if (!row.admission_number?.trim()) {
          result.errors.push({
            row: rowNumber,
            field: 'admission_number',
            message: 'Admission number is required',
          });
          result.failed++;
          continue;
        }

        if (!row.class_name?.trim()) {
          result.errors.push({
            row: rowNumber,
            field: 'class_name',
            message: 'Class name is required',
          });
          result.failed++;
          continue;
        }

        const classKey = row.class_name.trim().toUpperCase();
        const classInfo = classMap.get(classKey);

        if (!classInfo) {
          result.errors.push({
            row: rowNumber,
            field: 'class_name',
            message: `Class "${row.class_name}" not found. Create it first.`,
          });
          result.failed++;
          continue;
        }

        const armKey = (row.class_arm ?? 'A').trim().toUpperCase();
        const armId = classInfo.arms.get(armKey) ?? null;

        let dateOfBirth: string | null = null;
        if (row.date_of_birth?.trim()) {
          dateOfBirth = this.parseDate(row.date_of_birth.trim());
        }

        const { data: existing } = await db
          .from('students')
          .select('id')
          .eq('school_id', schoolId)
          .eq('admission_number', row.admission_number.trim())
          .single();

        const studentData = {
          school_id: schoolId,
          first_name: this.capitalize(row.first_name.trim()),
          last_name: this.capitalize(row.last_name.trim()),
          admission_number: row.admission_number.trim().toUpperCase(),
          class_id: classInfo.id,
          class_arm_id: armId,
          gender: row.gender?.trim() || null,
          date_of_birth: dateOfBirth,
          blood_group: row.blood_group?.trim() || null,
          medical_notes: row.medical_notes?.trim() || null,
          status: 'active',
          updated_at: new Date().toISOString(),
        };

        let studentId: string;

        if (existing) {
          await db
            .from('students')
            .update(studentData)
            .eq('id', existing.id);
          studentId = existing.id;
          result.updated++;
        } else {
          const { data: newStudent, error: insertError } = await db
            .from('students')
            .insert({
              ...studentData,
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (insertError || !newStudent) {
            throw new Error(
              insertError?.message ?? 'Student insert failed'
            );
          }

          studentId = newStudent.id;
          result.created++;
        }

        result.studentIds.push(studentId);

        if (row.parent_name?.trim() && row.parent_phone?.trim()) {
          await this.upsertParent(schoolId, studentId, {
            full_name: row.parent_name.trim(),
            phone: this.formatPhone(row.parent_phone.trim()),
            email: row.parent_email?.trim() || null,
          });
        }

        if (i % 10 === 0) {
          await db
            .from('bulk_upload_jobs')
            .update({
              processed_rows: i + 1,
              success_rows: result.created + result.updated,
              failed_rows: result.failed,
            })
            .eq('id', jobId);
        }
      } catch (err) {
        result.errors.push({
          row: rowNumber,
          field: 'general',
          message: String(err),
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
        success_rows: result.created + result.updated,
        failed_rows: result.failed,
        status: finalStatus,
        errors: result.errors.slice(0, 50),
        result_summary: {
          total: result.total,
          created: result.created,
          updated: result.updated,
          failed: result.failed,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return result;
  }

  // ─── Upsert parent ───────────────────────────────────────────
  private async upsertParent(
    schoolId: string,
    studentId: string,
    parent: {
      full_name: string;
      phone: string;
      email: string | null;
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
          full_name: parent.full_name,
          email: parent.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      parentId = existing.id;
    } else {
      const { data: newParent } = await db
        .from('parents')
        .insert({
          school_id: schoolId,
          full_name: parent.full_name,
          phone: parent.phone,
          whatsapp_number: parent.phone,
          email: parent.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
        student_id: studentId,
        parent_id: parentId,
        relationship: 'Parent',
        is_primary: true,
        can_receive_attendance: true,
        can_receive_fee_notifications: true,
        can_receive_results: true,
        can_pickup: true,
        created_at: new Date().toISOString(),
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
          return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3 && parts[2].length === 4) {
          const [d, m, y] = parts;
          return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
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
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return '234' + cleaned.slice(1);
    }
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      return cleaned;
    }
    return cleaned;
  }
}
