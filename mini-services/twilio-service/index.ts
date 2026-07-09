import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ulawDecodeBase64,
  ulawEncodeBase64,
  resamplePcm,
  pcmToWav,
  wavToPcm,
  calculateRms,
} from './ulaw';

// ==================== CONFIG ====================
const PORT = 3004;
const ZAI_BASE = process.env.ZAI_BASE || 'http://localhost:3000';

// Silence detection settings
const SILENCE_THRESHOLD = 300;   // RMS below this = silence
const SILENCE_DURATION_MS = 800; // ms of silence before we consider speech ended
const MIN_SPEECH_DURATION_MS = 300; // Minimum speech length to process

// ==================== STATE ====================

interface CallSession {
  streamSid: string;
  callSid: string;
  ws: WebSocket;
  agentId: string | null;
  sessionId: string;
  audioBuffer: Int16Array[];
  bufferTimestamps: number[];
  isSpeaking: boolean;
  isProcessing: boolean;
  speechStartTime: number | null;
  lastSpeechTime: number | null;
  silenceTimer: ReturnType<typeof setTimeout> | null;
  conversationHistory: { role: string; content: string }[];
  callStartTime: number;
}

const activeCalls = new Map<string, CallSession>();

// ==================== AI FUNCTIONS ====================

async function speechToText(pcm8k: Int16Array): Promise<string> {
  // Convert 8kHz PCM to WAV
  const wavBuffer = pcmToWav(pcm8k, 8000);

  const res = await fetch(`${ZAI_BASE}/api/voice/asr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: wavBuffer.toString('base64') }),
  });

  if (!res.ok) throw new Error(`ASR failed: ${res.status}`);
  const data = await res.json();
  return data.text || '';
}

async function chatWithAgent(message: string, session: CallSession): Promise<{ response: string; wantsTransfer: boolean }> {
  const res = await fetch(`${ZAI_BASE}/api/voice/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      agentId: session.agentId,
      sessionId: session.sessionId,
    }),
  });

  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
  return await res.json();
}

async function textToSpeechPcm8k(text: string, voice: string = 'tongtong', speed: number = 1.0): Promise<Int16Array> {
  const res = await fetch(`${ZAI_BASE}/api/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);

  // Get WAV buffer
  const arrayBuffer = await res.arrayBuffer();
  const wavBuffer = Buffer.from(new Uint8Array(arrayBuffer));

  // Extract PCM
  const { pcm, sampleRate } = wavToPcm(wavBuffer);

  // Resample from TTS sample rate (24000) to 8000
  const pcm8k = resamplePcm(pcm, sampleRate, 8000);

  return pcm8k;
}

async function saveCallLog(session: CallSession, status: string) {
  const duration = Math.floor((Date.now() - session.callStartTime) / 1000);
  const transcript = JSON.stringify(
    session.conversationHistory.filter(m => m.role !== 'assistant' || m.role === 'user').map(m => ({
      role: m.role, content: m.content
    }))
  );

  try {
    await fetch(`${ZAI_BASE}/api/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: session.agentId,
        duration,
        status,
        transcript,
      }),
    });
  } catch (err) {
    console.error('Failed to save call log:', err);
  }
}

// ==================== AUDIO PROCESSING ====================

function handleAudioChunk(session: CallSession, base64Payload: string) {
  if (session.isProcessing) return; // Don't buffer while processing

  try {
    // Decode μ-law to 16-bit PCM (8000 Hz)
    const pcm8k = ulawDecodeBase64(base64Payload);

    // Calculate energy for silence detection
    const rms = calculateRms(pcm8k);

    const now = Date.now();

    if (rms > SILENCE_THRESHOLD) {
      // Speech detected
      if (!session.isSpeaking) {
        session.isSpeaking = true;
        session.speechStartTime = now;
        console.log(`[${session.callSid}] Speech started`);
      }
      session.lastSpeechTime = now;

      // Buffer the audio
      session.audioBuffer.push(pcm8k);
      session.bufferTimestamps.push(now);

      // Clear silence timer
      if (session.silenceTimer) {
        clearTimeout(session.silenceTimer);
        session.silenceTimer = null;
      }
    } else if (session.isSpeaking) {
      // Silence during speech — start timer
      if (!session.silenceTimer) {
        session.silenceTimer = setTimeout(() => {
          if (session.isSpeaking) {
            processSpeech(session);
          }
        }, SILENCE_DURATION_MS);
      }
    }
  } catch (err) {
    console.error(`[${session.callSid}] Audio decode error:`, err);
  }
}

