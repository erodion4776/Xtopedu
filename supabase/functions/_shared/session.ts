// ============================================================
// SCHOOLBOT - SESSION MANAGER
// supabase/functions/_shared/session.ts
// ✅ Fixed: Safe null fallback for virtual admin/owner IDs
// ✅ Fixed: Prevents bot_sessions_school_user_id_fkey violations
// ✅ Centralized phone formatting using utils
// ============================================================

import { getSupabase } from './supabase.ts';
import type {
  BotSession,
  BotState,
  Parent,
  Student,
  WhatsAppAccount,
  SchoolUser,
  UserRole,
} from './types.ts';

const db = getSupabase();

// Session expires after 2 hours of no activity
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export class SessionService {

  // ─── Get session from database ─────────────────────────────────────────
  async get(phone: string): Promise<BotSession | null> {
    const { data, error } = await db
      .from('bot_sessions')
      .select('*')
      .eq('phone', this.fmt(phone))
      .maybeSingle();

    if (error || !data) return null;

    // Check if session has expired
    const lastActivity = new Date(data.last_activity).getTime();
    if (Date.now() - lastActivity > SESSION_TTL_MS) {
      await this.delete(phone);
      return null;
    }

    return data as BotSession;
  }

  // ─── Create parent session ─────────────────────────────────────────────
  async createParentSession(
    phone: string,
    parent: Parent,
    students: Student[],
    waAccount: WhatsAppAccount | null
  ): Promise<BotSession> {
    const record = {
      phone: this.fmt(phone),
      parent_id: parent.id,
      school_user_id: null,
      school_id: parent.school_id,
      role: 'parent' as UserRole,
      state: 'MAIN_MENU' as BotState,
      sub_state: null,
      selected_student_id: null,
      data: {},
      last_activity: new Date().toISOString(),
    };

    const { data, error } = await db
      .from('bot_sessions')
      .upsert(record, { onConflict: 'phone' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create parent session: ${error.message}`);
    }

    return {
      ...(data as BotSession),
      parent,
      students,
      waAccount,
    };
  }

  // ─── Create admin or teacher session ──────────────────────────────────
  // ✅ Fixed: Automatically intercepts virtual/mock IDs
  // ✅ Saves NULL in DB to satisfy foreign key constraints
  // ✅ Keeps mock profiles attached in runtime memory
  async createAdminSession(
    phone: string,
    schoolUser: SchoolUser,
    waAccount: WhatsAppAccount | null,
    role: 'admin' | 'teacher' = 'admin'
  ): Promise<BotSession> {
    // Detect virtual/mock users (Super Admin, Onboarded Owner, etc.)
    const isVirtual =
      !schoolUser.id ||
      schoolUser.id.startsWith('virtual-') ||
      schoolUser.id.startsWith('admin-') ||
      schoolUser.id.startsWith('sa-own-') ||
      schoolUser.id === 'super_admin';

    const record = {
      phone: this.fmt(phone),
      parent_id: null,
      // If virtual, we write NULL to DB to bypass foreign key constraint
      school_user_id: isVirtual ? null : schoolUser.id,
      school_id: schoolUser.school_id,
      role: role as UserRole,
      state: 'ADMIN_MAIN_MENU' as BotState,
      sub_state: null,
      selected_student_id: null,
      data: {},
      last_activity: new Date().toISOString(),
    };

    const { data, error } = await db
      .from('bot_sessions')
      .upsert(record, { onConflict: 'phone' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create admin session: ${error.message}`);
    }

    // Return session object with full runtime metadata
    return {
      ...(data as BotSession),
      schoolUser,
      waAccount,
    };
  }

  // ─── Update session state ──────────────────────────────────────────────
  async setState(
    phone: string,
    state: BotState,
    subState: string | null = null,
    options?: {
      selectedStudentId?: string | null;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    const update: Record<string, unknown> = {
      state,
      sub_state: subState,
      last_activity: new Date().toISOString(),
    };

    if (options?.selectedStudentId !== undefined) {
      update.selected_student_id = options.selectedStudentId;
    }

    if (options?.data) {
      const { data: current } = await db
        .from('bot_sessions')
        .select('data')
        .eq('phone', this.fmt(phone))
        .single();

      update.data = {
        ...(current?.data ?? {}),
        ...options.data,
      };
    }

    await db
      .from('bot_sessions')
      .update(update)
      .eq('phone', this.fmt(phone));
  }

  // ─── Update only the data field ────────────────────────────────────────
  async setData(
    phone: string,
    newData: Record<string, unknown>
  ): Promise<void> {
    const { data: current } = await db
      .from('bot_sessions')
      .select('data')
      .eq('phone', this.fmt(phone))
      .single();

    await db
      .from('bot_sessions')
      .update({
        data: { ...(current?.data ?? {}), ...newData },
        last_activity: new Date().toISOString(),
      })
      .eq('phone', this.fmt(phone));
  }

  // ─── Touch session (update activity) ───────────────────────────────────
  async touch(phone: string): Promise<void> {
    await db
      .from('bot_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('phone', this.fmt(phone));
  }

  // ─── Delete session ────────────────────────────────────────────────────
  async delete(phone: string): Promise<void> {
    await db
      .from('bot_sessions')
      .delete()
      .eq('phone', this.fmt(phone));
  }

  // ─── Get all active sessions for a school ─────────────────────────────
  async getActiveForSchool(schoolId: string): Promise<BotSession[]> {
    const since = new Date(Date.now() - SESSION_TTL_MS).toISOString();

    const { data } = await db
      .from('bot_sessions')
      .select('*')
      .eq('school_id', schoolId)
      .gte('last_activity', since)
      .order('last_activity', { ascending: false });

    return (data ?? []) as BotSession[];
  }

  // ─── Format phone to international format ─────────────────────────────
  fmt(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0') && p.length === 11) {
      p = '234' + p.slice(1);
    }
    return p;
  }
}
