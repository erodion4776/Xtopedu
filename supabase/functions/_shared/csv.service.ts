// ============================================================
// SCHOOLBOT - CSV SERVICE
// supabase/functions/_shared/csv.service.ts
// ============================================================

import { getSupabase } from './supabase.ts';
import type { ParsedStudent, BulkUploadJob } from './types.ts';

const db = getSupabase();

// ─── Expected CSV column headers ──────────────────────────────────────────
export const STUDENT_CSV_HEADERS = [
  'first_name',       // Required
  'last_name',        // Required
  'admission_number', // Required
  'class_name',       // Required - must match exactly e.g. JSS 1
  'class_arm',        // Optional - A, B, C (default: A)
  'gender',           // Optional - Male or Female
  'date_of_birth',    // Optional - DD/MM/YYYY
  'parent_name',      // Optional
  'parent_phone',     // Optional - 08012345678
  'parent_email',     // Optional
  'blood_group',      // Optional - A+, O-, etc
  'medical_notes',    // Optional
];

export interface UploadResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  failed: 