async function processSpeech(session: CallSession) {
  session.isSpeaking = false;
  session.silenceTimer = null;

  // Check minimum speech duration
  if (session.speechStartTime && Date.now() - session.speechStartTime < MIN_SPEECH_DURATION_MS) {
    session.audioBuffer = [];
    session.bufferTimestamps = [];
    return;
  }

  if (session.audioBuffer.length === 0) return;

  session.isProcessing = true;

  try {
    // Concatenate all buffered audio
    const totalLength = session.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const fullPcm = new Int16Array(totalLength);
    let offset = 0;
    for (const buf of session.audioBuffer) {
      fullPcm.set(buf, offset);
      offset += buf.length;
    }
    session.audioBuffer = [];
    session.bufferTimestamps = [];

    console.log(`[${session.callSid}] Processing ${totalLength} samples of speech...`);

    // Step 1: ASR
    const userText = await speechToText(fullPcm);
    if (!userText.trim()) {
      console.log(`[${session.callSid}] No speech detected in audio`);
      session.isProcessing = false;
      return;
    }

    console.log(`[${session.callSid}] Caller: "${userText}"`);
    session.conversationHistory.push({ role: 'user', content: userText });

    // Step 2: LLM
    const chatResult = await chatWithAgent(userText, session);
    console.log(`[${session.callSid}] Agent: "${chatResult.response}"`);
    session.conversationHistory.push({ role: 'assistant', content: chatResult.response });

    // Step 3: TTS → send audio back
    const responsePcm = await textToSpeechPcm8k(chatResult.response);

    // Send in chunks of 160ms (1280 samples at 8kHz = 160ms Twilio media chunk)
    const CHUNK_SIZE = 1280;
    for (let i = 0; i < responsePcm.length; i += CHUNK_SIZE) {
      const chunk = responsePcm.slice(i, Math.min(i + CHUNK_SIZE, responsePcm.length));
      const ulawBase64 = ulawEncodeBase64(chunk);

      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          event: 'media',
          streamSid: session.streamSid,
          media: { payload: ulawBase64 },
        }));
      }

      // Throttle to real-time speed (160ms per chunk)
      await new Promise(r => setTimeout(r, 150));
    }

    // Check for end of call
    const endKeywords = ['bye', 'goodbye', 'that\'s all', 'nothing else', 'hang up', 'thank you bye'];
    if (endKeywords.some(kw => userText.toLowerCase().includes(kw))) {
      console.log(`[${session.callSid}] End of call detected`);
      await sendGoodbyeAndEnd(session);
    }

  } catch (err) {
    console.error(`[${session.callSid}] Processing error:`, err);
  } finally {
    session.isProcessing = false;
  }
}

async function sendGoodbyeAndEnd(session: CallSession) {
  try {
    const goodbye = 'Thank you for calling. Have a great day. Goodbye!';
    const pcm = await textToSpeechPcm8k(goodbye);
    const CHUNK_SIZE = 1280;
    for (let i = 0; i < pcm.length; i += CHUNK_SIZE) {
      const chunk = pcm.slice(i, Math.min(i + CHUNK_SIZE, pcm.length));
      const ulawBase64 = ulawEncodeBase64(chunk);
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          event: 'media',
          streamSid: session.streamSid,
          media: { payload: ulawBase64 },
        }));
      }
      await new Promise(r => setTimeout(r, 150));
    }
  } catch (err) {
    console.error('Goodbye TTS error:', err);
  }

  // End the call
  setTimeout(() => {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ event: 'stop', streamSid: session.streamSid }));
    }
    saveCallLog(session, 'completed');
    activeCalls.delete(session.streamSid);
    console.log(`[${session.callSid}] Call ended`);
  }, 500);
}

