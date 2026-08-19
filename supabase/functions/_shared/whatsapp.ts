// ============================================================
// SCHOOLBOT - WHATSAPP CLIENT
// supabase/functions/_shared/whatsapp.ts
// ✅ Fixed: downloadMedia uses correct token
// ✅ Fixed: Detailed logging for debugging
// ✅ Fixed: Better error messages
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

    this.url =
      `${baseUrl}/${phoneNumberId}/messages`;
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
    const originalTotal = sections.reduce(
      (sum, s) => sum + s.rows.length, 0
    );

    let totalRows      = 0;
    const safeSections = sections
      .map((section) => {
        const availableSlots =
          Math.max(0, 10 - totalRows);
        const safeRows =
          section.rows.slice(0, availableSlots);
        totalRows += safeRows.length;
        return { ...section, rows: safeRows };
      })
      .filter((s) => s.rows.length > 0);

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
        header: { type: 'text', text: header },
        body:   { text: body },
        footer: { text: footer },
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
        name:       templateName,
        language:   { code: languageCode },
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
  // ✅ Fixed: Full logging at every step
  // ✅ Fixed: Proper error handling
  // ✅ Fixed: Uses correct token from constructor
  async downloadMedia(
    mediaId: string
  ): Promise<string | null> {
    try {
      const baseUrl =
        Deno.env.get('WHATSAPP_API_URL') ??
        'https://graph.facebook.com/v18.0';

      console.log(
        `[WhatsApp] downloadMedia:\n` +
        `  mediaId: ${mediaId}\n` +
        `  token: ${
          this.token
            ? this.token.substring(0, 10) + '...'
            : '❌ MISSING'
        }`
      );

      if (!this.token) {
        console.error(
          '[WhatsApp] ❌ No access token — ' +
          'cannot download media'
        );
        return null;
      }

      // ── Step 1: Get media download URL ────────────────
      const mediaApiUrl = `${baseUrl}/${mediaId}`;

      console.log(
        `[WhatsApp] Getting media URL: ${mediaApiUrl}`
      );

      const urlRes = await fetch(mediaApiUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'User-Agent':  'schoolbot/1.0',
        },
      });

      const urlBody = await urlRes.text();

      console.log(
        `[WhatsApp] Media URL response:\n` +
        `  status: ${urlRes.status}\n` +
        `  body: ${urlBody.substring(0, 400)}`
      );

      if (!urlRes.ok) {
        console.error(
          `[WhatsApp] ❌ Media URL request failed:\n` +
          `  status: ${urlRes.status}\n` +
          `  body: ${urlBody}`
        );
        return null;
      }

      let urlData: Record<string, unknown>;
      try {
        urlData = JSON.parse(urlBody);
      } catch {
        console.error(
          '[WhatsApp] ❌ Could not parse ' +
          'media URL response as JSON'
        );
        return null;
      }

      const downloadUrl = urlData.url as string;

      if (!downloadUrl) {
        console.error(
          '[WhatsApp] ❌ No download URL in response:\n' +
          JSON.stringify(urlData)
        );
        return null;
      }

      console.log(
        `[WhatsApp] Download URL obtained ✅`
      );

      // ── Step 2: Download the actual file ──────────────
      const fileRes = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'User-Agent':  'schoolbot/1.0',
        },
      });

      console.log(
        `[WhatsApp] File download response:\n` +
        `  status: ${fileRes.status}\n` +
        `  content-type: ${
          fileRes.headers.get('content-type') ?? 'none'
        }\n` +
        `  content-length: ${
          fileRes.headers.get('content-length') ?? 'none'
        }`
      );

      if (!fileRes.ok) {
        const errBody = await fileRes.text();
        console.error(
          `[WhatsApp] ❌ File download failed:\n` +
          `  status: ${fileRes.status}\n` +
          `  body: ${errBody.substring(0, 200)}`
        );
        return null;
      }

      const buffer = await fileRes.arrayBuffer();

      console.log(
        `[WhatsApp] File downloaded:\n` +
        `  size: ${buffer.byteLength} bytes`
      );

      if (buffer.byteLength === 0) {
        console.error(
          '[WhatsApp] ❌ Downloaded file is empty'
        );
        return null;
      }

      // Decode as UTF-8 text (correct for CSV files)
      const text =
        new TextDecoder('utf-8').decode(buffer);

      console.log(
        `[WhatsApp] ✅ File decoded:\n` +
        `  chars: ${text.length}\n` +
        `  preview: "${text.substring(0, 150)}"`
      );

      return text;
    } catch (err) {
      console.error(
        '[WhatsApp] ❌ downloadMedia error:',
        err instanceof Error
          ? err.message
          : String(err)
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
