// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { START, END, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getSessionData } from "@/lib/session-store";

export const runtime = "nodejs";

const base = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", temperature: 0 });

// "anything with invoke()" so tool-bound model type-checks
type Invoker = { invoke: (input: unknown) => Promise<any> };

// — helpers —
const makeCallModel =
  (llm: Invoker) =>
  async (state: typeof MessagesAnnotation.State) => {
    const response = await llm.invoke(state.messages);
    return { messages: response };
  };

const hasToolCalls = (msg: AIMessage) => {
  const tc1 = (msg as any).tool_calls;
  const tc2 = (msg as any).additional_kwargs?.tool_calls;
  return Array.isArray(tc1) ? tc1.length > 0 : Array.isArray(tc2) && tc2.length > 0;
};

const shouldContinue = (state: typeof MessagesAnnotation.State) => {
  const last = state.messages[state.messages.length - 1];
  return last instanceof AIMessage && hasToolCalls(last) ? "tools" : END;
};

type WireMessage = { role: "user" | "assistant" | "system"; content: string };
type ChatPayload = {
  threadId: string;
  profile: { userName: string; yearsExp?: number; education?: string; skills?: string[] };
  messages: WireMessage[];
};

export async function POST(req: NextRequest) {
  try {
    const { profile, messages, threadId } = (await req.json()) as ChatPayload;
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
    if (!Array.isArray(messages) || messages.length === 0)
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });

    console.log(threadId);

    // --- tools (function calling) ---

const asJSON = (v: unknown) => JSON.stringify(v ?? null);

const session = await getSessionData(threadId) ?? {}; // durable read

const getPathData = tool(
  async (_: {}) => {
    const raw: any = (session as any)?.pathData ?? {};
    const targets = Array.isArray(raw?.targets)
      ? raw.targets
          .map((t: any) => ({
            id: typeof t?.id === "string" ? t.id : String(t?.id ?? ""),
            label: typeof t?.label === "string" ? t.label : String(t?.label ?? ""),
          }))
          .filter((t: any) => t.label)
      : [];
    const meta = {
      userSkills: Array.isArray(raw?.meta?.userSkills) ? raw.meta.userSkills.map(String) : [],
      topGaps: Array.isArray(raw?.meta?.topGaps) ? raw.meta.topGaps.map(String) : [],
    };
    // RETURN STRING
    return asJSON({ targets, meta });
  },
  { name: "get_path_data", description: "...", schema: z.object({}) }
);

const getDecisionDuel = tool(
  async (_: {}) => asJSON(session.decisionDuel ?? {}),
  { name: "get_decision_duel", description: "...", schema: z.object({}) }
);

const getTradeoffs = tool(
  async (_: {}) => asJSON(session.tradeoffs ?? []),
  { name: "get_tradeoffs", description: "...", schema: z.object({}) }
);

const getPeopleLikeMe = tool(
  async (_: {}) => asJSON(session.peopleLikeMe ?? []),
  { name: "get_people_like_me", description: "...", schema: z.object({}) }
);

const getWeekPlan = tool(
  async ({ phase }: { phase?: string }) => {
    const wp: any = session.weekPlan ?? {};
    if (phase && Array.isArray(wp?.phases)) {
      const pm = wp.phases.find((p: any) => p.label === phase);
      const weeks = (wp.weeks ?? []).filter((w: any) => w.week >= pm?.start && w.week <= pm?.end);
      return asJSON({ ...wp, weeks }); // RETURN STRING
    }
    return asJSON(wp); // RETURN STRING
  },
  { name: "get_week_plan", description: "...", schema: z.object({ phase: z.string().optional() }) }
);

    // bind tools to model
    const llmWithTools = base.bindTools([getPathData, getDecisionDuel, getTradeoffs, getPeopleLikeMe, getWeekPlan]);

    // build a graph that EXECUTES tools when requested
    const toolNode = new ToolNode([getPathData, getDecisionDuel, getTradeoffs, getPeopleLikeMe, getWeekPlan]);

    const app = new StateGraph(MessagesAnnotation)
      .addNode("model", makeCallModel(llmWithTools as Invoker))
      .addNode("tools", toolNode)
      .addEdge(START, "model")
      .addConditionalEdges("model", shouldContinue) // model -> tools OR END
      .addEdge("tools", "model") // loop back after tools run
      .compile();

    const systemPrompt = `
You are a concise, pragmatic career coach inside "Pathwise".
- Use function calls (tools) ONLY when you need specific data.
- Be specific and measurable (timelines, resources, deliverables).
- If uncertain, say how to validate quickly.
- Do not mention any function calls or any function to user query
- Answer briefly and generally

User profile:
- Name: ${profile?.userName ?? "Unknown"}
- Experience (years): ${profile?.yearsExp ?? "—"}
- Education: ${profile?.education ?? "—"}
- Skills: ${(profile?.skills ?? []).join(", ") || "—"}
`.trim();

    const clientTurns = messages.filter((m) => m.role !== "system");
    const input: WireMessage[] = [{ role: "system", content: systemPrompt }, ...clientTurns];

    const output = await app.invoke({ messages: input });

    const finalMsgs = (output as any).messages ?? [];
    const last = finalMsgs[finalMsgs.length - 1];

    // robust content extraction
    let reply = "";
    if (typeof last?.content === "string") {
      reply = last.content;
    } else if (Array.isArray(last?.content)) {
      reply = last.content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("");
    }

    // Fallback if somehow empty
    if (!reply || !reply.trim()) reply = "I’m here. Ask me about your paths, trade-offs, week plan, or people like you.";

    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
