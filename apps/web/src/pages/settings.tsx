import type { HotelProfile } from '@orbit/shared';
import { useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { PageHeader } from '@/components/page-header';
import { ReadOnlyNotice, SaveBar } from '@/components/save-bar';
import { EntrySettings } from '@/components/settings-entries';
import { PropertySettings } from '@/components/settings-property';
import { TeamSettings } from '@/components/settings-team';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { useHotelProfile, useSaveHotelProfile } from '@/lib/api';
import { isSettingsSection, sameSettings, settingsSections } from '@/lib/settings';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { section } = useParams();
  const profile = useHotelProfile();
  const save = useSaveHotelProfile();
  const session = useSession();
  // Edits across the profile tabs share one draft, saved together.
  const [draft, setDraft] = useState<HotelProfile | null>(null);

  // Rooms and rates have their own pages now; old links still land there.
  if (section === 'rooms' || section === 'rates') return <Navigate to={`/${section}`} replace />;
  if (!isSettingsSection(section)) return <Navigate to="/settings/property" replace />;

  const readOnly = !session.canManage;
  const current = draft ?? profile.data;
  const edit = (next: HotelProfile) => {
    save.reset();
    setDraft(next);
  };
  const dirty = draft !== null && profile.data !== undefined && !sameSettings(draft, profile.data);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b p-2 md:w-52 md:flex-col md:border-r md:border-b-0 md:p-3"
        >
          {settingsSections.map((s) => (
            <NavLink
              key={s.id}
              to={`/settings/${s.id}`}
              onClick={() => !save.isPending && save.reset()}
              className={({ isActive }) =>
                cn(
                  'flex h-8 shrink-0 items-center rounded-lg px-2.5 text-sm text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  isActive && 'bg-sidebar-accent text-foreground',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-6 py-6">
            <div className="flex max-w-3xl flex-col gap-6">
              <ReadOnlyNotice what="settings" />
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

          {section !== 'team' && (
            <SaveBar
              save={save}
              dirty={dirty}
              onSave={() => draft && save.mutate(draft, { onSuccess: () => setDraft(null) })}
              onDiscard={() => setDraft(null)}
              unsaved="Unsaved changes. The agent uses them from the next message."
              saved="Saved. The agent uses the new details from the next message."
              keepWithin="/settings"
            />
          )}
        </div>
      </div>
    </>
  );
}
