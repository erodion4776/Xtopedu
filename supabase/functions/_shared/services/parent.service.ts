// ============================================================
// SCHOOLBOT - PARENT SERVICE
// supabase/functions/_shared/services/parent.service.ts
// ============================================================

import { getSupabase } from '../supabase.ts';
import type { Parent, Student, WhatsAppAccount } from '../types.ts';

const db = getSupabase();

export class ParentService {

  // ─── Find parent by phone number ──────────────────────────────────────
  // Checks both phone and whatsapp_number fields
  // Also checks multiple phone formats (local and international)
  async findByPhone(phone: string): Promise<Parent | null> {
    const variants = this.getPhoneVariants(phone);

    for (const variant of variants) {
      const { data, error } = await db
        .from('parents')
        .select(`
          id,
          school_id,
          full_name,
          phone,
          whatsapp_number,
          email,
          preferred_language,
          schools (
            id,
            name,
            slug,
            logo_url,
            timezone,
            is_active,
            subscription_status,
            onboarding_status
          )
        `)
        .or(`phone.eq.${variant},whatsapp_number.eq.${variant}`)
        .single();

      if (!error && data) {
        const parent = data as Parent;

        // Only allow parents from active schools
        if (!parent.schools?.is_active) {
          return null;
        }

        return parent;
      }
    }

    // Not found in any format
    return null;
  }

  // ─── Get all students linked to a parent ──────────────────────────────
  async getStudents(parentId: string): Promise<Student[]> {
    const { data, error } = await db
      .from('student_parents')
      .select(`
        relationship,
        is_primary,
        can_receive_results,
        can_receive_attendance,
        can_receive_fee_notifications,
        can_pickup,
        students (
          id,
          school_id,
          first_name,
          last_name,
          middle_name,
          admission_number,
          status,
          gender,
          date_of_birth,
          class_id,
          class_arm_id,
          passport_url,
          classes (
            id,
            name,
            level
          ),
          class_arms (
            id,
            name
          )
        )
      `)
      .eq('parent_id', parentId)
      .eq('students.status', 'active');

    if (error || !data) return [];

    // Build student objects with computed fields
    return (data as Record<string, unknown>[])
      .filter((sp) => sp.students !== null)
      .map((sp) => {
        const s = sp.students as Record<string, unknown>;
        const cls = s.classes as { id: string; name: string; level?: number } | null;
        const arm = s.class_arms as { id: string; name: string } | null;

        return {
          // Spread student fields
          id: s.id as string,
          school_id: s.school_id as string,
          first_name: s.first_name as string,
          last_name: s.last_name as string,
          middle_name: s.middle_name as string | null,
          admission_number: s.admission_number as string,
          status: s.status as string,
          gender: s.gender as string | null,
          date_of_birth: s.date_of_birth as string | null,
          class_id: s.class_id as string | null,
          class_arm_id: s.class_arm_id as string | null,
          passport_url: s.passport_url as string | null,
          classes: cls,
          class_arms: arm,
          // Permission flags from student_parents
          relationship: sp.relationship as string | null,
          is_primary: sp.is_primary as boolean,
          can_receive_results: sp.can_receive_results as boolean,
          can_receive_attendance: sp.can_receive_attendance as boolean,
          can_receive_fee_notifications: sp.can_receive_fee_notifications as boolean,
          can_pickup: sp.can_pickup as boolean,
          // Computed display fields
          full_name: `${s.first_name} ${s.last_name}`,
          class_name: cls?.name ?? '',
          arm_name: arm?.name ?? '',
        } as Student;
      });
  }

  // ─── Get school WhatsApp account ───────────────────────────────────────
  async getWaAccount(
    schoolId: string
  ): Promise<WhatsAppAccount | null> {
    const { data } = await db
      .from('whatsapp_accounts')
      .select('id, school_id, phone_number_id, access_token, status')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .single();

    return (data as WhatsAppAccount | null) ?? null;
  }

