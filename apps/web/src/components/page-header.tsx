import type { ReactNode } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';

interface PageHeaderProps {
  title: ReactNode;
  /** Secondary text next to the title, e.g. a count or date. */
  meta?: ReactNode;
  /**
   * Controls on the right of the title bar, in one order on every page: view controls (search,
   * filters, period, dates) first, then secondary actions (`outline`), and the page's primary
   * action (the ink button) last.
   */
  actions?: ReactNode;
}

/**
 * The title bar at the top of every page's main panel. Pages share one gutter (`px-4 md:px-6`):
 * the sidebar button's icon, page content and side rails all start on that line.
 */
export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b px-4 md:px-6">
      {/* Pulled into the gutter so its icon, not its hover area, lines up with the content. */}
      <SidebarTrigger className="-ml-2 text-muted-foreground" />
      {/* Titles are a word or two: they keep their width, and the meta gives way first. */}
      <h1 className="shrink-0 text-[0.9375rem] font-medium tracking-tight">{title}</h1>
      {meta && (
        <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">
          {meta}
        </span>
      )}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** The scrollable area under a page header. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className ?? 'scrollbar-thin min-h-0 flex-1 overflow-auto px-4 py-6 md:px-6'}>
      {children}
    </div>
  );
}
