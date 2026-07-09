'use client';

import { useState } from 'react';
import { Contact } from './types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Pencil, Trash2, Phone, Mail, Building2, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ContactsManagerProps {
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
}

export default function ContactsManager({ contacts, setContacts }: ContactsManagerProps) {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const [form, setForm] = useState({
    name: '',
    role: '',
    phone: '',
    email: '',
    department: '',
  });

  const resetForm = () => setForm({ name: '', role: '', phone: '', email: '', department: '' });

  const openEdit = (contact: Contact) => {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      role: contact.role || '',
      phone: contact.phone || '',
      email: contact.email || '',
      department: contact.department || '',
    });
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed');
      const newContact = await res.json();
      setContacts([newContact, ...contacts]);
      setIsCreateOpen(false);
      resetForm();
      toast({ title: 'Contact Added', description: `"${newContact.name}" is now available for call transfers.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to create contact', variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingContact) return;
    try {
      const res = await fetch(`/api/contacts/${editingContact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, isActive: editingContact.isActive }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setContacts(contacts.map(c => c.id === updated.id ? updated : c));
      setEditingContact(null);
      resetForm();
      toast({ title: 'Contact Updated', description: `"${updated.name}" has been updated.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to update contact', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      setContacts(contacts.filter(c => c.id !== id));
      toast({ title: 'Contact Deleted', description: `"${name}" has been removed.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete contact', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...contact, isActive: !contact.isActive }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setContacts(contacts.map(c => c.id === updated.id ? updated : c));
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle contact', variant: 'destructive' });
    }
  };

  const ContactForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input placeholder="John Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Role / Title</Label>
          <Input placeholder="Sales Manager" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Department</Label>
          <Input placeholder="Sales" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input placeholder="+1 234 567 8900" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input placeholder="john@company.com" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => { setIsCreateOpen(false); setEditingContact(null); resetForm(); }}>Cancel</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onSubmit}>{submitLabel}</Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-emerald-600" />
            Contacts
          </h2>
          <p className="text-muted-foreground mt-1">Manage team members for call transfers</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Plus className="h-4 w-4" /> Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Contact</DialogTitle>
              <DialogDescription>Add a team member who can receive transferred calls</DialogDescription>
            </DialogHeader>
            <ContactForm onSubmit={handleCreate} submitLabel="Add Contact" />
          </DialogContent>
        </Dialog>
      </div>

      {contacts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-emerald-50 p-4 mb-4">
              <Users className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">No Contacts Yet</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">Add team members who can receive transferred calls from the voice agent.</p>
            <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add First Contact
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {contacts.map(contact => (
              <motion.div
                key={contact.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className={`transition-all hover:shadow-lg ${!contact.isActive ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-full p-2.5 ${contact.isActive ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                          <Users className={`h-5 w-5 ${contact.isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{contact.name}</CardTitle>
                          {contact.role && <CardDescription>{contact.role}</CardDescription>}
                        </div>
                      </div>
                      <Switch checked={contact.isActive} onCheckedChange={() => handleToggleActive(contact)} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {contact.department && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Building2 className="h-3 w-3" /> {contact.department}
                        </Badge>
                      )}
                      {contact.role && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Briefcase className="h-3 w-3" /> {contact.role}
                        </Badge>
                      )}
                    </div>

                    {(contact.phone || contact.email) && (
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        {contact.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5" />
                            {contact.phone}
                          </div>
                        )}
                        {contact.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="truncate">{contact.email}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Dialog open={editingContact?.id === contact.id} onOpenChange={(open) => { if (!open) { setEditingContact(null); resetForm(); } }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(contact)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Contact</DialogTitle>
                            <DialogDescription>Update contact information</DialogDescription>
                          </DialogHeader>
                          <ContactForm onSubmit={handleUpdate} submitLabel="Save Changes" />
                        </DialogContent>
                      </Dialog>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(contact.id, contact.name)}>
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