  // ─── Ensure WhatsApp contact record exists ─────────────────────────────
  // Creates contact if not found, updates last_seen if found
  async ensureContact(
    parent: Parent,
    phone: string
  ): Promise<string | null> {
    const formatted = this.formatPhone(phone);

    // Check if contact already exists
    const { data: existing } = await db
      .from('whatsapp_contacts')
      .select('id')
      .eq('phone', formatted)
      .eq('school_id', parent.school_id)
      .single();

    if (existing) {
      // Update last seen time
      await db
        .from('whatsapp_contacts')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', existing.id);

      return existing.id as string;
    }

    // Create new contact record
    const { data: contact, error } = await db
      .from('whatsapp_contacts')
      .insert({
        phone: formatted,
        full_name: parent.full_name,
        parent_id: parent.id,
        school_id: parent.school_id,
        role: 'parent',
        language: 'en',
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[ParentService] ensureContact error:', error.message);
      return null;
    }

    return (contact as { id: string } | null)?.id ?? null;
  }

  // ─── Ensure open conversation exists ──────────────────────────────────
  async ensureConversation(
    contactId: string,
    schoolId: string
  ): Promise<string | null> {
    // Look for existing open conversation
    const { data: existing } = await db
      .from('whatsapp_conversations')
      .select('id')
      .eq('contact_id', contactId)
      .eq('conversation_status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      // Update last message time
      await db
        .from('whatsapp_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', existing.id);

      return existing.id as string;
    }

    // Create new conversation
    const { data: conversation, error } = await db
      .from('whatsapp_conversations')
      .insert({
        contact_id: contactId,
        school_id: schoolId,
        conversation_status: 'open',
        started_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[ParentService] ensureConversation error:', error.message);
      return null;
    }

    return (conversation as { id: string } | null)?.id ?? null;
  }

  // ─── Log a WhatsApp message ────────────────────────────────────────────
  async logMessage(params: {
    conversationId: string;
    schoolId: string;
    direction: 'inbound' | 'outbound';
    messageType: string;
    messageText: string;
    whatsappMessageId?: string;
    senderPhone?: string;
    receiverPhone?: string;
  }): Promise<void> {
    try {
      await db.from('whatsapp_messages').insert({
        conversation_id: params.conversationId,
        school_id: params.schoolId,
        direction: params.direction,
        message_type: params.messageType,
        // Trim to avoid huge message storage
        message_text: params.messageText.substring(0, 4096),
        whatsapp_message_id: params.whatsappMessageId ?? null,
        sender_phone: params.senderPhone ?? null,
        receiver_phone: params.receiverPhone ?? null,
        delivery_status:
          params.direction === 'outbound' ? 'sent' : 'received',
        sent_at:
          params.direction === 'outbound'
            ? new Date().toISOString()
            : null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      // Don't throw - logging failure should not break the bot
      console.warn('[ParentService] logMessage error:', err);
    }
  }

  // ─── Get parent by ID ──────────────────────────────────────────────────
  async getById(parentId: string): Promise<Parent | null> {
    const { data } = await db
      .from('parents')
      .select(`
        id,
        school_id,
        full_name,
        phone,
        whatsapp_number,
        email,
        preferred_language,
        schools (
          id,
          name,
          logo_url,
          timezone,
          is_active,
          subscription_status
        )
      `)
      .eq('id', parentId)
      .single();

    return (data as Parent | null) ?? null;
  }

  // ─── Get parents for a student ─────────────────────────────────────────
  async getParentsForStudent(studentId: string): Promise<
    Array<{
      parent: Record<string, unknown>;
      canReceiveAttendance: boolean;
      canReceiveFeeNotifications: boolean;
      canReceiveResults: boolean;
    }>
  > {
    const { data } = await db
      .from('student_parents')
      .select(`
        can_receive_attendance,
        can_receive_fee_notifications,
        can_receive_results,
        parents (
          id,
          full_name,
          phone,
          whatsapp_number,
          email
        )
      `)
      .eq('student_id', studentId);

    return (data ?? []).map((sp) => ({
      parent: sp.parents as Record<string, unknown>,
      canReceiveAttendance: sp.can_receive_attendance as boolean,
      canReceiveFeeNotifications:
        sp.can_receive_fee_notifications as boolean,
      canReceiveResults: sp.can_receive_results as boolean,
    }));
  }

  // ─── Phone number utilities ────────────────────────────────────────────

  // Get all possible formats of a phone number
  // So we can search both local and international formats
  getPhoneVariants(phone: string): string[] {
    const cleaned = phone.replace(/\D/g, '');
    const variants = new Set<string>([phone, cleaned]);

    // Nigerian number conversions
    // International to local: 2348012345678 → 08012345678
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      variants.add('0' + cleaned.slice(3));
    }

    // Local to international: 08012345678 → 2348012345678
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      variants.add('234' + cleaned.slice(1));
    }

    return [...variants];
  }

  // Format phone to international format for storage
  formatPhone(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0') && p.length === 11) {
      p = '234' + p.slice(1);
    }
    return p;
  }
}
