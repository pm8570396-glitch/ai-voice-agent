'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceAgent, Contact, ChatMessage } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Phone, PhoneOff, PhoneForwarded, Bot, User,
  Volume2, VolumeX, Loader2, AlertCircle, CheckCircle, Send, Play, Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LiveCallProps {
  agents: VoiceAgent[];
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  contacts: Contact[];
}

// Generate unique ID
const uid = () => Math.random().toString(36).substr(2, 9);

export default function LiveCall({ agents, selectedAgentId, setSelectedAgentId, contacts }: LiveCallProps) {
  const { toast } = useToast();

  // Call state
  const [isCallActive, setIsCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState('');

  // Transfer dialog
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeAgent = agents.find(a => a.id === selectedAgentId);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Call duration timer
  useEffect(() => {
    if (isCallActive && callStartTime) {
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTime) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCallActive, callStartTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      stopAllAudio();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    setMessages(prev => [...prev, { id: uid(), role, content, timestamp: Date.now() }]);
  }, []);

  const stopAllAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const playAudioFromBuffer = async (buffer: ArrayBuffer) => {
    stopAllAudio();
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const audioContext = audioContextRef.current;
      const audioBuffer = await audioContext.decodeAudioData(buffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      setIsSpeaking(true);
      source.onended = () => {
        setIsSpeaking(false);
        currentAudioRef.current = null;
      };

      source.start(0);

      // Also create an HTML audio element for control
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'TTS failed');
      }

      const buffer = await res.arrayBuffer();
      await playAudioFromBuffer(buffer);
    } catch (err) {
      console.error('TTS error:', err);
      toast({ title: 'Voice Error', description: 'Could not generate speech', variant: 'destructive' });
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });
      const base64Audio = await base64Promise;

      // ASR
      const asrRes = await fetch('/api/voice/asr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio }),
      });

      if (!asrRes.ok) throw new Error('ASR failed');
      const asrData = await asrRes.json();

      if (!asrData.text || asrData.text.trim().length === 0) {
        setIsProcessing(false);
        return;
      }

      const userText = asrData.text.trim();
      addMessage('user', userText);

      // LLM Chat
      const chatRes = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          agentId: selectedAgentId,
          sessionId,
        }),
      });

      if (!chatRes.ok) throw new Error('Chat failed');
      const chatData = await chatRes.json();

      addMessage('assistant', chatData.response);

      // TTS
      await textToSpeech(chatData.response, activeAgent?.voice || 'tongtong', activeAgent?.speed || 1.0);

      // Check transfer intent
      if (chatData.wantsTransfer && contacts.length > 0) {
        setWantsTransfer(true);
      }
    } catch (err) {
      console.error('Processing error:', err);
      addMessage('system', 'Sorry, there was an error processing your voice. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        if (blob.size > 0 && isCallActive) {
          await processAudio(blob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      toast({
        title: 'Microphone Access Denied',
        description: 'Please allow microphone access to use the voice agent.',
        variant: 'destructive',
      });
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

  const startCall = async () => {
    if (!selectedAgentId) {
      toast({ title: 'No Agent Selected', description: 'Please select a voice agent first', variant: 'destructive' });
      return;
    }

    const newSessionId = uid();
    setSessionId(newSessionId);
    setMessages([]);
    setCallStartTime(Date.now());
    setCallDuration(0);
    setWantsTransfer(false);
    setIsCallActive(true);

    addMessage('system', 'Call started');

    // Play greeting
    if (activeAgent?.greeting) {
      addMessage('assistant', activeAgent.greeting);
      await textToSpeech(activeAgent.greeting, activeAgent.voice, activeAgent.speed);
    }

    // Auto-start listening after greeting
    if (isCallActive) {
      startRecording();
    }
  };

  const endCall = async () => {
    stopRecording();
    stopAllAudio();
    setIsCallActive(false);
    if (timerRef.current) clearInterval(timerRef.current);

    // Save call log
    try {
      await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          duration: callDuration,
          status: 'completed',
          transcript: JSON.stringify(messages),
        }),
      });
    } catch {
      // Silent fail for logging
    }

    // Clear chat history on server
    try {
      await fetch(`/api/voice/chat?sessionId=${sessionId}`, { method: 'DELETE' });
    } catch {
      // Silent fail
    }

    addMessage('system', `Call ended - Duration: ${formatTime(callDuration)}`);

    // Clear session after short delay
    setTimeout(() => {
      setMessages(prev => [...prev.slice(-1)]); // Keep only the last message
    }, 2000);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (isCallActive && !isProcessing && !isSpeaking) {
        startRecording();
      }
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

    const transferMsg = contact
      ? `Transferring you to ${contact.name}${contact.role ? `, ${contact.role}` : ''}${contact.department ? ` from ${contact.department}` : ''}. Please hold for a moment.`
      : 'Transferring your call now. Please hold.';

    addMessage('assistant', transferMsg);
    await textToSpeech(transferMsg, activeAgent?.voice || 'tongtong', activeAgent?.speed || 1.0);

    // Save as transferred call
    try {
      await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          duration: callDuration,
          status: 'transferred',
          transcript: JSON.stringify(messages),
        }),
      });
    } catch {
      // Silent fail
    }

    setShowTransferDialog(false);
    setWantsTransfer(false);
    setTransferContactId('');

    toast({
      title: 'Call Transferred',
      description: `Transferred to ${contact?.name || 'contact'}`,
    });

    // End call after transfer
    setIsCallActive(false);
    if (timerRef.current) clearInterval(timerRef.current);

    setTimeout(() => {
      setMessages(prev => [...prev.slice(-1)]);
    }, 2000);
  };

  // Auto-resume listening when AI finishes speaking
  useEffect(() => {
    if (isCallActive && !isSpeaking && !isProcessing && !isRecording && !isMuted) {
      const timer = setTimeout(() => {
        if (isCallActive && !isSpeaking && !isProcessing && !isMuted) {
          startRecording();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isSpeaking, isProcessing, isCallActive, isRecording, isMuted]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-7 w-7 text-emerald-600" />
            Live Call
          </h2>
          <p className="text-muted-foreground mt-1">Start a voice conversation with your AI call assistant</p>
        </div>
        <div className="flex items-center gap-3">
          {isCallActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200">
              <motion.div
                className="w-2.5 h-2.5 rounded-full bg-red-500"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
              <span className="text-sm font-mono font-medium">{formatTime(callDuration)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main call area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Agent selector */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium whitespace-nowrap">Active Agent:</Label>
                <Select value={selectedAgentId || ''} onValueChange={setSelectedAgentId} disabled={isCallActive}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.filter(a => a.isActive).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}{a.companyName ? ` (${a.companyName})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeAgent && (
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">{activeAgent.voice}</Badge>
                    <Badge variant="outline" className="text-xs">{activeAgent.tone}</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chat / Transcript */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Conversation
                {isCallActive && <Badge variant="destructive" className="animate-pulse text-xs">LIVE</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96 px-4 pb-4">
                <div className="space-y-3 pt-2">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="rounded-full bg-muted p-4 mb-3">
                        <Mic className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Select an agent and start a call to begin</p>
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {messages.map(msg => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`flex-shrink-0 rounded-full p-2 ${msg.role === 'assistant' ? 'bg-emerald-100' : msg.role === 'user' ? 'bg-blue-100' : 'bg-amber-100'}`}>
                          {msg.role === 'assistant' ? <Bot className="h-4 w-4 text-emerald-700" /> : msg.role === 'user' ? <User className="h-4 w-4 text-blue-700" /> : <AlertCircle className="h-4 w-4 text-amber-700" />}
                        </div>
                        <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${msg.role === 'assistant' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : msg.role === 'user' ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'bg-amber-50 text-amber-800 border border-amber-200 text-center w-full max-w-full'}`}>
                          {msg.content}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Processing indicator */}
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

                  {/* Speaking indicator */}
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
            </CardContent>
          </Card>
        </div>

        {/* Controls sidebar */}
        <div className="space-y-4">
          {/* Call controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isCallActive ? (
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 h-14 text-base"
                  onClick={startCall}
                  disabled={!selectedAgentId}
                >
                  <Phone className="h-5 w-5" /> Start Call
                </Button>
              ) : (
                <>
                  <Button
                    className={`w-full gap-2 h-14 text-base ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing || isSpeaking}
                  >
                    {isRecording ? <><Square className="h-5 w-5" /> Stop Listening</> : <><Mic className="h-5 w-5" /> Start Listening</>}
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="gap-2 h-12"
                      onClick={toggleMute}
                    >
                      {isMuted ? <MicOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Button>

                    <Button
                      variant="outline"
                      className="gap-2 h-12"
                      onClick={() => setShowTransferDialog(true)}
                      disabled={contacts.length === 0}
                    >
                      <PhoneForwarded className="h-4 w-4" />
                      Transfer
                    </Button>
                  </div>

                  <Button className="w-full bg-red-600 hover:bg-red-700 gap-2 h-12" onClick={endCall}>
                    <PhoneOff className="h-5 w-5" /> End Call
                  </Button>
                </>
              )}

              {/* Status indicators */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="text-muted-foreground">Microphone: {isRecording ? 'Active' : 'Off'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="text-muted-foreground">Processing: {isProcessing ? 'Active' : 'Idle'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="text-muted-foreground">Speaking: {isSpeaking ? 'Active' : 'Off'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transfer suggestion */}
          {wantsTransfer && contacts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-amber-800 mb-2">Transfer Request Detected</p>
                  <p className="text-xs text-amber-700 mb-3">The caller may want to be transferred. Would you like to transfer?</p>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1.5" onClick={() => setShowTransferDialog(true)}>
                    <PhoneForwarded className="h-3.5 w-3.5" /> Transfer Call
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Quick info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">1</span>
                  <span>Select a voice agent and start the call</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">2</span>
                  <span>Agent plays greeting message automatically</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">3</span>
                  <span>Speak into your mic - it auto-records</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">4</span>
                  <span>AI transcribes, thinks, and responds with voice</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">5</span>
                  <span>Transfer to a contact when needed</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneForwarded className="h-5 w-5" /> Transfer Call
            </DialogTitle>
            <DialogDescription>Select a contact to transfer the current call to</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {contacts.filter(c => c.isActive).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No active contacts available. Add contacts in the Contacts tab.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {contacts.filter(c => c.isActive).map(contact => (
                  <button
                    key={contact.id}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${transferContactId === contact.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-muted/50'}`}
                    onClick={() => setTransferContactId(contact.id)}
                  >
                    <p className="font-medium">{contact.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {contact.role && <Badge variant="secondary" className="text-xs">{contact.role}</Badge>}
                      {contact.department && <Badge variant="outline" className="text-xs">{contact.department}</Badge>}
                      {contact.phone && <Badge variant="outline" className="text-xs">{contact.phone}</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              onClick={handleTransfer}
              disabled={!transferContactId}
            >
              <PhoneForwarded className="h-4 w-4" /> Transfer Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Need to import Label
import { Label } from '@/components/ui/label';