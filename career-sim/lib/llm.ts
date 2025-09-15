
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const EMBEDDING_MODEL = "gemini-embedding-001";
const TEXT_MODEL = "gemini-2.5-flash-lite";
const DIM   = 384; // match your TiDB column

function l2norm(v: number[]) {
  const arr = Array.from(v); // ensure iterable
  const n = Math.hypot(...arr);
  return n === 0 ? arr : arr.map(x => x / n);
}

export type structuredConfig = {
  responseMimeType: string,
  responseSchema: Object,
}
export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" = "RETRIEVAL_DOCUMENT"
) : Promise<number[]> {
  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: DIM,
      taskType,
    },
  });

  // res.embeddings is an Iterable<ContentEmbedding>; each item has .values: number[]
  const list = Array.from(res.embeddings ?? []);
  const first = list[0];
  if (!first?.values || first.values.length === 0) {
    throw new Error("No embedding returned from Gemini API");
  }

  return l2norm(first.values.slice());   // plain number[] and normalized
}

export async function structuredOutput(contents: string, config: structuredConfig): Promise<any> {
  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents:
        contents,
      config: config
    });

    console.log(response.text);
    return response.text;
  } catch (e:any) {
    throw new Error(e.message);
  }
}

