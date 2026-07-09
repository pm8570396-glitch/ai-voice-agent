import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audio } = body; // base64 encoded audio

    if (!audio) {
      return NextResponse.json({ error: 'Audio data is required' }, { status: 400 });
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const response = await zai.audio.asr.create({
      file_base64: audio,
    });

    const text = response.text || '';

    return NextResponse.json({ text });
  } catch (error) {
    console.error('ASR Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Speech recognition failed' },
      { status: 500 }
    );
  }
}