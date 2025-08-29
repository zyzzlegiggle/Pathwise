import { structuredConfig, structuredOutput } from "@/lib/llm";
import { PathExplorerData } from "@/types/path-explorer-data";
import { Type } from "@google/genai";
import { UserProfile } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {
  const { userProfile } = await req.json();

    

    
    try {
      return;
    } catch (e: any) {
      throw new Error(`Error in extracting background: ${e.message} `)
    }
}

