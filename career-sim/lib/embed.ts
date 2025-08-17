
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const MODEL = "gemini-embedding-001";
const DIM   = 768; // match your TiDB column

function l2norm(v: number[]) {
  const arr = Array.from(v); // ensure iterable
  const n = Math.hypot(...arr);
  return n === 0 ? arr : arr.map(x => x / n);
}

export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" = "RETRIEVAL_DOCUMENT"
) : Promise<number[]> {
  const res = await ai.models.embedContent({
    model: MODEL,
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

