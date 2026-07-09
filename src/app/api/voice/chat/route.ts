import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const conversationHistories = new Map<string, { role: string; content: string }[]>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, agentId, sessionId } = body;

    if (!message || !sessionId) {
      return NextResponse.json({ error: 'Message and sessionId are required' }, { status: 400 });
    }

    let agent = null;
    if (agentId) {
      agent = await db.voiceAgent.findUnique({
        where: { id: agentId },
        include: { scripts: { where: { isActive: true }, orderBy: { order: 'asc' } } },
      });
    }

    const toneMap: Record<string, string> = {
      professional: 'professional, courteous, and knowledgeable',
      friendly: 'warm, friendly, and approachable',
      formal: 'formal, precise, and business-like',
    };

    const agentTone = agent?.tone || 'professional';
    const toneDesc = toneMap[agentTone] || toneMap.professional;

    let systemPrompt = `You are a ${toneDesc} voice call assistant.`;

    if (agent?.companyName) {
      systemPrompt += ` You represent ${agent.companyName}.`;
    }

    if (agent?.companyDesc) {
      systemPrompt += ` About the company: ${agent.companyDesc}`;
    }

    if (agent?.scripts && agent.scripts.length > 0) {
      systemPrompt += `\n\nYour conversation script and key talking points:\n`;
      for (const script of agent.scripts) {
        systemPrompt += `\n- [${script.title}]: ${script.content}`;
      }
    }

    systemPrompt += `\n\nIMPORTANT RULES:
- Keep your responses concise and conversational, suitable for spoken dialogue.
- Do not use markdown formatting, bullet points, or special characters - just natural speech.
- If the caller asks to be transferred, mention that you can transfer them and list available contacts if known.
- If you don't know something, politely say so and offer to help with what you can.
- Speak as if you're having a real phone conversation - use natural fillers like "Sure," "Of course," "I'd be happy to help."
- Keep each response under 3 sentences unless the caller asks for detailed information.
- When the caller wants to speak to someone specific, acknowledge their request and confirm the transfer.`;

    let history = conversationHistories.get(sessionId) || [
      { role: 'assistant', content: systemPrompt },
    ];

    history.push({ role: 'user', content: message });

    if (history.length > 20) {
      history = [history[0], ...history.slice(-(19))];
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: history,
      thinking: { type: 'disabled' },
    });

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I didn't understand that. Could you please repeat?";

    history.push({ role: 'assistant', content: aiResponse });
    conversationHistories.set(sessionId, history);

    const transferKeywords = ['transfer', 'speak to', 'talk to', 'connect me', 'someone else', 'manager', 'supervisor', 'another person'];
    const wantsTransfer = transferKeywords.some((kw) => message.toLowerCase().includes(kw));

    return NextResponse.json({
      response: aiResponse,
      wantsTransfer,
      sessionId,
    });
  } catch (error) {
    console.error('Chat Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat processing failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (sessionId) {
    conversationHistories.delete(sessionId);
  } else {
    conversationHistories.clear();
  }

  return NextResponse.json({ success: true });
}