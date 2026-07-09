'use client';

import { useState, useEffect } from 'react';
import { VoiceAgent, AgentScript } from './types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Bot, Plus, Pencil, Trash2, GripVertical, Mic, FileText, Phone, ChevronUp, ChevronDown, X, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const VOICES = [
  { value: 'tongtong', label: 'Tongtong', desc: 'Warm & friendly' },
  { value: 'xiaochen', label: 'Xiaochen', desc: 'Professional & steady' },
  { value: 'chuichui', label: 'Chuichui', desc: 'Lively & cute' },
  { value: 'jam', label: 'Jam', desc: 'British gentleman' },
  { value: 'kazi', label: 'Kazi', desc: 'Clear & standard' },
  { value: 'douji', label: 'Douji', desc: 'Natural & fluent' },
  { value: 'luodo', label: 'Luodo', desc: 'Engaging & expressive' },
];

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'formal', label: 'Formal' },
];

interface AgentBuilderProps {
  agents: VoiceAgent[];
  setAgents: (agents: VoiceAgent[]) => void;
  onSelectAgent: (agent: VoiceAgent) => void;
  selectedAgentId: string | null;
}

export default function AgentBuilder({ agents, setAgents, onSelectAgent, selectedAgentId }: AgentBuilderProps) {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<VoiceAgent | null>(null);
  const [showScripts, setShowScripts] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    companyName: '',
    companyDesc: '',
    greeting: "Hello! Thank you for calling. How can I help you today?",
    voice: 'tongtong',
    speed: 1.0,
    tone: 'professional',
  });

  // Script form
  const [scriptForm, setScriptForm] = useState({ title: '', content: '' });
  const [isScriptDialogOpen, setIsScriptDialogOpen] = useState(false);

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      companyName: '',
      companyDesc: '',
      greeting: "Hello! Thank you for calling. How can I help you today?",
      voice: 'tongtong',
      speed: 1.0,
      tone: 'professional',
    });
  };

  const handleCreateAgent = async () => {
    if (!form.name.trim() || !form.greeting.trim()) {
      toast({ title: 'Error', description: 'Agent name and greeting are required', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to create agent');
      const newAgent = await res.json();
      setAgents([newAgent, ...agents]);
      setIsCreateOpen(false);
      resetForm();
      toast({ title: 'Agent Created', description: `"${newAgent.name}" is ready to use.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to create agent', variant: 'destructive' });
    }
  };

  const handleUpdateAgent = async () => {
    if (!editingAgent) return;
    try {
      const res = await fetch(`/api/agents/${editingAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to update agent');
      const updated = await res.json();
      setAgents(agents.map(a => a.id === updated.id ? { ...updated, scripts: a.scripts } : a));
      setEditingAgent(null);
      resetForm();
      toast({ title: 'Agent Updated', description: `"${updated.name}" has been updated.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to update agent', variant: 'destructive' });
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    try {
      await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      setAgents(agents.filter(a => a.id !== id));
      toast({ title: 'Agent Deleted', description: `"${name}" has been removed.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete agent', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (agent: VoiceAgent) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...agent, isActive: !agent.isActive }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setAgents(agents.map(a => a.id === updated.id ? { ...updated, scripts: a.scripts } : a));
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle agent', variant: 'destructive' });
    }
  };

  const openEdit = (agent: VoiceAgent) => {
    setEditingAgent(agent);
    setForm({
      name: agent.name,
      description: agent.description || '',
      companyName: agent.companyName || '',
      companyDesc: agent.companyDesc || '',
      greeting: agent.greeting,
      voice: agent.voice,
      speed: agent.speed,
      tone: agent.tone,
    });
  };

  // Script management
  const handleAddScript = async (agentId: string) => {
    if (!scriptForm.title.trim() || !scriptForm.content.trim()) {
      toast({ title: 'Error', description: 'Script title and content are required', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(`/api/agents/${agentId}/scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scriptForm),
      });
      if (!res.ok) throw new Error('Failed');
      const newScript = await res.json();
      setAgents(agents.map(a => {
        if (a.id === agentId) return { ...a, scripts: [...a.scripts, newScript] };
        return a;
      }));
      setScriptForm({ title: '', content: '' });
      setIsScriptDialogOpen(false);
      toast({ title: 'Script Added', description: `"${newScript.title}" added to agent.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to add script', variant: 'destructive' });
    }
  };

  const handleDeleteScript = async (agentId: string, scriptId: string, title: string) => {
    try {
      await fetch(`/api/agents/${agentId}/scripts?scriptId=${scriptId}`, { method: 'DELETE' });
      setAgents(agents.map(a => {
        if (a.id === agentId) return { ...a, scripts: a.scripts.filter(s => s.id !== scriptId) };
        return a;
      }));
      toast({ title: 'Script Removed', description: `"${title}" has been removed.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete script', variant: 'destructive' });
    }
  };

  const handleMoveScript = async (agentId: string, scripts: AgentScript[], movedIndex: number, direction: 'up' | 'down') => {
    const newScripts = [...scripts];
    const targetIndex = direction === 'up' ? movedIndex - 1 : movedIndex + 1;
    if (targetIndex < 0 || targetIndex >= newScripts.length) return;

    [newScripts[movedIndex], newScripts[targetIndex]] = [newScripts[targetIndex], newScripts[movedIndex]];
    const updatedScripts = newScripts.map((s, i) => ({ ...s, order: i + 1 }));

    try {
      await fetch(`/api/agents/${agentId}/scripts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scripts: updatedScripts }),
      });
      setAgents(agents.map(a => a.id === agentId ? { ...a, scripts: updatedScripts } : a));
    } catch {
      toast({ title: 'Error', description: 'Failed to reorder scripts', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-7 w-7 text-emerald-600" />
            Voice Agents
          </h2>
          <p className="text-muted-foreground mt-1">Create and customize AI-powered call assistants with custom scripts</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Plus className="h-4 w-4" /> New Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Agent</DialogTitle>
              <DialogDescription>Set up a new voice agent with company info and greeting</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Agent Name *</Label>
                <Input placeholder="e.g., Sales Receptionist" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="What is this agent for?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input placeholder="Acme Corp" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input placeholder="Sales, Support" value={form.companyDesc} onChange={e => setForm(f => ({ ...f, companyDesc: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Greeting Message *</Label>
                <Textarea
                  placeholder="Hello! Thank you for calling [Company]. How can I assist you today?"
                  value={form.greeting}
                  onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))}
                  rows={3}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={form.voice} onValueChange={v => setForm(f => ({ ...f, voice: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VOICES.map(v => (
                      <SelectItem key={v.value} value={v.value}>
                        <span className="font-medium">{v.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">- {v.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Speed: {form.speed.toFixed(1)}x</Label>
                <Slider value={[form.speed]} min={0.5} max={2.0} step={0.1} onValueChange={([v]) => setForm(f => ({ ...f, speed: v }))} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Slow (0.5x)</span><span>Normal (1.0x)</span><span>Fast (2.0x)</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tone</Label>
                <Select value={form.tone} onValueChange={v => setForm(f => ({ ...f, tone: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreateAgent}>Create Agent</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Agent Cards */}
      {agents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-emerald-50 p-4 mb-4">
              <Bot className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">No Voice Agents Yet</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">Create your first AI call assistant to get started. You can customize scripts, voice, and behavior.</p>
            <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create First Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {agents.map(agent => (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card
                  className={`relative transition-all hover:shadow-lg cursor-pointer border-2 ${selectedAgentId === agent.id ? 'border-emerald-500 shadow-emerald-100 shadow-lg' : 'border-transparent'}`}
                  onClick={() => onSelectAgent(agent)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-xl p-2.5 ${agent.isActive ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                          <Bot className={`h-6 w-6 ${agent.isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{agent.name}</CardTitle>
                          {agent.companyName && (
                            <CardDescription className="flex items-center gap-1 mt-0.5">
                              <FileText className="h-3 w-3" /> {agent.companyName}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Switch checked={agent.isActive} onCheckedChange={() => handleToggleActive(agent)} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agent.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Mic className="h-3 w-3" /> {VOICES.find(v => v.value === agent.voice)?.label || agent.voice}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{agent.tone}</Badge>
                      <Badge variant="outline" className="text-xs">{agent.speed}x</Badge>
                      <Badge variant="secondary" className="text-xs gap-1">
                        <FileText className="h-3 w-3" /> {agent.scripts.length} scripts
                      </Badge>
                      {(agent._count?.callLogs ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Phone className="h-3 w-3" /> {agent._count?.callLogs} calls
                        </Badge>
                      )}
                    </div>

                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Greeting</p>
                      <p className="text-sm line-clamp-2">&quot;{agent.greeting}&quot;</p>
                    </div>

                    {/* Scripts toggle */}
                    {agent.scripts.length > 0 && (
                      <div className="border-t pt-3" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-between text-sm"
                          onClick={() => setShowScripts(showScripts === agent.id ? null : agent.id)}
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Scripts ({agent.scripts.length})
                          </span>
                          {showScripts === agent.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <AnimatePresence>
                          {showScripts === agent.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <ScrollArea className="max-h-48 mt-2">
                                <div className="space-y-2">
                                  {agent.scripts.map((script, idx) => (
                                    <div key={script.id} className="flex items-start gap-2 rounded-md bg-background p-2 border text-xs">
                                      <span className="font-mono text-muted-foreground mt-0.5">{idx + 1}.</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium">{script.title}</p>
                                        <p className="text-muted-foreground line-clamp-2 mt-0.5">{script.content}</p>
                                      </div>
                                      <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveScript(agent.id, agent.scripts, idx, 'up')} disabled={idx === 0}>
                                          <ChevronUp className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveScript(agent.id, agent.scripts, idx, 'down')} disabled={idx === agent.scripts.length - 1}>
                                          <ChevronDown className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteScript(agent.id, script.id, script.title)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1" onClick={e => e.stopPropagation()}>
                      <Dialog open={editingAgent?.id === agent.id} onOpenChange={(open) => { if (!open) { setEditingAgent(null); resetForm(); } }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(agent)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Agent</DialogTitle>
                            <DialogDescription>Update agent configuration</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            <div className="space-y-2"><Label>Agent Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2"><Label>Company Name</Label><Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} /></div>
                              <div className="space-y-2"><Label>Department</Label><Input value={form.companyDesc} onChange={e => setForm(f => ({ ...f, companyDesc: e.target.value }))} /></div>
                            </div>
                            <div className="space-y-2"><Label>Greeting *</Label><Textarea value={form.greeting} onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))} rows={3} /></div>
                            <div className="space-y-2">
                              <Label>Voice</Label>
                              <Select value={form.voice} onValueChange={v => setForm(f => ({ ...f, voice: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{VOICES.map(v => (<SelectItem key={v.value} value={v.value}>{v.label} - {v.desc}</SelectItem>))}</SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Speed: {form.speed.toFixed(1)}x</Label>
                              <Slider value={[form.speed]} min={0.5} max={2.0} step={0.1} onValueChange={([v]) => setForm(f => ({ ...f, speed: v }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Tone</Label>
                              <Select value={form.tone} onValueChange={v => setForm(f => ({ ...f, tone: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{TONES.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}</SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => { setEditingAgent(null); resetForm(); }}>Cancel</Button>
                            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleUpdateAgent}>Save Changes</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={isScriptDialogOpen && showScripts === agent.id} onOpenChange={(open) => { setIsScriptDialogOpen(open); if (!open) setScriptForm({ title: '', content: '' }); }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setShowScripts(agent.id); setIsScriptDialogOpen(true); }}>
                            <Plus className="h-3.5 w-3.5" /> Script
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Script</DialogTitle>
                            <DialogDescription>Add a conversation script/talking point for this agent</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            <div className="space-y-2"><Label>Script Title *</Label><Input placeholder="e.g., Company Introduction" value={scriptForm.title} onChange={e => setScriptForm(f => ({ ...f, title: e.target.value }))} /></div>
                            <div className="space-y-2"><Label>What to Say *</Label><Textarea placeholder="The agent should mention these key points when relevant..." value={scriptForm.content} onChange={e => setScriptForm(f => ({ ...f, content: e.target.value }))} rows={4} /></div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => { setIsScriptDialogOpen(false); setScriptForm({ title: '', content: '' }); }}>Cancel</Button>
                            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAddScript(agent.id)}>Add Script</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteAgent(agent.id, agent.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}