async function handleReset(phone: string, message: IncomingMessage): Promise<void> {
  const wa = new WhatsApp();
  const formatted = phone.replace(/\D/g, '').replace(/^0/, '234');

  // ── 1. Check if platform super admin (YOU) ─────────────────────────
  const { data: platformAdmin } = await db
    .from('platform_admins')
    .select('id, full_name, phone, whatsapp_number, is_active, role')
    .or(`phone.eq.${formatted},whatsapp_number.eq.${formatted}`)
    .eq('is_active', true)
    .single();

  if (platformAdmin) {
    await db.from('platform_admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', platformAdmin.id);

    const { handleSuperAdminMessage } = await import('./superadmin/super.handler.ts');
    await handleSuperAdminMessage(message, {
      id: platformAdmin.id, full_name: platformAdmin.full_name,
    });
    return;
  }

  // ── 2. Check registered parent ────────────────────────────
  const parent = await parentSvc.findByPhone(phone);
  if (parent) {
    const [students, waAccount] = await Promise.all([
      parentSvc.getStudents(parent.id),
      parentSvc.getWaAccount(parent.school_id),
    ]);
    const contactId = await parentSvc.ensureContact(parent, phone);
    if (contactId) await parentSvc.ensureConversation(contactId, parent.school_id);

    const session = await sessions.createParentSession(phone, parent, students, waAccount);
    const schoolWa = new WhatsApp(waAccount);
    await showMainMenu(phone, session, schoolWa);
    return;
  }

  // ── 3. Check registered staff/admin ───────────────────────
  const schoolUser = await adminSvc.findStaffByPhone(phone);
  if (schoolUser) {
    const waAccount = await parents.getWaAccount(schoolUser.school_id);
    const role = adminSvc.isAdmin(schoolUser) ? 'admin' : 'teacher';
    const session = await sessions.createAdminSession(phone, schoolUser, waAccount, role as 'admin' | 'teacher');
    const schoolWa = new WhatsApp(waAccount);
    await showAdminMenu(phone, session, schoolWa);
    return;
  }

  // ── 4. Unknown user → START AI MARKETING/DEMO BOT ───────────────────
  console.log(`[Bot] New Lead detected: ${phone}. Handing over to AI Sabi.`);
  const { handleMarketingMessage } = await import('../../marketing-webhook/_shared/bot.handler.ts');
  await handleMarketingMessage(message);
}
