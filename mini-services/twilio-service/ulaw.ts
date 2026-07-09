// μ-law (mu-law) encoding/decoding for telephony audio
// Twilio Media Streams uses μ-law PCM at 8000 Hz

const MU = 255;
const BIAS = 132;
const CLIP = 32635;
const SIGN_BIT = 0x80;
const QUANT_MASK = 0x7F;
const SEG_SHIFT = 7;
const SEG_MASK = 0x70;

// Build μ-law encoding lookup table (14-bit signed → 8-bit unsigned)
const encodeTable = new Uint8Array(32768);
for (let i = 0; i < 32768; i++) {
  const sample = Math.max(-CLIP, Math.min(CLIP, i - 32768));
  const absSample = Math.abs(sample);
  let exponent: number;
  let mantissa: number;

  if (absSample <= 1) {
    exponent = 0;
    mantissa = 0;
  } else {
    exponent = Math.floor(Math.log2(absSample));
    if (exponent > 12) exponent = 12;
    mantissa = Math.round(
      ((absSample >> (exponent + 1)) - BIAS) >> (SEG_SHIFT - exponent)
    );
  }

  const compressed = SIGN_BIT |
    ((exponent + 1) << 4) |
    (mantissa & QUANT_MASK);

  encodeTable[i] = sample < 0
    ? (0xFF - compressed)
    : compressed;
}

// Build μ-law decoding lookup table (8-bit unsigned → 16-bit signed)
const decodeTable = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let compressed = i;
  const isNegative = (compressed & SIGN_BIT) !== 0;
  compressed &= QUANT_MASK;

  const exponent = (compressed & SEG_MASK) >> 4;
  const mantissa = (compressed & QUANT_MASK) << 4;
  const segment = exponent + 1;

  let sample: number;
  if (segment === 1) {
    sample = mantissa + BIAS + 1;
  } else {
    sample = (1 << segment) + mantissa + 1;
  }

  decodeTable[i] = isNegative
    ? -(sample << (segment - 1))
    : (sample << (segment - 1));
}

/** Encode 16-bit PCM to μ-law bytes */
export function ulawEncode(pcm16: Int16Array): Uint8Array {
  const result = new Uint8Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    result[i] = encodeTable[pcm16[i] + 32768];
  }
  return result;
}

/** Decode μ-law bytes to 16-bit PCM */
export function ulawDecode(ulaw: Uint8Array): Int16Array {
  const result = new Int16Array(ulaw.length);
  for (let i = 0; i < ulaw.length; i++) {
    result[i] = decodeTable[ulaw[i]];
  }
  return result;
}

/** Decode base64 μ-law to 16-bit PCM Int16Array */
export function ulawDecodeBase64(base64: string): Int16Array {
  const ulawBuf = Buffer.from(base64, 'base64');
  return ulawDecode(new Uint8Array(ulawBuf));
}

/** Encode 16-bit PCM to base64 μ-law */
export function ulawEncodeBase64(pcm16: Int16Array): string {
  const ulaw = ulawEncode(pcm16);
  return Buffer.from(ulaw).toString('base64');
}

/**
 * Resample 16-bit PCM from one sample rate to another (linear interpolation)
 * Used to convert TTS output (24000 Hz) to telephony (8000 Hz)
 */
export function resamplePcm(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;

    if (idx + 1 < input.length) {
      output[i] = Math.round(input[idx] * (1 - frac) + input[idx + 1] * frac);
    } else {
      output[i] = input[Math.min(idx, input.length - 1)];
    }
  }

  return output;
}

/**
 * Create a WAV buffer from 16-bit PCM data
 */
export function pcmToWav(pcm16: Int16Array, sampleRate: number = 8000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm16.length * blockAlign;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < pcm16.length; i++) {
    buffer.writeInt16LE(pcm16[i], headerSize + i * 2);
  }

  return buffer;
}

/**
 * Extract 16-bit PCM from a WAV buffer
 */
export function wavToPcm(wavBuffer: Buffer): { pcm: Int16Array; sampleRate: number } {
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const channels = wavBuffer.readUInt16LE(22);

  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}. Only 16-bit PCM is supported.`);
  }

  const dataStart = 44;
  const numSamples = (wavBuffer.length - dataStart) / (bitsPerSample / 8);
  const pcm = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    pcm[i] = wavBuffer.readInt16LE(dataStart + i * 2);
  }

  // If stereo, take only first channel
  if (channels === 2) {
    const mono = new Int16Array(Math.floor(numSamples / 2));
    for (let i = 0; i < mono.length; i++) {
      mono[i] = pcm[i * 2];
    }
    return { pcm: mono, sampleRate };
  }

  return { pcm, sampleRate };
}

/**
 * Calculate RMS energy of PCM audio (for silence detection)
 */
export function calculateRms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    sum += pcm[i] * pcm[i];
  }
  return Math.sqrt(sum / pcm.length);
}