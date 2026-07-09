import { NextRequest, NextResponse } from 'next/server';

/**
 * Twilio Status Callback — Logs call status changes
 * Configure this URL in Twilio console as the "Status Callback" URL
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const from = formData.get('From') as string;
    const duration = formData.get('CallDuration') as string;

    console.log(`📡 Call Status: ${callStatus} | ${callSid} | From: ${from} | Duration: ${duration || 'N/A'}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Status callback error:', error);
    return NextResponse.json({ success: true });
  }
}