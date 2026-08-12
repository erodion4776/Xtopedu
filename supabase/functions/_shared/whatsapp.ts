// ============================================================
// SCHOOLBOT - WHATSAPP CLIENT
// supabase/functions/_shared/whatsapp.ts
// ✅ Fixed: List method enforces 10 row limit
// ============================================================

import type {
  ListSection,
  ButtonOption,
  WhatsAppAccount,
} from './types.ts';

export class WhatsApp {
  private url:   string;
  private token: string;

  constructor(
    account?: Partial<WhatsAppAccount> | null
  ) {
    const phoneNumberId =
      account?.phone_number_id ??
      Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ??
      '';

    this.token =
      account?.access_token ??
      Deno.env.get('WHATSAPP_ACCESS_TOKEN') ??
      '';

    const baseUrl =
      Deno.env.get('WHATSAPP_API_URL') ??
      'https://graph.facebook.com/v18.0';

    this.url = `${baseUrl}/${phoneNumberId}/messages`;
  }

  // ─── Send plain text message ───────────────────────────
  async text(to: string, body: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                this.formatPhone(to),
      type:              'text',
      text: {
        body,
        preview_url: false,
      },
    });
  }

  // ─── Send interactive list menu ────────────────────────
  // ✅ Enforces WhatsApp 10 row limit automatically
  async list(
    to:          string,
    header:      string,
    body:        string,
    footer:      string,
    buttonLabel: string,
    sections:    ListSection[]
  ): Promise<void> {
    // Count total rows
    const originalTotal = sections.reduce(
      (sum, s) => sum + s.rows.length, 0
    );

    // ✅ Enforce 10 row limit
    let totalRows     = 0;
    const safeSections = sections.map((section) => {
      const availableSlots = Math.max(
        0, 10 - totalRows
      );
      const safeRows = section.rows.slice(
        0, availableSlots
      );
      totalRows += safeRows.length;
      return { ...section, rows: safeRows };
    }).filter((s) => s.rows.length > 0);

    // Warn if rows were truncated
    if (originalTotal > 10) {
      console.warn(
        `[WhatsApp] ⚠️ List truncated: ` +
        `${originalTotal} → ${totalRows} rows | ` +
        `header: "${header.substring(0, 30)}"`
      );
    }

    await this.post({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                this.formatPhone(to),
      type:              'interactive',
      interactive: {
        type:   'list',
        header: {
          type: 'text',
          text: header,
        },
        body: {
          text: body,
        },
        footer: {
          text: footer,
        },
        action: {
          button:   buttonLabel,
          sections: safeSections,
        },
      },
    });
  }

  // ─── Send interactive buttons ──────────────────────────
  // Max 3 buttons
  async buttons(
    to:      string,
    body:    string,
    buttons: ButtonOption[],
    header?: string,
    footer?: string
  ): Promise<void> {
    const interactive: Record<string, unknown> = {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((btn) => ({
          type:  'reply',
          reply: {
            id:    btn.id,
            title: String(btn.title).substring(0, 20),
          },
        })),
      },
    };

    if (header) {
      interactive.header = {
        type: 'text',
        text: header,
      };
    }

    if (footer) {
      interactive.footer = { text: footer };
    }

    await this.post({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                this.formatPhone(to),
      type:              'interactive',
      interactive,
    });
  }

  // ─── Send downloadable document ────────────────────────
  async document(
    to:       string,
    link:     string,
    filename: string,
    caption?: string
  ): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                this.formatPhone(to),
      type:              'document',
      document: {
        link,
        filename,
        ...(caption ? { caption } : {}),
      },
    });
  }

  // ─── Send template message ─────────────────────────────
  async template(
    to:           string,
    templateName: string,
    languageCode  = 'en',
    components:   unknown[] = []
  ): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to:                this.formatPhone(to),
      type:              'template',
      template: {
        name:     templateName,
        language: { code: languageCode },
        components,
      },
    });
  }

  // ─── Mark message as read ──────────────────────────────
  async markRead(messageId: string): Promise<void> {
    try {
      await this.post({
        messaging_product: 'whatsapp',
        status:            'read',
        message_id:        messageId,
      });
    } catch {
      console.warn(
        '[WhatsApp] Failed to mark message as read'
      );
    }
  }

  // ─── Download media from WhatsApp ─────────────────────
  async downloadMedia(
    mediaId: string
  ): Promise<string | null> {
    try {
      const baseUrl =
        Deno.env.get('WHATSAPP_API_URL') ??
        'https://graph.facebook.com/v18.0';

      // Step 1: Get media URL
      const urlRes = await fetch(
        `${baseUrl}/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      if (!urlRes.ok) {
        console.error(
          '[WhatsApp] Failed to get media URL'
        );
        return null;
      }

      const urlData = await urlRes.json();

      // Step 2: Download the file
      const fileRes = await fetch(urlData.url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!fileRes.ok) {
        console.error(
          '[WhatsApp] Failed to download media file'
        );
        return null;
      }

      const buffer = await fileRes.arrayBuffer();
      return new TextDecoder().decode(buffer);
    } catch (err) {
      console.error(
        '[WhatsApp] downloadMedia error:', err
      );
      return null;
    }
  }

  // ─── Format phone number ──────────────────────────────
  formatPhone(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0') && p.length === 11) {
      p = '234' + p.slice(1);
    }
    return p;
  }

  // ─── Core HTTP POST to Meta API ───────────────────────
  private async post(payload: unknown): Promise<void> {
    const res = await fetch(this.url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error =
        await res.json().catch(() => ({}));
      console.error(
        '[WhatsApp] API Error:',
        res.status,
        JSON.stringify(error)
      );
      // Don't throw — log and continue
    }
  }
}
