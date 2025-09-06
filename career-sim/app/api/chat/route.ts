import { NextRequest, NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  START,
  END,
  MessagesAnnotation,
  StateGraph,
  // MemorySaver,  // ⬅️ remove
} from '@langchain/langgraph';

export const runtime = 'nodejs';

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0,
});

const callModel = async (state: typeof MessagesAnnotation.State) => {
  const response = await llm.invoke(state.messages);
  return { messages: response };
};

const workflow = new StateGraph(MessagesAnnotation)
  .addNode('model', callModel)
  .addEdge(START, 'model')
  .addEdge('model', END);

const app = workflow.compile(); // ✅ stateless

type WireMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type ChatPayload = {
  threadId: string;
  profile: {
    userName: string;
    yearsExp?: number;
    education?: string;
    skills?: string[];
  };
  messages: WireMessage[];
};

export async function POST(req: NextRequest) {
  try {
    const { profile, messages } = (await req.json()) as ChatPayload;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    // Build one system prompt per request
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

    // Make sure there is only ONE system message at the very beginning
    const clientTurns = messages.filter(m => m.role !== 'system');
    const input: WireMessage[] = [{ role: 'system', content: systemPrompt }, ...clientTurns];

    const output = await app.invoke({ messages: input });

    const last = output.messages[output.messages.length - 1] as any;
    const reply: string =
      typeof last?.content === 'string'
        ? last.content
        : Array.isArray(last?.content)
        ? last.content.map((c: any) => (typeof c === 'string' ? c : c?.text ?? '')).join('')
        : `${last?.content ?? ''}`;

    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unexpected error' }, { status: 500 });
  }
}
