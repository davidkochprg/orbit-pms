import type { HotelProfile } from '@orbit/shared';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { PageHeader } from '@/components/page-header';
import { EntrySettings } from '@/components/settings-entries';
import { PropertySettings } from '@/components/settings-property';
import { TeamSettings } from '@/components/settings-team';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { useHotelProfile, useSaveHotelProfile } from '@/lib/api';
import { staffRoleLabels } from '@/lib/session';
import { isSettingsSection, sameProfile, settingsSections } from '@/lib/settings';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { section } = useParams();
  const profile = useHotelProfile();
  const save = useSaveHotelProfile();
  const session = useSession();
  // Edits across the profile tabs share one draft, saved together.
  const [draft, setDraft] = useState<HotelProfile | null>(null);

  if (!isSettingsSection(section)) return <Navigate to="/settings/property" replace />;

  const readOnly = !session.canManage;
  const current = draft ?? profile.data;
  const dirty = draft !== null && profile.data !== undefined && !sameProfile(draft, profile.data);
  const edit = (next: HotelProfile) => {
    save.reset();
    setDraft(next);
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 md:w-48 md:flex-col md:border-r md:border-b-0 md:px-3 md:py-5"
        >
          {settingsSections.map((s) => (
            <NavLink
              key={s.id}
              to={`/settings/${s.id}`}
              onClick={() => {
                if (!save.isPending) save.reset();
              }}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  isActive && 'bg-accent font-medium text-foreground',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-6 py-5">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {readOnly && session.current && (
                <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Lock className="size-4 shrink-0" />
                  Only managers can change settings. You are signed in as {session.current.name} (
                  {staffRoleLabels[session.current.role]}).
                </p>
              )}
              {section === 'team' ? (
                <TeamSettings
                  staff={session.staff}
                  currentId={session.current?.id ?? null}
                  readOnly={readOnly}
                />
              ) : profile.isError ? (
                <ErrorNotice message={profile.error.message} />
              ) : !current ? (
                <Skeleton className="h-80" />
              ) : (
                <fieldset disabled={readOnly} className="min-w-0">
                  {section === 'property' ? (
                    <PropertySettings profile={current} onChange={edit} />
                  ) : (
                    <EntrySettings
                      category={section}
                      profile={current}
                      onChange={edit}
                      readOnly={readOnly}
                    />
                  )}
                </fieldset>
              )}
            </div>
          </div>

          {section !== 'team' && (dirty || save.isError || save.isSuccess) && (
            <div className="flex shrink-0 items-center gap-3 border-t px-6 py-3">
              {save.isError ? (
                <ErrorNotice message={save.error.message} className="min-w-0 flex-1" />
              ) : (
                <p className="flex-1 text-sm text-muted-foreground">
                  {dirty
                    ? 'Unsaved changes. The agent uses them from the next message.'
                    : 'Saved. The agent uses the new details from the next message.'}
                </p>
              )}
              {dirty && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={save.isPending}
                    onClick={() => {
                      save.reset();
                      setDraft(null);
                    }}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    disabled={save.isPending}
                    onClick={() =>
                      draft &&
                      save.mutate(draft, {
                        onSuccess: () => setDraft(null),
                      })
                    }
                  >
                    Save changes
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
