import type { Inquiry } from '@orbit/shared';
import { Mail } from 'lucide-react';
import { Link } from 'react-router';
import { formatDateTime } from '@/lib/format';
import { preview } from '@/lib/inbox';
import { cn } from '@/lib/utils';

/** Conversations from the inbox, each opening in it: a guest's, a booking's, a repair's. */
export function ConversationList({
  conversations,
  onOpen,
  className,
}: {
  conversations: Inquiry[];
  /** Runs as one is opened, e.g. to close the dialog it is listed in. */
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <ul className={cn('-mx-2 flex flex-col', className)}>
      {conversations.map((m) => (
        <li key={m.id}>
          <Link
            to={`/inbox/${encodeURIComponent(m.id)}`}
            onClick={onOpen}
            className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent"
          >
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('truncate', m.unread ? 'font-semibold' : 'font-medium')}>
                {m.subject ?? '(no subject)'}
              </span>
              <span className="truncate text-xs text-muted-foreground">{preview(m)}</span>
            </span>
            <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatDateTime(m.lastMessageAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