async function playGreeting(session: CallSession) {
  try {
    // Fetch agent from the main app
    const agentRes = await fetch(`${ZAI_BASE}/api/agents/${session.agentId}`);
    if (!agentRes.ok) {
      console.error('Failed to fetch agent');
      return;
    }
    const agent = await agentRes.json();

    const greeting = agent.greeting || 'Hello! Thank you for calling. How can I help you?';
    console.log(`[${session.callSid}] Playing greeting: "${greeting}"`);

    const pcm = await textToSpeechPcm8k(greeting, agent.voice || 'tongtong', agent.speed || 1.0);

    const CHUNK_SIZE = 1280;
    for (let i = 0; i < pcm.length; i += CHUNK_SIZE) {
      const chunk = pcm.slice(i, Math.min(i + CHUNK_SIZE, pcm.length));
      const ulawBase64 = ulawEncodeBase64(chunk);
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          event: 'media',
          streamSid: session.streamSid,
          media: { payload: ulawBase64 },
        }));
      }
      await new Promise(r => setTimeout(r, 150));
    }

    console.log(`[${session.callSid}] Greeting complete, listening for caller...`);
  } catch (err) {
    console.error(`[${session.callSid}] Greeting error:`, err);
  }
}

// ==================== WEBSOCKET SERVER ====================

const server = createServer();
const wss = new WebSocketServer({ server, path: '/' });

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');

  let currentSession: CallSession | null = null;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'connected':
          console.log(`Call connected: streamSid=${msg.start.streamSid}, callSid=${msg.start.callSid}`);

          currentSession = {
            streamSid: msg.start.streamSid,
            callSid: msg.start.callSid,
            ws,
            agentId: null, // Will be set via query param or default
            sessionId: msg.start.callSid,
            audioBuffer: [],
            bufferTimestamps: [],
            isSpeaking: false,
            isProcessing: false,
            speechStartTime: null,
            lastSpeechTime: null,
            silenceTimer: null,
            conversationHistory: [],
            callStartTime: Date.now(),
          };

          // Get agent from query params or use first active
          const url = new URL(req.url || '/', `http://localhost:${PORT}`);
          const agentId = url.searchParams.get('agentId');

          if (agentId) {
            currentSession.agentId = agentId;
          } else {
            // Fetch first active agent
            try {
              const agentsRes = await fetch(`${ZAI_BASE}/api/agents`);
              const agents = await agentsRes.json();
              const firstActive = agents.find((a: { isActive: boolean }) => a.isActive);
              if (firstActive) {
                currentSession.agentId = firstActive.id;
                console.log(`Using agent: ${firstActive.name}`);
              }
            } catch (err) {
              console.error('Failed to fetch agents:', err);
            }
          }

          activeCalls.set(msg.start.streamSid, currentSession);

          // Play greeting after a short delay
          setTimeout(() => {
            if (currentSession) playGreeting(currentSession);
          }, 500);
          break;

        case 'media':
          if (currentSession && msg.media?.payload) {
            handleAudioChunk(currentSession, msg.media.payload);
          }
          break;

        case 'stop':
          console.log(`Call stopped: streamSid=${msg.streamSid}`);
          if (currentSession) {
            saveCallLog(currentSession, 'completed');
            activeCalls.delete(msg.streamSid);
            currentSession = null;
          }
          break;

        case 'mark':
          // Twilio media boundary marker - can be used for timing
          break;
      }
    } catch (err) {
      console.error('Message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket disconnected');
    if (currentSession) {
      saveCallLog(currentSession, 'ended');
      activeCalls.delete(currentSession.streamSid);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`🟢 Twilio Media Streams service running on port ${PORT}`);
  console.log(`   WebSocket endpoint: ws://localhost:${PORT}/`);
  console.log(`   Main app: ${ZAI_BASE}`);
  console.log(`   Active calls: 0`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  // End all active calls
  for (const [sid, session] of activeCalls) {
    saveCallLog(session, 'system_shutdown');
  }
  wss.close(() => {
    server.close(() => process.exit(0));
  });
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  for (const [sid, session] of activeCalls) {
    saveCallLog(session, 'system_shutdown');
  }
  wss.close(() => {
    server.close(() => process.exit(0));
  });
});