import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import { Check, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react';
import { PendingActionCard } from '@/components/pending-action-card';
import { asProposal, asToolError, toolLabel } from '@/lib/agent';

type ToolPart = Extract<UIMessage['parts'][number], { toolCallId: string }>;

/** One exchange after another: the question as a heading, then the agent's steps and answer. */
export function AgentThread({ messages }: { messages: UIMessage[] }) {
  return (
    <div className="flex flex-col gap-5">
      {messages.map((m) =>
        m.role === 'user' ? (
          <p key={m.id} className="text-base font-medium tracking-tight">
            {m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')}
          </p>
        ) : (
          <AssistantMessage key={m.id} message={m} />
        ),
      )}
    </div>
  );
}

function AssistantMessage({ message }: { message: UIMessage }) {
  return (
    <div className="-mt-3 flex flex-col gap-2">
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <p key={i} className="leading-relaxed whitespace-pre-wrap">
              {part.text}
            </p>
          );
        }
        if (!isToolUIPart(part)) return null;
        return <ToolStep key={part.toolCallId} part={part} />;
      })}
    </div>
  );
}

function ToolStep({ part }: { part: ToolPart }) {
  const name = getToolName(part);
  const output = part.state === 'output-available' ? part.output : undefined;
  const done = part.state === 'output-available' || part.state === 'output-error';
  const proposal = asProposal(output);
  const failed = part.state === 'output-error' || asToolError(output) !== null;
  const Icon = !done ? LoaderCircle : failed ? CircleAlert : Check;

  return (
    <>
      {/* Every step is listed so the answer is visibly grounded in hotel data. */}
      <details className="group text-xs text-muted-foreground">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded py-0.5 select-none hover:text-foreground">
          <Icon
            className={
              !done ? 'size-3.5 animate-spin' : failed ? 'size-3.5 text-destructive' : 'size-3.5'
            }
          />
          {toolLabel(name, done)}
          <ChevronRight className="size-3 opacity-0 transition-transform group-open:rotate-90 group-hover:opacity-100" />
        </summary>
        <pre className="scrollbar-thin mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
          {JSON.stringify({ input: part.input, output: output ?? part.errorText }, null, 2)}
        </pre>
      </details>
      {proposal && <PendingActionCard id={proposal.pendingActionId} summary={proposal.summary} />}
    </>
  );
}
