import { NextRequest, NextResponse } from 'next/server';

/**
 * Twilio Voice Webhook — Incoming Call Handler
 *
 * When someone calls your Twilio phone number, Twilio sends a POST request here.
 * We respond with TwiML that connects the call to our Media Streams WebSocket.
 */

export async function POST(req: NextRequest) {
  try {
    // Parse form data from Twilio
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;

    console.log(`📞 Incoming call: ${callSid} from ${from} to ${to}`);

    // Get the agent ID from query params or use default
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId') || '';

    // Build the WebSocket URL for Media Streams
    // In production, this would be your deployed server URL (e.g., wss://your-app.com)
    // For local development, use ngrok or a tunnel
    const wsUrl = process.env.TWILIO_WS_URL || `ws://localhost:3004/?agentId=${agentId}`;

    // Generate TwiML response that connects to Media Streams
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
  <Pause length="60" />
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Twilio webhook error:', error);

    // Return a simple TwiML error response
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, there was an error connecting. Please try again later.</Say>
  <Hangup />
</Response>`;

    return new NextResponse(errorTwiml, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });
  }
}

// Handle Twilio status callbacks
export async function GET(req: NextRequest) {
  const healthCheck = {
    status: 'ok',
    service: 'twilio-webhook',
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(healthCheck);
}