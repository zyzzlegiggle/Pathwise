import { NextRequest, NextResponse } from 'next/server';
import { mergeSessionData } from '@/lib/session-store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { threadId, data } = await req.json();
    if (!threadId || typeof data !== 'object' || data === null) {
      return NextResponse.json({ error: 'threadId and data (object) required' }, { status: 400 });
    }
    const merged = await mergeSessionData(threadId, data);
    return NextResponse.json({ ok: true, data: merged });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unexpected error' }, { status: 500 });
  }
}
