import { structuredConfig, structuredOutput } from "@/lib/llm";
import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";


// extract information then ingest it
export async function POST(req: NextRequest) {
  const { text, userId } = await req.json();

    // LLM skill extraction
    const config: structuredConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { 
            skills: { type: Type.ARRAY, items: { type: Type.STRING } },
            yearsExperience: { type: Type.INTEGER },
            education: { type: Type.STRING }
        },
        required: ["skills", "yearsExperience", "education"],
        propertyOrdering: ["skills", "yearsExperience", "education"],
      },
    };
    const llmPrompt = `You are given a text input containing information about a candidate’s background:\n\n${text}`;
    try {
      const res = await structuredOutput(llmPrompt, config);
      const parsed = JSON.parse(res);
      console.log(parsed)
      return NextResponse.json(parsed);
    } catch (e: any) {
      throw new Error(`Error in extracting background: ${e.message} `)
    }
}
