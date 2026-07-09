'use client';

import { useState, useEffect, useCallback } from 'react';
import { VoiceAgent, Contact, CallLog } from '@/components/voice-agent/types';
import AgentBuilder from '@/components/voice-agent/AgentBuilder';
import LiveCall from '@/components/voice-agent/LiveCall';
import ContactsManager from '@/components/voice-agent/ContactsManager';
import CallLogs from '@/components/voice-agent/CallLogs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Phone, Users, History, Headphones, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VoiceAgentApp() {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('agents');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, contactsRes, callsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/contacts'),
        fetch('/api/calls'),
      ]);
      const [agentsData, contactsData, callsData] = await Promise.all([
        agentsRes.json(),
        contactsRes.json(),
        callsRes.json(),
      ]);
      setAgents(agentsData);
      setContacts(contactsData);
      setCallLogs(callsData);

      // Auto-select first active agent
      if (!selectedAgentId) {
        const firstActive = agentsData.find((a: VoiceAgent) => a.isActive);
        if (firstActive) setSelectedAgentId(firstActive.id);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId]);

  useEffect(() => {
    fetchData();
    // Poll for call logs every 5s
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/calls');
        const data = await res.json();
        setCallLogs(data);
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const refreshCallLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/calls');
      const data = await res.json();
      setCallLogs(data);
    } catch { /* silent */ }
  }, []);

  const activeAgentsCount = agents.filter(a => a.isActive).length;
  const totalCalls = callLogs.length;
  const totalDuration = callLogs.reduce((sum, c) => sum + c.duration, 0);
  const transferredCount = callLogs.filter(c => c.status === 'transferred').length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center">
              <Headphones className="h-8 w-8 text-white" />
            </div>
            <motion.div
              className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading Voice Agent...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/50">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
                <Headphones className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-700 to-teal-700 bg-clip-text text-transparent">
                  VoiceAgent
                </h1>
                <p className="text-[10px] text-muted-foreground -mt-0.5 hidden sm:block">AI-Powered Call Assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Bot className="h-3 w-3" /> {activeAgentsCount} agents
                </Badge>
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Phone className="h-3 w-3" /> {totalCalls} calls
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Live</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="border-b bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Active Agents', value: activeAgentsCount, icon: Bot, color: 'text-emerald-600' },
              { label: 'Total Calls', value: totalCalls, icon: Phone, color: 'text-blue-600' },
              { label: 'Total Duration', value: `${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s`, icon: History, color: 'text-amber-600' },
              { label: 'Transferred', value: transferredCount, icon: Users, color: 'text-purple-600' },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-2.5">
                <div className="rounded-lg bg-muted/50 p-1.5">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-sm font-semibold">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-muted/50 p-1 h-auto">
            {[
              { value: 'agents', label: 'Agents', icon: Bot, count: agents.length },
              { value: 'live', label: 'Live Call', icon: Phone, count: null },
              { value: 'contacts', label: 'Contacts', icon: Users, count: contacts.length },
              { value: 'logs', label: 'Call Logs', icon: History, count: callLogs.length },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-1.5 py-2.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 transition-all"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count !== null && (
                  <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1 justify-center">
                    {tab.count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="agents">
            <AgentBuilder
              agents={agents}
              setAgents={setAgents}
              onSelectAgent={(agent) => {
                setSelectedAgentId(agent.id);
                setActiveTab('live');
              }}
              selectedAgentId={selectedAgentId}
            />
          </TabsContent>

          <TabsContent value="live">
            <LiveCall
              agents={agents}
              selectedAgentId={selectedAgentId}
              setSelectedAgentId={setSelectedAgentId}
              contacts={contacts}
            />
          </TabsContent>

          <TabsContent value="contacts">
            <ContactsManager contacts={contacts} setContacts={setContacts} />
          </TabsContent>

          <TabsContent value="logs">
            <CallLogs callLogs={callLogs} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/80 backdrop-blur-sm mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Headphones className="h-3.5 w-3.5" />
              VoiceAgent — AI-Powered Call Assistant
            </p>
            <p>Built with ASR + LLM + TTS pipeline for real-time voice conversations</p>
          </div>
        </div>
      </footer>
    </div>
  );
}