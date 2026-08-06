// ============================================================
// SCHOOLBOT - AI SERVICE (Marketing Bot)
// supabase/functions/marketing-webhook/_shared/ai.service.ts
// ============================================================

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    const provider = Deno.env.get('AI_PROVIDER') ?? 'groq';

    if (provider === 'groq') {
      this.apiKey = Deno.env.get('GROQ_API_KEY') ?? '';
      this.model = 'llama-3.1-8b-instant';
      this.baseUrl = 'https://api.groq.com/openai/v1';
    } else {
      this.apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
      this.model = 'gpt-4o-mini';
      this.baseUrl = 'https://api.openai.com/v1';
    }
  }

  // ─── Get AI response ─────────────────────────────────────
  async chat(
    messages: Message[],
    context: Record<string, unknown> = {}
  ): Promise<string> {
    try {
      const system = this.buildSystemPrompt(context);

      const res = await fetch(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              ...messages.slice(-10),
            ],
            max_tokens: 300,
            temperature: 0.7,
          }),
        }
      );

      if (!res.ok) {
        console.error('[AI] Error:', await res.text());
        return this.fallback(context);
      }

      const data = await res.json();
      return (
        data.choices?.[0]?.message?.content ??
        this.fallback(context)
      );
    } catch (err) {
      console.error('[AI] chat error:', err);
      return this.fallback(context);
    }
  }

  // ─── Detect intent ───────────────────────────────────────
  async detectIntent(message: string): Promise<{
    intent: string;
    entities: Record<string, string>;
  }> {
    const prompt =
      `Analyze this WhatsApp message from a Nigerian school owner.\n\n` +
      `Message: "${message}"\n\n` +
      `Reply with JSON only:\n` +
      `{\n` +
      `  "intent": "one of: greeting|see_demo|attendance_demo|fees_demo|pickup_demo|pricing|register|question|not_interested",\n` +
      `  "entities": {\n` +
      `    "school_name": "if mentioned",\n` +
      `    "student_count": "if mentioned",\n` +
      `    "location": "if mentioned",\n` +
      `    "school_type": "if mentioned"\n` +
      `  }\n` +
      `}`;

    try {
      const res = await fetch(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.1,
          }),
        }
      );

      const data = await res.json();
      const content =
        data.choices?.[0]?.message?.content ?? '{}';

      // Extract JSON from response
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }

      return { intent: 'greeting', entities: {} };
    } catch {
      return { intent: 'greeting', entities: {} };
    }
  }

  // ─── Build system prompt ─────────────────────────────────
  private buildSystemPrompt(
    context: Record<string, unknown>
  ): string {
    const name = context.contactName as string | null;
    const school = context.schoolName as string | null;
    const registered = context.registered as boolean;

    return (
      `You are Sabi, a friendly sales assistant for SchoolBot.\n` +
      `SchoolBot is a WhatsApp-based school management platform in Nigeria.\n\n` +

      `YOUR PERSONALITY:\n` +
      `- Warm, friendly and encouraging\n` +
      `- Speak like a knowledgeable Nigerian professional\n` +
      `- Use simple English\n` +
      `- Never pushy - guide naturally\n` +
      `- Use emojis naturally\n\n` +

      `ABOUT SCHOOLBOT:\n` +
      `- WhatsApp bot for parents to check attendance, pay fees, view pickup\n` +
      `- School admins manage everything from WhatsApp\n` +
      `- Real-time attendance alerts to parents automatically\n` +
      `- Online fee payment via Paystack split pay\n` +
      `- School gets 100% of fees, small 1.5% platform fee added on parent bill\n` +
      `- One-time setup fee based on student count (₦25k to ₦250k)\n` +
      `- No monthly subscription!\n\n` +

      `CURRENT USER:\n` +
      `- Name: ${name ?? 'not known yet'}\n` +
      `- School: ${school ?? 'not mentioned yet'}\n` +
      `- Registered: ${registered ? 'Yes' : 'No'}\n\n` +

      `YOUR GOALS:\n` +
      `1. Understand their school\n` +
      `2. Show relevant demo\n` +
      `3. Answer questions\n` +
      `4. Encourage registration\n\n` +

      `RULES:\n` +
      `- Keep responses SHORT (2-3 sentences max)\n` +
      `- Always end with a question or next step\n` +
      `- When they seem ready, guide to registration\n` +
      `- NEVER make up features that don't exist`
    );
  }

  // ─── Fallback when AI fails ──────────────────────────────
  private fallback(context: Record<string, unknown>): string {
    const responses = [
      `I'd love to show you how SchoolBot works! 😊 Would you like to see the attendance system or fee collection first?`,
      `SchoolBot has helped many Nigerian schools improve parent communication. What would you like to explore? 🏫`,
      `Great question! SchoolBot makes school management easy via WhatsApp. Want to see a demo? 📱`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
}
