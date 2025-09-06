import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // or 'edge' if you prefer (adjust fetch accordingly)

type ChatPayload = {
  profile: {
    userName: string;
    yearsExp?: number;
    education?: string;
    skills?: string[];
    // add any other fields you keep in UserProfile
  };
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
};

export async function POST(req: NextRequest) {
  try {
    const { profile, messages } = (await req.json()) as ChatPayload;

    const systemPrompt = `
You are a concise, pragmatic career coach inside a UI called "Career Strategy Studio".
- Be specific and measurable when recommending actions (timelines, resources, deliverables).
- Prefer plain language, short paragraphs, and bulleted steps.
- Align suggestions to the user's profile when possible.
- If a claim is uncertain, say so and suggest how to validate quickly.

User profile:
- Name: ${profile?.userName ?? 'Unknown'}
- Experience (years): ${profile?.yearsExp ?? '—'}
- Education: ${profile?.education ?? '—'}
- Skills: ${(profile?.skills ?? []).join(', ') || '—'}
    `.trim();

    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role !== 'system'),
      ],
      temperature: 0.4,
    };

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: 'Missing OPENAI_API_KEY on server' },
        { status: 500 }
      );
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json(
        { error: `Upstream error: ${resp.status} ${errText}` },
        { status: 500 }
      );
    }

    const data = await resp.json();
    const reply: string =
      data?.choices?.[0]?.message?.content ??
      "I couldn't generate a response this time.";

    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unexpected error' }, { status: 500 });
  }
}
