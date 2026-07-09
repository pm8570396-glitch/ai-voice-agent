'use client';

import { CallLog } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { History, Phone, Clock, CheckCircle, PhoneForwarded, XCircle, MessageSquare, Bot, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CallLogsProps {
  callLogs: CallLog[];
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  transferred: { label: 'Transferred', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: PhoneForwarded },
  ended: { label: 'Ended', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: XCircle },
};

export default function CallLogs({ callLogs }: CallLogsProps) {
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-7 w-7 text-emerald-600" />
          Call Logs
        </h2>
        <p className="text-muted-foreground mt-1">View history of all voice agent sessions</p>
      </div>

      {callLogs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-emerald-50 p-4 mb-4">
              <History className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">No Call History</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">Start a voice call session to see your call history here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {callLogs.map(log => {
            const config = statusConfig[log.status] || statusConfig.completed;
            const StatusIcon = config.icon;

            let transcript: Array<{ role: string; content: string }> = [];
            try {
              transcript = log.transcript ? JSON.parse(log.transcript) : [];
            } catch {
              // Invalid JSON
            }

            return (
              <Card key={log.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${config.color.split(' ')[0]}`}>
                        <StatusIcon className={`h-4 w-4 ${config.color.split(' ')[1]}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {log.agent?.name || 'Unknown Agent'}
                          </span>
                          <Badge variant="outline" className={`text-xs ${config.color}`}>
                            {config.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {formatDuration(log.duration)}
                          </span>
                          <span>{transcript.length} messages</span>
                        </div>
                      </div>
                    </div>

                    {transcript.length > 0 && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5" /> View Transcript
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>Call Transcript</DialogTitle>
                            <DialogDescription>
                              {log.agent?.name || 'Agent'} - {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                            </DialogDescription>
                          </DialogHeader>
                          <ScrollArea className="max-h-96 pr-4">
                            <div className="space-y-3 py-2">
                              {transcript.map((msg, idx) => (
                                <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                  <div className={`flex-shrink-0 rounded-full p-1.5 ${msg.role === 'assistant' ? 'bg-emerald-100' : msg.role === 'user' ? 'bg-blue-100' : 'bg-amber-100'}`}>
                                    {msg.role === 'assistant' ? <Bot className="h-3 w-3 text-emerald-700" /> : msg.role === 'user' ? <User className="h-3 w-3 text-blue-700" /> : <MessageSquare className="h-3 w-3 text-amber-700" />}
                                  </div>
                                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.role === 'assistant' ? 'bg-emerald-50 text-emerald-900' : msg.role === 'user' ? 'bg-blue-50 text-blue-900' : 'bg-amber-50 text-amber-800 text-center'}`}>
                                    {msg.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}