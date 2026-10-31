import type { LucideIcon } from 'lucide-react';
import { Fragment, type ReactElement, type ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export interface MenuAction {
  label: ReactNode;
  icon: LucideIcon;
  /** Runs the action; or `href` opens a link (a phone number, an email). */
  onSelect?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Starts a new group with a line above it. */
  group?: boolean;
}

/**
 * A row's right-click menu: what clicking the row does, and the actions next to it. Actions
 * left out (`false`) are skipped, so a list can build them conditionally.
 */
export function ActionMenu({
  label,
  actions,
  children,
}: {
  label?: ReactNode;
  actions: (MenuAction | false | null | undefined | '')[];
  children: ReactElement;
}) {
  const shown = actions.filter((a): a is MenuAction => Boolean(a));
  if (shown.length === 0) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {label && <ContextMenuLabel className="truncate">{label}</ContextMenuLabel>}
        {shown.map((a, i) => {
          const Icon = a.icon;
          const item = a.href ? (
            <ContextMenuItem asChild disabled={a.disabled}>
              <a href={a.href}>
                <Icon /> {a.label}
              </a>
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              variant={a.destructive ? 'destructive' : 'default'}
              disabled={a.disabled}
              onSelect={a.onSelect}
            >
              <Icon /> {a.label}
            </ContextMenuItem>
          );
          return (
            <Fragment key={i}>
              {a.group && i > 0 && <ContextMenuSeparator />}
              {item}
            </Fragment>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
