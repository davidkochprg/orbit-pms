import type { InvoiceView } from '@orbit/shared';
import { invoiceKindLabels } from '@orbit/shared';
import { MoreHorizontal } from 'lucide-react';
import { ActionMenu, type MenuAction } from '@/components/action-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tip } from '@/components/ui/tooltip';
import { useInvoiceDialogs } from '@/hooks/use-invoice-dialogs';
import { formatDate, formatMoney } from '@/lib/format';
import { invoiceActions, invoiceState, toneText } from '@/lib/invoices';
import { cn } from '@/lib/utils';

/** The "…" button with a document's actions. */
export function InvoiceMenuButton({ actions }: { actions: MenuAction[] }) {
  return (
    <DropdownMenu>
      <Tip label="More actions">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map((a, i) => {
          const Icon = a.icon;
          return a.href ? (
            <DropdownMenuItem key={i} asChild>
              <a href={a.href}>
                <Icon /> {a.label}
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={i}
              variant={a.destructive ? 'destructive' : 'default'}
              onSelect={a.onSelect}
            >
              <Icon /> {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A booking's documents: number, kind, date, total and where each stands; a click opens one. */
export function BookingInvoiceRows({ invoices }: { invoices: InvoiceView[] }) {
  const { on, dialogs } = useInvoiceDialogs();
  return (
    <>
      <ul className="flex flex-col">
        {invoices.map((i) => {
          const state = invoiceState(i);
          const actions = invoiceActions(i, on);
          return (
            <ActionMenu key={i.id} label={i.number} actions={actions}>
              <li className="-mx-1.5 flex items-center gap-3 rounded-md px-1.5 py-1 hover:bg-accent">
                <button
                  type="button"
                  onClick={() => on.view(i.id)}
                  className="flex min-w-0 flex-1 items-baseline gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'font-mono text-[0.8125rem]',
                      i.status === 'void' && 'text-muted-foreground line-through',
                    )}
                  >
                    {i.number}
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {invoiceKindLabels[i.kind]} · {i.buyer.company ?? i.buyer.name} ·{' '}
                    {formatDate(i.issuedOn)}
                  </span>
                </button>
                {i.outdated && (
                  <Tip label="The bill changed since it was issued">
                    <span className="shrink-0 text-xs text-warning">Outdated</span>
                  </Tip>
                )}
                <span className={cn('shrink-0 text-xs', toneText[state.tone])}>{state.label}</span>
                <span className="w-20 shrink-0 text-right font-mono tabular-nums">
                  {formatMoney(i.total)}
                </span>
                <InvoiceMenuButton actions={actions} />
              </li>
            </ActionMenu>
          );
        })}
      </ul>
      {dialogs}
    </>
  );
}
