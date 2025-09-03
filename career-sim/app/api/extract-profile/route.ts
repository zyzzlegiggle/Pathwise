import { structuredConfig, structuredOutput } from "@/lib/llm";
import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

async function ingestProfile() {
  // db operations
}

async function llmExtract(text: string) {
  
  const config: structuredConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        yearsExperience: { type: Type.INTEGER },
        education: { type: Type.STRING },
        userName: { type: Type.STRING },

        resumeNotes: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            topAchievements: { type: Type.ARRAY, items: { type: Type.STRING } },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
      required: ["skills", "yearsExperience", "education", "userName"], // keep original
      propertyOrdering: [
        "skills",
        "yearsExperience",
        "education",
        "userName",
        "resumeNotes",
      ],
    },
  };

  const llmPrompt = `
You are given a text input containing information about a candidate’s background:

---
${text}
---

`;

  try {
    const res = await structuredOutput(llmPrompt, config);
    const parsed = JSON.parse(res);
    return parsed; 
  } catch (e: any) {
    throw new Error(`Error in extracting background: ${e.message}`);
  }
}

export async function POST(req: NextRequest) {
  const { text, userId } = await req.json();

  try {
    const res = await llmExtract(text);
    return NextResponse.json(res); //dont change this
  } catch (e: any) {
    throw new Error(`Error in extracting background: ${e.message}`);
  }
}
