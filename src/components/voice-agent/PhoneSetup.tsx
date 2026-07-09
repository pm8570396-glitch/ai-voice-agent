'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Phone, Globe, Server, Wrench, ExternalLink, Copy, CheckCircle2,
  AlertCircle, ArrowRight, Shield, Zap, Terminal, DollarSign
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

export default function PhoneSetup() {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({ title: 'Copied!', description: `${field} copied to clipboard` });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app';
  const webhookUrl = `${appUrl}/api/twilio/voice`;
  const statusUrl = `${appUrl}/api/twilio/status`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-7 w-7 text-emerald-600" />
            Phone Integration
          </h2>
          <p className="text-muted-foreground mt-1">Connect a real phone number so anyone can call your AI agent</p>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 self-start">
          <Zap className="h-3 w-3" /> Twilio Ready
        </Badge>
      </div>

      {/* Architecture overview */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/50 to-white">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-600" />
            How It Works — End to End
          </h3>
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {[
              { icon: '📞', title: 'Caller Dials', desc: 'Someone calls your Twilio number', color: 'bg-blue-50 border-blue-200' },
              { icon: '🌐', title: 'Twilio Webhook', desc: 'Twilio sends call to your server', color: 'bg-purple-50 border-purple-200' },
              { icon: '🤖', title: 'AI Agent', desc: 'WebSocket streams audio, AI responds', color: 'bg-emerald-50 border-emerald-200' },
              { icon: '🗣️', title: 'Caller Hears', desc: 'AI speaks back in real-time', color: 'bg-amber-50 border-amber-200' },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`flex-1 rounded-xl border p-4 text-center ${step.color}`}>
                  <div className="text-2xl mb-1">{step.icon}</div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
                {i < 3 && <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block flex-shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Setup Steps */}
      <Tabs defaultValue="quickstart" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 h-auto">
          <TabsTrigger value="quickstart" className="py-2.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700">
            <Wrench className="h-4 w-4 mr-1.5" /> Quick Start
          </TabsTrigger>
          <TabsTrigger value="twilio" className="py-2.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700">
            <Phone className="h-4 w-4 mr-1.5" /> Twilio Setup
          </TabsTrigger>
          <TabsTrigger value="deploy" className="py-2.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700">
            <Server className="h-4 w-4 mr-1.5" /> Deploy
          </TabsTrigger>
        </TabsList>

        {/* Quick Start Tab */}
        <TabsContent value="quickstart" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                5-Minute Quick Start
              </CardTitle>
              <CardDescription>Get a phone number and have your AI answering calls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                {
                  step: 1,
                  title: 'Create Twilio Account',
                  desc: 'Go to twilio.com and sign up (free trial includes $15 credit)',
                  action: 'Sign Up Free',
                  url: 'https://www.twilio.com/try-twilio',
                  icon: <ExternalLink className="h-4 w-4" />,
                },
                {
                  step: 2,
                  title: 'Get a Phone Number',
                  desc: 'In Twilio Console → Phone Numbers → Get a Trial Number (free)',
                  action: 'Get Number',
                  url: 'https://console.twilio.com/us1/develop/phone-numbers/getting-started',
                  icon: <Phone className="h-4 w-4" />,
                },
                {
                  step: 3,
                  title: 'Deploy Your App',
                  desc: 'Deploy to Vercel (free) so Twilio can reach your server 24/7',
                  action: 'See Deploy Tab',
                  url: '#',
                  icon: <Server className="h-4 w-4" />,
                },
                {
                  step: 4,
                  title: 'Configure Webhook',
                  desc: 'In Twilio, set your phone number\'s webhook to your app URL',
                  action: 'See Twilio Tab',
                  url: '#',
                  icon: <Wrench className="h-4 w-4" />,
                },
                {
                  step: 5,
                  title: 'Call Your Number!',
                  desc: 'Dial your Twilio number from any phone — your AI answers automatically',
                  action: null,
                  icon: <CheckCircle2 className="h-4 w-4" />,
                },
              ].map(item => (
                <div key={item.step} className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">
                      {item.step}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{item.title}</h4>
                      {item.action && item.url !== '#' && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-6 text-xs gap-1">
                            {item.icon} {item.action}
                          </Button>
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}

              <Separator />

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-start gap-2">
                  <DollarSign className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800 text-sm">Cost Estimate</p>
                    <p className="text-xs text-amber-700 mt-1">
                      <strong>Free trial:</strong> $15 credit (covers ~25 hours of calls)<br />
                      <strong>After trial:</strong> ~$1.15/month for the number + ~$0.013/min for calls<br />
                      <strong>Example:</strong> 100 calls × 3 min each = ~$4/month
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Twilio Config Tab */}
        <TabsContent value="twilio" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="h-5 w-5 text-purple-500" />
                Twilio Configuration
              </CardTitle>
              <CardDescription>Copy these URLs into your Twilio console</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Webhook URL */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">1. Voice Webhook URL</Label>
                <p className="text-xs text-muted-foreground">
                  In Twilio → Phone Numbers → Your Number → Webhook: Set to this URL
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => copyText(webhookUrl, 'Webhook URL')}>
                    {copiedField === 'Webhook URL' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Status Callback URL */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">2. Status Callback URL</Label>
                <p className="text-xs text-muted-foreground">
                  In the same phone number settings, set Status Callback to this URL
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={statusUrl} className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => copyText(statusUrl, 'Status URL')}>
                    {copiedField === 'Status URL' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Twilio Console Settings */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">3. Twilio Console Settings</Label>
                <div className="rounded-lg bg-muted/50 p-4 space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">A CALL COMES IN</p>
                      <p className="text-xs text-muted-foreground">HTTP POST to: <code className="bg-muted px-1 rounded">{webhookUrl}</code></p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Media Streams WebSocket</p>
                      <p className="text-xs text-muted-foreground">Connects to: <code className="bg-muted px-1 rounded">ws://your-server:3004/</code></p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Status Callback</p>
                      <p className="text-xs text-muted-foreground">HTTP POST to: <code className="bg-muted px-1 rounded">{statusUrl}</code></p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* TwiML Response Example */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">What Your Webhook Returns (TwiML)</Label>
                <div className="rounded-lg bg-gray-900 p-4 overflow-x-auto">
                  <pre className="text-xs text-green-400 font-mono">
{`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="ws://your-server:3004/?agentId=YOUR_AGENT_ID" />
  </Connect>
  <Pause length="60" />
</Response>`}
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground">
                  This TwiML tells Twilio to open a WebSocket to your Media Streams service. The AI agent handles everything from there.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Security note */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-800 text-sm">Webhook Security</p>
                  <p className="text-xs text-blue-700 mt-1">
                    For production, enable "Validate Twilio Requests" in your Twilio number settings.
                    This verifies that requests actually come from Twilio using your Auth Token.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deploy Tab */}
        <TabsContent value="deploy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-500" />
                Deployment Guide
              </CardTitle>
              <CardDescription>Deploy your app so it's reachable 24/7</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Accordion type="single" collapsible defaultValue="vercel">
                <AccordionItem value="vercel">
                  <AccordionTrigger className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Option 1: Vercel (Recommended — Free)</span>
                      <Badge className="bg-emerald-100 text-emerald-700">Easiest</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="rounded-lg bg-gray-900 p-4 overflow-x-auto">
                      <pre className="text-xs text-green-400 font-mono">
{`# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy the Next.js app
cd /your-project
vercel

# 3. Note the URL (e.g., https://voice-agent.vercel.app)

# 4. Update Twilio webhook to:
#    https://voice-agent.vercel.app/api/twilio/voice`}
                      </pre>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      For the WebSocket service, deploy it separately on Railway, Render, or Fly.io (see Option 3).
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="railway">
                  <AccordionTrigger className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Option 2: Full Stack on Railway ($5/mo)</span>
                      <Badge variant="secondary">All-in-one</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Railway lets you deploy both the Next.js app AND the WebSocket service in one place with a single domain.
                    </p>
                    <div className="rounded-lg bg-gray-900 p-4 overflow-x-auto">
                      <pre className="text-xs text-green-400 font-mono">
{`# 1. Create a railway.json in your project root:
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": "cd /your-project && npm run build",
  "deploy": ["cd /your-project && npm start"],
  "services": [
    {
      "name": "web",
      "env": { "PORT": "3000" }
    },
    {
      "name": "twilio-ws",
      "root": "mini-services/twilio-service",
      "env": { "PORT": "3004", "ZAI_BASE": "http://web:3000" }
    }
  ]
}

# 2. Push to GitHub, connect Railway, deploy`}
                      </pre>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="local">
                  <AccordionTrigger className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Option 3: Local Testing with ngrok</span>
                      <Badge variant="outline">Free</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Use ngrok to expose your local server to the internet for testing.
                    </p>
                    <div className="rounded-lg bg-gray-900 p-4 overflow-x-auto">
                      <pre className="text-xs text-green-400 font-mono">
{`# Terminal 1: Start the Next.js app
cd /your-project
bun run dev

# Terminal 2: Start the Twilio WebSocket service
cd /your-project/mini-services/twilio-service
bun run dev

# Terminal 3: Expose with ngrok (free)
ngrok http 3000

# ngrok gives you a URL like: https://abc123.ngrok-free.app

# Set this in Twilio as your webhook URL:
# https://abc123.ngrok-free.app/api/twilio/voice

# NOTE: Update TWILIO_WS_URL in .env:
# TWILIO_WS_URL=wss://abc123.ngrok-free.app/?XTransformPort=3004`}
                      </pre>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs text-amber-700">
                        <strong>Important:</strong> ngrok free tier changes URLs each restart.
                        Twilio needs a stable URL. Use ngrok paid or a deployment service for production.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Separator />

              {/* Environment Variables */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Environment Variables Needed</Label>
                <div className="rounded-lg bg-gray-900 p-4 overflow-x-auto">
                  <pre className="text-xs text-green-400 font-mono">
{`# .env file (in your project root)

# Twilio (get from twilio.com/console)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# WebSocket URL for Media Streams
# In production: wss://your-domain.com/?XTransformPort=3004
TWILIO_WS_URL=ws://localhost:3004/`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Architecture Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Technical Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-blue-500" /> Next.js App (Port 3000)
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <code className="bg-muted px-1 rounded">/api/twilio/voice</code> — Webhook: Returns TwiML</li>
                <li>• <code className="bg-muted px-1 rounded">/api/twilio/status</code> — Status callback</li>
                <li>• <code className="bg-muted px-1 rounded">/api/voice/asr</code> — Speech-to-text</li>
                <li>• <code className="bg-muted px-1 rounded">/api/voice/chat</code> — AI conversation</li>
                <li>• <code className="bg-muted px-1 rounded">/api/voice/tts</code> — Text-to-speech</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-1.5">
                <Server className="h-4 w-4 text-emerald-500" /> Twilio WS Service (Port 3004)
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Receives WebSocket stream from Twilio</li>
                <li>• Decodes μ-law audio (8kHz telephony format)</li>
                <li>• Silence detection → sends to ASR</li>
                <li>• Gets AI response from main app</li>
                <li>• Converts TTS audio → μ-law → sends back</li>
                <li>• Continuous loop until caller says "bye"</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}