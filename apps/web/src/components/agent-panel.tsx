import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { PendingActionCard } from '@/components/pending-action-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { agentErrorMessage, asProposal, asToolError } from '@/lib/agent';
import { useHealth } from '@/lib/api';

const transport = new DefaultChatTransport({ api: '/api/agent' });

export function AgentPanel({ open }: { open: boolean }) {
  const health = useHealth();
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState('');
  const configured = health.data?.ai.configured ?? false;
  const busy = status === 'submitted' || status === 'streaming';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput('');
  }

  return (
    <aside
      className={open ? 'hidden w-96 shrink-0 flex-col border-l bg-sidebar md:flex' : 'hidden'}
    >
      <div className="flex h-14 items-center gap-2 border-b px-4 text-sm font-medium">
        <Sparkles className="size-4 text-primary" /> Agent
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
        {!configured && (
          <p className="text-muted-foreground">
            The agent is not configured on this server. Set the Meta API variables to use it.
          </p>
        )}
        {configured && messages.length === 0 && (
          <p className="text-muted-foreground">
            Ask anything, e.g. “who arrives today with kids?” or “move Novák to room 201”.
          </p>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {busy && <p className="text-muted-foreground">Thinking…</p>}
        {error && <p className="text-destructive">{agentErrorMessage(error)}</p>}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Orbit…"
          disabled={!configured}
        />
        <Button type="submit" disabled={!configured || busy || !input.trim()}>
          Send
        </Button>
      </form>
    </aside>
  );
}

function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      className={
        isUser
          ? 'self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground'
          : 'flex flex-col gap-2'
      }
    >
      {message.parts.map((part, i) => {
        if (part.type === 'text')
          return (
            <p key={i} className="whitespace-pre-wrap">
              {part.text}
            </p>
          );
        if (!isToolUIPart(part)) return null;
        const name = getToolName(part);
        const output = part.state === 'output-available' ? part.output : undefined;
        const proposal = asProposal(output);
        const toolError = asToolError(output);
        return (
          <div key={part.toolCallId} className="flex flex-col gap-2">
            {/* Show which tools were called so the answer is visibly grounded. */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {name}
                {part.state !== 'output-available' && part.state !== 'output-error' && ' …'}
                {toolError && ' (error)'}
              </summary>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2">
                {JSON.stringify({ input: part.input, output: output ?? part.errorText }, null, 2)}
              </pre>
            </details>
            {proposal && (
              <PendingActionCard id={proposal.pendingActionId} summary={proposal.summary} />
            )}
          </div>
        );
      })}
    </div>
  );
}
