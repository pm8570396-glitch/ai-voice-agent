import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice = 'tongtong', speed = 1.0 } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const chunks = splitTextIntoChunks(text.trim(), 1000);

    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const audioBuffers: Buffer[] = [];

    for (const chunk of chunks) {
      const response = await zai.audio.tts.create({
        input: chunk,
        voice,
        speed: Math.min(Math.max(speed, 0.5), 2.0),
        response_format: 'wav',
        stream: false,
      });

      const arrayBuffer = await response.arrayBuffer();
      audioBuffers.push(Buffer.from(new Uint8Array(arrayBuffer)));
    }

    const finalBuffer = audioBuffers.length === 1
      ? audioBuffers[0]
      : concatenateWavBuffers(audioBuffers);

    return new NextResponse(finalBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': finalBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('TTS Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Text-to-speech failed' },
      { status: 500 }
    );
  }
}

function splitTextIntoChunks(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      if (sentence.length > maxLength) {
        const parts = sentence.split(/,\s*/);
        let subChunk = '';
        for (const part of parts) {
          if ((subChunk + part + ', ').length <= maxLength) {
            subChunk += part + ', ';
          } else {
            if (subChunk) chunks.push(subChunk.trim());
            subChunk = part + ', ';
          }
        }
        if (subChunk) currentChunk = subChunk;
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks;
}

function concatenateWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0);
  if (buffers.length === 1) return buffers[0];

  const headerSize = 44;
  const audioParts: Buffer[] = [];

  for (let i = 0; i < buffers.length; i++) {
    if (i === 0) {
      audioParts.push(buffers[i]);
    } else {
      const buf = buffers[i];
      let dataOffset = headerSize;
      for (let j = 12; j < buf.length - 8; j++) {
        if (buf.toString('ascii', j, j + 4) === 'data') {
          dataOffset = j + 8;
          break;
        }
      }
      audioParts.push(buf.subarray(dataOffset));
    }
  }

  const result = Buffer.concat(audioParts);
  result.writeUInt32LE(result.length - 8, 4);
  const dataSize = result.length - headerSize;
  result.writeUInt32LE(dataSize, 40);

  return result;
}