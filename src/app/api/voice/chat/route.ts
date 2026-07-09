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

    // Get available contacts for transfer mention
    const availableContacts = await db.contact.findMany({
      where: { isActive: true },
      select: { name: true, role: true, department: true },
    });
    const contactsList = availableContacts.map(c =>
      `${c.name}${c.role ? ` (${c.role})` : ''}${c.department ? ` - ${c.department}` : ''}`
    ).join(', ');

    const toneMap: Record<string, string> = {
      professional: 'professional, courteous, knowledgeable, and efficient',
      friendly: 'warm, friendly, approachable, and helpful',
      formal: 'formal, precise, business-like, and respectful',
    };

    const agentTone = agent?.tone || 'professional';
    const toneDesc = toneMap[agentTone] || toneMap.professional;

    let systemPrompt = `You are a ${toneDesc} customer care call agent answering calls on behalf of a company.`;

    if (agent?.companyName) {
      systemPrompt += ` You work at ${agent.companyName}.`;
    }

    if (agent?.companyDesc) {
      systemPrompt += ` About the company/department: ${agent.companyDesc}`;
    }

    if (agent?.scripts && agent.scripts.length > 0) {
      systemPrompt += `\n\nYOUR SCRIPTS AND KEY INFORMATION:\n`;
      for (const script of agent.scripts) {
        systemPrompt += `\n- [${script.title}]: ${script.content}`;
      }
    }

    if (contactsList) {
      systemPrompt += `\n\nAVAILABLE TEAM MEMBERS FOR TRANSFER: ${contactsList}`;
    }

    systemPrompt += `\n\nBEHAVIOR RULES - ACT LIKE A REAL CUSTOMER CARE AGENT:
- You answer incoming calls automatically. Greet the caller warmly.
- If the caller hasn't given their name, politely ask: "May I know who I'm speaking with?"
- Understand the caller's purpose - ask clarifying questions if needed.
- Provide helpful information based on your scripts. If you don't know something, say "Let me find that out for you" or "I'll make a note of that."
- Use natural phone conversation language: "Sure," "Absolutely," "Of course," "I'd be happy to help with that," "Is there anything else I can help you with?"
- Keep responses SHORT - 1 to 3 sentences maximum. This is a real phone call.
- NEVER use markdown, bullet points, or special characters. Just plain spoken English.
- If the caller wants to speak to someone else, say: "I can transfer you to [relevant person]. Let me connect you now."
- If the caller wants to leave a message, offer to take it: "I'd be happy to take a message for them."
- At the end of the conversation, always ask: "Is there anything else I can help you with today?"
- You are the FIRST point of contact. Your job is to help, inform, or redirect.`;

    let history = conversationHistories.get(sessionId) || [
      { role: 'assistant', content: systemPrompt },
    ];

    history.push({ role: 'user', content: message });

    if (history.length > 24) {
      history = [history[0], ...history.slice(-(23))];
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: history,
      thinking: { type: 'disabled' },
    });

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I didn't quite catch that. Could you please repeat?";

    history.push({ role: 'assistant', content: aiResponse });
    conversationHistories.set(sessionId, history);

    // Detect transfer intent
    const transferKeywords = ['transfer', 'speak to', 'talk to', 'connect me', 'someone else', 'manager', 'supervisor', 'another person', 'real person', 'human', 'agent', 'live person'];
    const wantsTransfer = transferKeywords.some((kw) => message.toLowerCase().includes(kw));

    // Detect end-of-call intent
    const endKeywords = ['bye', 'goodbye', 'that\'s all', 'nothing else', 'hang up', 'thank you bye', 'no that\'s it'];
    const wantsEnd = endKeywords.some((kw) => message.toLowerCase().includes(kw));

    return NextResponse.json({
      response: aiResponse,
      wantsTransfer,
      wantsEnd,
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