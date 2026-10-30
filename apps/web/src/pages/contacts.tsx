import { type Contact, type Trade, tradeLabels, tradeSchema } from '@orbit/shared';
import { Contact as ContactIcon, Mail, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ContactEditorDialog } from '@/components/contact-editor';
import { EmptyState } from '@/components/empty-state';
import { ErrorNotice } from '@/components/error-notice';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useContacts } from '@/lib/api';
import { contactMatches } from '@/lib/contacts';
import { telHref } from '@/lib/repairs';
import { cn, labelCaps } from '@/lib/utils';

/** Suppliers and contractors: who to call when something breaks or runs out. */
export function ContactsPage() {
  const contacts = useContacts();
  const [query, setQuery] = useState('');
  // `?new=contact&trade=plumbing` opens the form, e.g. from a repair with nobody to ask;
  // `?contact=<id>` opens a contact, e.g. from the command bar.
  const [params, setParams] = useSearchParams();
  const editing = contacts.data?.find((c) => c.id === params.get('contact')) ?? null;
  const setEditing = (contact: Contact | null) =>
    setParams(
      (p) => {
        if (contact) p.set('contact', contact.id);
        else p.delete('contact');
        return p;
      },
      { replace: true },
    );
  const creating = params.get('new') === 'contact';
  const trade = tradeSchema.safeParse(params.get('trade'));
  const setCreating = (open: boolean) =>
    setParams(
      (p) => {
        if (open) p.set('new', 'contact');
        else {
          p.delete('new');
          p.delete('trade');
        }
        return p;
      },
      { replace: true },
    );
  const shown = (contacts.data ?? []).filter((c) => contactMatches(c, query));

  return (
    <>
      <PageHeader
        title="Contacts"
        meta={contacts.data && `${shown.length}`}
        actions={
          <>
            <SearchField
              label="Filter contacts"
              placeholder="Filter by name or trade"
              value={query}
              onChange={setQuery}
              className="w-40 sm:w-56"
            />
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> <span className="hidden sm:inline">New contact</span>
            </Button>
          </>
        }
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {contacts.isError ? (
          <ErrorNotice message={contacts.error.message} className="m-6" />
        ) : !contacts.data ? (
          <Skeleton className="m-6 h-64" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={ContactIcon}
            title={query ? 'No contacts match this filter' : 'No contacts'}
            className="mt-16"
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-sunken/90 backdrop-blur-md">
              <tr className="border-b">
                {['Name', 'Does', 'Phone', 'Email'].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      labelCaps,
                      'h-10 px-4 text-left first:pl-6',
                      // Phones show who and how to call; the rest is in the contact.
                      (h === 'Does' || h === 'Email') && 'max-md:hidden',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-grid-line hover:bg-accent"
                  onClick={() => setEditing(c)}
                >
                  <td className="py-2.5 pr-4 pl-6">
                    <span className="flex flex-col">
                      <span className="font-medium">{c.name}</span>
                      {(c.person || c.notes) && (
                        <span className="max-w-48 truncate text-xs text-muted-foreground sm:max-w-md">
                          {[c.person, c.notes].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 text-muted-foreground max-md:hidden">
                    {c.trades.map((t: Trade) => tradeLabels[t]).join(', ')}
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    {c.phone ? (
                      <a
                        href={telHref(c.phone)}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="size-3.5" /> {c.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="px-4 max-md:hidden">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Mail className="size-3.5" /> {c.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ContactEditorDialog
        open={creating}
        onOpenChange={setCreating}
        trade={trade.success ? trade.data : undefined}
      />
      <ContactEditorDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        contact={editing ?? undefined}
      />
    </>
  );
}
