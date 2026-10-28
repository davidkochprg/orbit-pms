import type { ReactNode } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';

interface PageHeaderProps {
  title: ReactNode;
  /** Secondary text next to the title, e.g. a count or date. */
  meta?: ReactNode;
  /** Controls on the right of the title bar. */
  actions?: ReactNode;
}

/** The title bar at the top of every page's main panel. */
export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger className="text-muted-foreground" />
      <h1 className="truncate text-[0.9375rem] font-medium tracking-tight">{title}</h1>
      {meta && (
        <span className="hidden truncate text-sm text-muted-foreground sm:inline">{meta}</span>
      )}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** The scrollable area under a page header. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className ?? 'scrollbar-thin min-h-0 flex-1 overflow-auto px-6 py-6 lg:px-8'}>
      {children}
    </div>
  );
}
