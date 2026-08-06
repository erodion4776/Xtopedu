// ============================================================
// SCHOOLBOT - SESSION MANAGER
// supabase/functions/_shared/session.ts
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
      .single();

    if (error || !data) return null;

    // Check if session has expired
    const lastActivity = new Date(data.last_activity).getTime();
    if (Date.now() - lastActivity > SESSION_TTL_MS) {
      // Delete expired session
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

    // Attach runtime data (not stored in DB)
    return {
      ...(data as BotSession),
      parent,
      students,
      waAccount,
    };
  }

  // ─── Create admin or teacher session ──────────────────────────────────
  async createAdminSession(
    phone: string,
    schoolUser: SchoolUser,
    waAccount: WhatsAppAccount | null,
    role: 'admin' | 'teacher' = 'admin'
  ): Promise<BotSession> {
    const record = {
      phone: this.fmt(phone),
      parent_id: null,
      school_user_id: schoolUser.id,
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

    // Attach runtime data (not stored in DB)
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

    // Update selected student if provided
    if (options?.selectedStudentId !== undefined) {
      update.selected_student_id = options.selectedStudentId;
    }

    // Merge new data with existing data
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
    // Get current data first
    const { data: current } = await db
      .from('bot_sessions')
      .select('data')
      .eq('phone', this.fmt(phone))
      .single();

    // Merge and save
    await db
      .from('bot_sessions')
      .update({
        data: { ...(current?.data ?? {}), ...newData },
        last_activity: new Date().toISOString(),
      })
      .eq('phone', this.fmt(phone));
  }

  // ─── Touch session (update last activity time) ─────────────────────────
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
  // Used by admin to see who is online
  async getActiveForSchool(schoolId: string): Promise<BotSession[]> {
    const since = new Date(
      Date.now() - SESSION_TTL_MS
    ).toISOString();

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
