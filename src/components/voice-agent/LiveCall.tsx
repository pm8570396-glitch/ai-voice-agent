'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceAgent, Contact, ChatMessage } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Phone, PhoneOff, PhoneForwarded, PhoneIncoming,
  Bot, User, Volume2, Loader2, AlertCircle, Square,
  Radio, ShieldCheck, Settings2, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LiveCallProps {
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  contacts: Contact[];
}

const uid = () => Math.random().toString(36).substr(2, 9);

type CallState = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended' | 'transferred';

export default function LiveCall({ agents, selectedAgentId, setSelectedAgentId, contacts }: LiveCallProps) {
  const { toast } = useToast();

  // Core call state
  const [callState, setCallState] = useState<CallState>('idle');
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [autoAnswerDelay, setAutoAnswerDelay] = useState(2); // seconds
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Settings dialog
  const [showSettings, setShowSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState(50);

  // Transfer
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferContactId, setTransferContactId] = useState('');
  const [wantsTransfer, setWantsTransfer] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const activeAgent = agents.find(a => a.id === selectedAgentId);
  const availableContacts = contacts.filter(c => c.isActive);

  // Keep mounted ref in sync
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Call duration timer
  useEffect(() => {
    if (callState === 'active' && callStartTime) {
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTime) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState, callStartTime]);

  // Auto-answer incoming call
  useEffect(() => {
    if (autoAnswer && callState === 'ringing' && selectedAgentId) {
      ringTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          answerCall();
        }
      }, autoAnswerDelay * 1000);
      return () => { if (ringTimerRef.current) clearTimeout(ringTimerRef.current); };
    }
  }, [autoAnswer, callState, selectedAgentId, autoAnswerDelay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      stopAllAudio();
      if (timerRef.current) clearInterval(timerRef.current);
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      if (idleListenTimerRef.current) clearTimeout(idleListenTimerRef.current);
    };
  }, []);

  // Auto-resume listening when AI finishes speaking (continuous conversation loop)
  useEffect(() => {
    if (callState === 'active' && !isSpeaking && !isProcessing && !isRecording && !isMuted) {
      const t = setTimeout(() => {
        if (isMountedRef.current && callState === 'active' && !isSpeaking && !isProcessing && !isRecording && !isMuted) {
          startRecording();
        }
      }, 600);
      idleListenTimerRef.current = t;
      return () => clearTimeout(t);
    }
  }, [isSpeaking, isProcessing, callState, isRecording, isMuted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    setMessages(prev => [...prev, { id: uid(), role, content, timestamp: Date.now() }]);
  }, []);

  // === AUDIO ===

  const stopAllAudio = () => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* */ }
      currentSourceRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const playAudioBuffer = async (buffer: ArrayBuffer) => {
    stopAllAudio();
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const audioBuffer = await ctx.decodeAudioData(buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      setIsSpeaking(true);
      source.onended = () => {
        if (isMountedRef.current) setIsSpeaking(false);
        currentSourceRef.current = null;
      };
      currentSourceRef.current = source;
      source.start(0);
    } catch (err) {
      console.error('Audio playback error:', err);
      setIsSpeaking(false);
    }
  };

  const textToSpeech = async (text: string, voice: string, speed: number) => {
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'TTS failed'); }
      const buffer = await res.arrayBuffer();
      await playAudioBuffer(buffer);
    } catch (err) {
      console.error('TTS error:', err);
    }
  };

  // === RECORDING ===

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        if (blob.size > 0 && callState === 'active') {
          await processAudio(blob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic error:', err);
      toast({ title: 'Microphone Needed', description: 'Allow microphone access for voice calls', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  };

  // === VOICE PIPELINE ===

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(audioBlob);
      });

      // ASR
      const asrRes = await fetch('/api/voice/asr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: base64 }),
      });
      if (!asrRes.ok) throw new Error('ASR failed');
      const asrData = await asrRes.json();
      if (!asrData.text?.trim()) { setIsProcessing(false); return; }

      const userText = asrData.text.trim();
      addMessage('user', userText);

      // LLM
      const chatRes = await fetch('/api/voice/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, agentId: selectedAgentId, sessionId }),
      });
      if (!chatRes.ok) throw new Error('Chat failed');
      const chatData = await chatRes.json();

      addMessage('assistant', chatData.response);

      // TTS
      await textToSpeech(chatData.response, activeAgent?.voice || 'tongtong', activeAgent?.speed || 1.0);

      // Transfer detection
      if (chatData.wantsTransfer && availableContacts.length > 0) setWantsTransfer(true);

      // End detection
      if (chatData.wantsEnd) {
        setTimeout(() => { if (isMountedRef.current) endCall(); }, 2000);
      }
    } catch (err) {
      console.error('Processing error:', err);
      addMessage('system', 'Connection issue. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // === CALL CONTROL ===

  const simulateIncomingCall = () => {
    if (!selectedAgentId) {
      toast({ title: 'Select an Agent', description: 'Choose a voice agent first', variant: 'destructive' });
      return;
    }
    setMessages([]);
    setCallDuration(0);
    setWantsTransfer(false);
    setCallState('ringing');
    addMessage('system', 'Incoming call...');
  };

  const answerCall = async () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);

    setCallState('connecting');
    addMessage('system', 'Call answered');

    const newSessionId = uid();
    setSessionId(newSessionId);
    setCallStartTime(Date.now());
    setCallDuration(0);

    // Small delay for "connecting" feel
    await new Promise(r => setTimeout(r, 800));

    if (!isMountedRef.current) return;
    setCallState('active');

    // Play greeting then auto-listen
    if (activeAgent?.greeting) {
      addMessage('assistant', activeAgent.greeting);
      await textToSpeech(activeAgent.greeting, activeAgent.voice, activeAgent.speed);
    }

    // Auto-start listening (continuous loop)
    if (isMountedRef.current && callState !== 'ended') {
      startRecording();
    }
  };

  const endCall = async () => {
    stopRecording();
    stopAllAudio();
    if (timerRef.current) clearInterval(timerRef.current);
    if (idleListenTimerRef.current) clearTimeout(idleListenTimerRef.current);

    const status = callState === 'transferred' ? 'transferred' : 'completed';
    setCallState('ended');

    // Save call log
    try {
      await fetch('/api/calls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, duration: callDuration, status, transcript: JSON.stringify(messages) }),
      });
    } catch { /* silent */ }

    // Clear server session
    try { await fetch(`/api/voice/chat?sessionId=${sessionId}`, { method: 'DELETE' }); } catch { /* */ }

    addMessage('system', `Call ended — ${formatTime(callDuration)}`);

    // Reset after 3 seconds back to idle
    setTimeout(() => {
      if (isMountedRef.current) {
        setCallState('idle');
        setMessages([]);
        setCallStartTime(null);
        setCallDuration(0);
      }
    }, 3000);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (callState === 'active' && !isProcessing && !isSpeaking) startRecording();
    } else {
      setIsMuted(true);
      stopRecording();
    }
  };

  const handleTransfer = async () => {
    if (!transferContactId) return;
    const contact = contacts.find(c => c.id === transferContactId);
    stopRecording();
    stopAllAudio();

    const msg = contact
      ? `I'm transferring you to ${contact.name}${contact.role ? `, our ${contact.role}` : ''}${contact.department ? ` from ${contact.department}` : ''}. Please hold for just a moment.`
      : 'Transferring your call now. Please hold.';

    addMessage('assistant', msg);
    await textToSpeech(msg, activeAgent?.voice || 'tongtong', activeAgent?.speed || 1.0);

    setCallState('transferred');
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      await fetch('/api/calls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, duration: callDuration, status: 'transferred', transcript: JSON.stringify(messages) }),
      });
    } catch { /* */ }

    setShowTransferDialog(false);
    setWantsTransfer(false);
    setTransferContactId('');
    toast({ title: 'Call Transferred', description: `Transferred to ${contact?.name || 'contact'}` });

    setTimeout(() => {
      if (isMountedRef.current) {
        setCallState('idle');
        setMessages([]);
        setCallStartTime(null);
        setCallDuration(0);
      }
    }, 3000);
  };

  // Quick-call shortcut (skip ringing, go straight to active)
  const quickStartCall = async () => {
    if (!selectedAgentId) {
      toast({ title: 'Select an Agent', description: 'Choose a voice agent first', variant: 'destructive' });
      return;
    }
    setMessages([]);
    setCallDuration(0);
    setWantsTransfer(false);

    const newSessionId = uid();
    setSessionId(newSessionId);
    setCallStartTime(Date.now());
    setCallState('active');
    addMessage('system', 'Call started');

    if (activeAgent?.greeting) {
      addMessage('assistant', activeAgent.greeting);
      await textToSpeech(activeAgent.greeting, activeAgent.voice, activeAgent.speed);
    }

    if (isMountedRef.current) startRecording();
  };

  const isIdle = callState === 'idle';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isActive = callState === 'active';
  const isEnded = callState === 'ended';
  const isTransferred = callState === 'transferred';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-7 w-7 text-emerald-600" />
            Live Call
          </h2>
          <p className="text-muted-foreground mt-1">
            {autoAnswer
              ? 'Auto-Answer ON — Calls are picked up automatically'
              : 'Auto-Answer OFF — Answer calls manually'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200">
              <motion.div className="w-2.5 h-2.5 rounded-full bg-red-500" animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} />
              <span className="text-sm font-mono font-medium">{formatTime(callDuration)}</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSettings(true)}>
            <Settings2 className="h-4 w-4" /> Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main area */}
        <div className="lg:col-span-2 space-y-4">

          {/* Agent selector + auto-answer */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <Label className="text-sm font-medium whitespace-nowrap">Agent:</Label>
                  <Select value={selectedAgentId || ''} onValueChange={setSelectedAgentId} disabled={!isIdle}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.filter(a => a.isActive).map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}{a.companyName ? ` (${a.companyName})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <Switch checked={autoAnswer} onCheckedChange={setAutoAnswer} disabled={!isIdle} />
                    <span className="text-xs font-medium text-emerald-700">Auto-Answer</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Call area — shows different states */}
          <Card className="overflow-hidden min-h-[420px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Conversation
                {isActive && <Badge variant="destructive" className="animate-pulse text-xs">LIVE</Badge>}
                {isRinging && <Badge variant="secondary" className="animate-pulse text-xs bg-amber-100 text-amber-700 border-amber-200">INCOMING</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 relative">

              {/* === RINGING STATE === */}
              {isRinging && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <motion.div
                    className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-6 shadow-2xl shadow-emerald-200"
                    animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                  >
                    <PhoneIncoming className="h-10 w-10 text-white" />
                  </motion.div>
                  <h3 className="text-xl font-bold mb-1">Incoming Call</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    {activeAgent?.companyName || 'Unknown'} — {activeAgent?.name || 'Agent'}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
                    <motion.div className="w-1.5 h-1.5 rounded-full bg-amber-500" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} />
                    {autoAnswer ? `Auto-answering in ${autoAnswerDelay}s...` : 'Waiting for you to answer'}
                  </div>
                  <div className="flex gap-3">
                    <Button variant="destructive" size="lg" className="rounded-full w-14 h-14 p-0" onClick={() => { if (ringTimerRef.current) clearTimeout(ringTimerRef.current); setCallState('idle'); setMessages([]); }}>
                      <PhoneOff className="h-6 w-6" />
                    </Button>
                    {!autoAnswer && (
                      <Button size="lg" className="rounded-full w-14 h-14 p-0 bg-emerald-600 hover:bg-emerald-700" onClick={answerCall}>
                        <Phone className="h-6 w-6" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* === CONNECTING STATE === */}
              {isConnecting && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 rounded-full border-4 border-emerald-200" />
                    <motion.div
                      className="absolute inset-0 rounded-full border-4 border-t-emerald-500 border-r-transparent border-b-transparent border-l-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Phone className="h-8 w-8 text-emerald-600" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold">Connecting...</h3>
                  <p className="text-sm text-muted-foreground mt-1">Setting up voice connection</p>
                </div>
              )}

              {/* === ACTIVE / ENDED / TRANSFERRED CONVERSATION === */}
              {(isActive || isEnded || isTransferred) && (
                <ScrollArea className="h-80 px-4 pb-4">
                  <div className="space-y-3 pt-2">
                    <AnimatePresence mode="popLayout">
                      {messages.map(msg => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          <div className={`flex-shrink-0 rounded-full p-2 ${msg.role === 'assistant' ? 'bg-emerald-100' : msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                            {msg.role === 'assistant' ? <Bot className="h-4 w-4 text-emerald-700" /> : msg.role === 'user' ? <User className="h-4 w-4 text-blue-700" /> : <Radio className="h-4 w-4 text-gray-500" />}
                          </div>
                          <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${msg.role === 'assistant' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : msg.role === 'user' ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'bg-gray-50 text-gray-600 border border-gray-200 text-center w-full max-w-full'}`}>
                            {msg.content}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {isProcessing && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                        <div className="flex-shrink-0 rounded-full p-2 bg-emerald-100">
                          <Loader2 className="h-4 w-4 text-emerald-700 animate-spin" />
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                          <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {isSpeaking && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                        <div className="flex-shrink-0 rounded-full p-2 bg-emerald-100">
                          <Volume2 className="h-4 w-4 text-emerald-700" />
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                          Agent is speaking...
                        </div>
                      </motion.div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              )}

              {/* === IDLE STATE === */}
              {isIdle && (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-5">
                    <PhoneIncoming className="h-9 w-9 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Ready for Calls</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mb-6">
                    {autoAnswer
                      ? 'When someone calls, the agent will auto-answer and start the conversation automatically.'
                      : 'Click "Simulate Call" to start a conversation.'}
                  </p>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={simulateIncomingCall} disabled={!selectedAgentId}>
                    <PhoneIncoming className="h-4 w-4" /> Simulate Incoming Call
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Controls sidebar */}
        <div className="space-y-4">

          {/* Call controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Call Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isActive ? (
                <>
                  {/* Mic status */}
                  <div className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${isRecording ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                    <motion.div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500' : 'bg-gray-300'}`}
                      animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
                      transition={isRecording ? { repeat: Infinity, duration: 1.5 } : {}}
                    >
                      {isRecording ? <Mic className="h-6 w-6 text-white" /> : <MicOff className="h-6 w-6 text-white" />}
                    </motion.div>
                    <div>
                      <p className={`font-medium text-sm ${isRecording ? 'text-red-700' : 'text-gray-500'}`}>
                        {isRecording ? 'Listening...' : 'Waiting'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isProcessing ? 'Processing speech...' : isSpeaking ? 'Agent speaking...' : isMuted ? 'Muted' : isRecording ? 'Speak now' : 'Auto-listening paused'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="gap-2 h-11" onClick={toggleMute}>
                      {isMuted ? <MicOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                    <Button variant="outline" className="gap-2 h-11" onClick={() => setShowTransferDialog(true)} disabled={availableContacts.length === 0}>
                      <PhoneForwarded className="h-4 w-4" /> Transfer
                    </Button>
                  </div>

                  <Button className="w-full bg-red-600 hover:bg-red-700 gap-2 h-12" onClick={endCall}>
                    <PhoneOff className="h-5 w-5" /> End Call
                  </Button>
                </>
              ) : isIdle ? (
                <div className="space-y-2">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 h-12" onClick={simulateIncomingCall} disabled={!selectedAgentId}>
                    <PhoneIncoming className="h-5 w-5" /> Simulate Call
                  </Button>
                  <Button variant="outline" className="w-full gap-2 h-10" onClick={quickStartCall} disabled={!selectedAgentId}>
                    <Phone className="h-4 w-4" /> Quick Start
                  </Button>
                </div>
              ) : isRinging ? (
                <div className="space-y-2">
                  {!autoAnswer && (
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 h-12" onClick={answerCall}>
                      <Phone className="h-5 w-5" /> Answer Call
                    </Button>
                  )}
                  <Button variant="destructive" className="w-full gap-2 h-10" onClick={() => { if (ringTimerRef.current) clearTimeout(ringTimerRef.current); setCallState('idle'); setMessages([]); }}>
                    <PhoneOff className="h-4 w-4" /> Reject
                  </Button>
                </div>
              ) : (
                <Button className="w-full gap-2 h-12 opacity-50" disabled>
                  <Clock className="h-5 w-5" /> {isConnecting ? 'Connecting...' : isEnded ? 'Call Ended' : isTransferred ? 'Transferred' : '...'}
                </Button>
              )}

              {/* Status indicators */}
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">State</span>
                  <Badge variant={isActive ? 'destructive' : 'secondary'} className="text-xs">
                    {callState === 'idle' ? 'Standby' : callState === 'ringing' ? 'Ringing' : callState === 'connecting' ? 'Connecting' : callState === 'active' ? 'On Call' : callState === 'transferred' ? 'Transferred' : 'Ended'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Microphone</span>
                  <span className={isRecording ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{isRecording ? 'Active' : 'Off'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Processing</span>
                  <span className={isProcessing ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>{isProcessing ? 'Active' : 'Idle'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Agent Voice</span>
                  <span className={isSpeaking ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>{isSpeaking ? 'Speaking' : 'Off'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Auto-Answer</span>
                  <span className="text-emerald-600 font-medium">{autoAnswer ? 'ON' : 'OFF'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transfer suggestion */}
          {wantsTransfer && availableContacts.length > 0 && isActive && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-amber-800 mb-1">Transfer Request Detected</p>
                  <p className="text-xs text-amber-700 mb-3">The caller may want to be transferred to someone.</p>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1.5" onClick={() => setShowTransferDialog(true)}>
                    <PhoneForwarded className="h-3.5 w-3.5" /> Transfer Now
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* How it works (shown only when idle) */}
          {isIdle && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">How Auto-Answer Works</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">1</span>
                    <span>A call comes in (simulated or real)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">2</span>
                    <span>Agent auto-answers after {autoAnswerDelay}s</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">3</span>
                    <span>AI greets the caller by name</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">4</span>
                    <span>Mic stays ON — just talk naturally</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">5</span>
                    <span>AI listens, thinks, responds with voice — continuously</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">6</span>
                    <span>Say "bye" or transfer anytime</span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneForwarded className="h-5 w-5" /> Transfer Call
            </DialogTitle>
            <DialogDescription>Select who to transfer the caller to</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-64 overflow-y-auto">
            {availableContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No contacts available. Add some in the Contacts tab.</p>
            ) : (
              availableContacts.map(c => (
                <button
                  key={c.id}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${transferContactId === c.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-muted/50'}`}
                  onClick={() => setTransferContactId(c.id)}
                >
                  <p className="font-medium">{c.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {c.role && <Badge variant="secondary" className="text-xs">{c.role}</Badge>}
                    {c.department && <Badge variant="outline" className="text-xs">{c.department}</Badge>}
                    {c.phone && <Badge variant="outline" className="text-xs">{c.phone}</Badge>}
                  </div>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={handleTransfer} disabled={!transferContactId}>
              <PhoneForwarded className="h-4 w-4" /> Transfer Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> Call Settings
            </DialogTitle>
            <DialogDescription>Configure auto-answer and call behavior</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-Answer</p>
                <p className="text-xs text-muted-foreground">Automatically answer incoming calls</p>
              </div>
              <Switch checked={autoAnswer} onCheckedChange={setAutoAnswer} disabled={!isIdle} />
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Answer Delay</p>
                  <p className="text-xs text-muted-foreground">How long before auto-answering</p>
                </div>
                <span className="text-sm font-mono font-medium">{autoAnswerDelay}s</span>
              </div>
              <Slider
                value={[autoAnswerDelay]}
                min={1}
                max={10}
                step={1}
                onValueChange={([v]) => setAutoAnswerDelay(v)}
                disabled={!isIdle}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1s (instant)</span><span>5s</span><span>10s (slow)</span>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Mic Sensitivity</p>
                  <p className="text-xs text-muted-foreground">How easily the mic picks up your voice</p>
                </div>
                <span className="text-sm font-mono font-medium">{sensitivity}%</span>
              </div>
              <Slider
                value={[sensitivity]}
                min={10}
                max={100}
                step={5}
                onValueChange={([v]) => setSensitivity(v)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}