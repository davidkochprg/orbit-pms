import type { Inquiry, InquiryChannel } from '@orbit/shared';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateMessage, useReceiveMessage } from '@/lib/api';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Shell({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  error,
  submit,
  disabled,
  children,
}: DialogProps & {
  title: string;
  description: string;
  onSubmit: (e: FormEvent) => void;
  error: string | undefined;
  submit: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shadow-floating sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          {error && <ErrorNotice message={error} />}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const sources: { value: string; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'Booking.com', label: 'Booking.com' },
  { value: 'Airbnb', label: 'Airbnb' },
  { value: 'web', label: 'Web form' },
];

function channelFor(source: string): { channel: InquiryChannel; partner: string | null } {
  if (source === 'email' || source === 'web') return { channel: source, partner: null };
  return { channel: 'ota', partner: source };
}

/**
 * A guest's message that starts a conversation: pasted from a mail client, or as an OTA would
 * relay it. Orbit doesn't fetch mail itself.
 */
export function IncomingDialog({ open, onOpenChange }: DialogProps) {
  const create = useCreateMessage();
  const navigate = useNavigate();
  const [source, setSource] = useState('email');
  const [senderName, setSenderName] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        ...channelFor(source),
        body,
        senderName: senderName.trim() || null,
        senderAddress: senderAddress.trim() || null,
        subject: subject.trim() || null,
      },
      {
        onSuccess: (m: Inquiry) => {
          setSenderName('');
          setSenderAddress('');
          setSubject('');
          setBody('');
          onOpenChange(false);
          void navigate(`/inbox/${m.id}`);
        },
      },
    );
  }

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title="Add a guest message"
      description="Paste a guest's email, or a message as an OTA would pass it on."
      onSubmit={onSubmit}
      error={create.error?.message}
      submit="Add to inbox"
      disabled={!body.trim() || create.isPending}
    >
      <Segmented label="Channel" value={source} options={sources} onChange={setSource} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="From" htmlFor="incoming-name">
          <Input
            id="incoming-name"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
        </FormField>
        <FormField label="Email (optional)" htmlFor="incoming-address">
          <Input
            id="incoming-address"
            type="email"
            value={senderAddress}
            onChange={(e) => setSenderAddress(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Subject" htmlFor="incoming-subject">
        <Input id="incoming-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </FormField>
      <FormField label="Message" htmlFor="incoming-body">
        <Textarea
          id="incoming-body"
          rows={8}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste the message here"
        />
      </FormField>
    </Shell>
  );
}

/** The guest wrote again in this conversation, e.g. pasted from the mail client. */
export function ReceiveDialog({ id, open, onOpenChange }: DialogProps & { id: string }) {
  const receive = useReceiveMessage(id);
  const [body, setBody] = useState('');
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title="Add the guest's reply"
      description="Their next message joins this conversation and marks it unread."
      onSubmit={(e) => {
        e.preventDefault();
        receive.mutate(body, {
          onSuccess: () => {
            setBody('');
            onOpenChange(false);
          },
        });
      }}
      error={receive.error?.message}
      submit="Add to conversation"
      disabled={!body.trim() || receive.isPending}
    >
      <Textarea
        aria-label="The guest's message"
        rows={8}
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
    </Shell>
  );
}
