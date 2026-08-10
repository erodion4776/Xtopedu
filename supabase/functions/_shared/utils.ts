// ============================================================
// SCHOOLBOT - SHARED UTILITIES
// supabase/functions/_shared/utils.ts
//
// Centralizes all repeated helpers so nothing is duplicated
// across the codebase.
// ============================================================

// ─── Currency formatter ────────────────────────────────────
export function fmt(n: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(n);
}

// ─── Phone number utilities ────────────────────────────────

/**
 * Converts any Nigerian phone format to international.
 * 08012345678 → 2348012345678
 * +2348012345678 → 2348012345678
 */
export function formatPhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0') && p.length === 11) {
    p = '234' + p.slice(1);
  }
  return p;
}

/**
 * Returns all possible formats of a Nigerian phone number.
 * Used to search DB with both local and international formats.
 */
export function getPhoneVariants(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, '');
  const variants = new Set<string>([phone, cleaned]);

  // International → local: 2348012345678 → 08012345678
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    variants.add('0' + cleaned.slice(3));
  }

  // Local → international: 08012345678 → 2348012345678
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    variants.add('234' + cleaned.slice(1));
  }

  return [...variants];
}

// ─── Date & time helpers ────────────────────────────────────

/**
 * Returns a friendly greeting based on time of day.
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5  && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Hello';
}

/**
 * Format a date string for Nigerian locale.
 */
export function formatDate(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }
): string {
  return new Date(dateStr).toLocaleDateString('en-NG', opts);
}

/**
 * Format a full date with weekday.
 */
export function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format time from HH:MM:SS to 12-hour format.
 */
export function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Returns today's date as YYYY-MM-DD.
 */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Token generator ───────────────────────────────────────

/**
 * Generates a random 8-character alphanumeric token.
 * Used for staff invite codes.
 */
export function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

/**
 * Generates a unique payment reference.
 */
export function generateRef(prefix = 'SCH'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generates a receipt number.
 */
export function generateReceiptNo(): string {
  const now = new Date();
  const yymm =
    `${String(now.getFullYear()).slice(2)}` +
    `${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SCH-RCP-${yymm}-${rand}`;
}

// ─── Validation helpers ────────────────────────────────────

/**
 * Checks if a string is a valid Nigerian phone number.
 */
export function isValidNigerianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return (
    (cleaned.startsWith('0') && cleaned.length === 11) ||
    (cleaned.startsWith('234') && cleaned.length === 13)
  );
}

/**
 * Checks if a string is a valid email address.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Checks if text looks like a staff invite token.
 * 8 alphanumeric characters.
 */
export function isInviteToken(text: string): boolean {
  return /^[A-Z0-9]{8}$/i.test(text.trim());
}

// ─── Ordinal suffix ───────────────────────────────────────

/**
 * Returns ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── String helpers ───────────────────────────────────────

/**
 * Capitalizes first letter of each word.
 */
export function capitalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Truncates a string to max length with ellipsis.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// ─── Delay helper ─────────────────────────────────────────

/**
 * Async delay for WhatsApp message spacing.
 * Prevents messages arriving out of order.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Rate icon helper ─────────────────────────────────────

/**
 * Returns color indicator based on percentage rate.
 */
export function rateIcon(rate: number): string {
  if (rate >= 90) return '🟢';
  if (rate >= 75) return '🟡';
  return '🔴';
}

// ─── Due date label ───────────────────────────────────────

/**
 * Returns a human-readable due date label with urgency indicator.
 */
export function dueLabel(dueDate: string | null): string {
  if (!dueDate) return 'No due date';

  const diffDays = Math.ceil(
    (new Date(dueDate).getTime() - Date.now()) / 86400000
  );

  const formatted = formatDate(dueDate);

  if (diffDays < 0)  return `⚠️ Overdue (${formatted})`;
  if (diffDays === 0) return `🔴 Due TODAY`;
  if (diffDays <= 3)  return `🟡 Due in ${diffDays} days (${formatted})`;
  return `📅 Due: ${formatted}`;
}

// ─── Score grading ─────────────────────────────────────────

/**
 * Returns grade and remark from total score.
 */
export function getGrade(total: number): {
  grade: string;
  remark: string;
} {
  if (total >= 75) return { grade: 'A', remark: 'Excellent' };
  if (total >= 65) return { grade: 'B', remark: 'Very Good' };
  if (total >= 55) return { grade: 'C', remark: 'Good' };
  if (total >= 45) return { grade: 'D', remark: 'Pass' };
  if (total >= 40) return { grade: 'E', remark: 'Fair' };
  return { grade: 'F', remark: 'Fail' };
}

// ─── Attendance icons ─────────────────────────────────────

/**
 * Returns emoji + label for attendance status.
 */
export function attEmoji(status: string): string {
  const map: Record<string, string> = {
    present: '✅ Present',
    absent:  '❌ Absent',
    late:    '⏰ Late',
    excused: '📋 Excused',
    holiday: '🏖️ Holiday',
  };
  return map[status] ?? status;
}

/**
 * Returns emoji only for attendance status.
 */
export function attIcon(status: string): string {
  const map: Record<string, string> = {
    present: '✅',
    absent:  '❌',
    late:    '⏰',
    excused: '📋',
    holiday: '🏖️',
  };
  return map[status] ?? '•';
}
