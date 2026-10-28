import type { HotelProfile, PricingConfig } from '@orbit/shared';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { PageHeader } from '@/components/page-header';
import { EntrySettings } from '@/components/settings-entries';
import { PropertySettings } from '@/components/settings-property';
import { RatesSettings } from '@/components/settings-rates';
import { RoomSettings } from '@/components/settings-rooms';
import { TeamSettings } from '@/components/settings-team';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { useHotelProfile, usePricing, useSaveHotelProfile, useSavePricing } from '@/lib/api';
import { staffRoleLabels } from '@/lib/session';
import {
  isProfileSection,
  isSettingsSection,
  sameSettings,
  settingsSections,
} from '@/lib/settings';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { section } = useParams();
  const profile = useHotelProfile();
  const saveProfile = useSaveHotelProfile();
  const pricing = usePricing();
  const savePricing = useSavePricing();
  const session = useSession();
  // Edits across the profile tabs share one draft, saved together; the rates have their own.
  const [draft, setDraft] = useState<HotelProfile | null>(null);
  const [ratesDraft, setRatesDraft] = useState<PricingConfig | null>(null);

  if (!isSettingsSection(section)) return <Navigate to="/settings/property" replace />;

  const readOnly = !session.canManage;
  const current = draft ?? profile.data;
  const currentRates = ratesDraft ?? pricing.data;
  const edit = (next: HotelProfile) => {
    saveProfile.reset();
    setDraft(next);
  };
  const editRates = (next: PricingConfig) => {
    savePricing.reset();
    setRatesDraft(next);
  };

  // The save bar below acts on whichever draft the section edits.
  const bar = isProfileSection(section)
    ? {
        save: saveProfile,
        dirty: draft !== null && profile.data !== undefined && !sameSettings(draft, profile.data),
        discard: () => setDraft(null),
        commit: () => draft && saveProfile.mutate(draft, { onSuccess: () => setDraft(null) }),
        unsaved: 'Unsaved changes. The agent uses them from the next message.',
        saved: 'Saved. The agent uses the new details from the next message.',
      }
    : section === 'rates'
      ? {
          save: savePricing,
          dirty:
            ratesDraft !== null &&
            pricing.data !== undefined &&
            !sameSettings(ratesDraft, pricing.data),
          discard: () => setRatesDraft(null),
          commit: () =>
            ratesDraft && savePricing.mutate(ratesDraft, { onSuccess: () => setRatesDraft(null) }),
          unsaved: 'Unsaved changes. Existing bookings keep their price.',
          saved: 'Saved. New quotes use these rates; existing bookings keep their price.',
        }
      : null;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b bg-surface-sunken p-2 md:w-52 md:flex-col md:border-r md:border-b-0 md:p-3"
        >
          {settingsSections.map((s) => (
            <NavLink
              key={s.id}
              to={`/settings/${s.id}`}
              onClick={() => {
                if (!saveProfile.isPending) saveProfile.reset();
                if (!savePricing.isPending) savePricing.reset();
              }}
              className={({ isActive }) =>
                cn(
                  'flex h-9 shrink-0 items-center rounded-lg px-2.5 text-sm text-muted-foreground outline-none transition-colors duration-150 ease-snap hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  isActive && 'bg-sidebar-accent text-foreground',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-6 py-6 lg:px-10">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {readOnly && session.current && (
                <p className="flex items-center gap-2 rounded-control bg-surface-sunken px-3 py-2.5 text-sm text-muted-foreground">
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
              ) : section === 'rooms' ? (
                <RoomSettings readOnly={readOnly} />
              ) : section === 'rates' ? (
                pricing.isError ? (
                  <ErrorNotice message={pricing.error.message} />
                ) : !currentRates ? (
                  <Skeleton className="h-80" />
                ) : (
                  <fieldset disabled={readOnly} className="min-w-0">
                    <RatesSettings
                      pricing={currentRates}
                      onChange={editRates}
                      readOnly={readOnly}
                    />
                  </fieldset>
                )
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

          {bar && (bar.dirty || bar.save.isError || bar.save.isSuccess) && (
            <div className="flex shrink-0 items-center gap-3 border-t px-6 py-3">
              {bar.save.isError ? (
                <ErrorNotice message={bar.save.error.message} className="min-w-0 flex-1" />
              ) : (
                <p className="flex-1 text-sm text-muted-foreground">
                  {bar.dirty ? bar.unsaved : bar.saved}
                </p>
              )}
              {bar.dirty && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={bar.save.isPending}
                    onClick={() => {
                      bar.save.reset();
                      bar.discard();
                    }}
                  >
                    Discard
                  </Button>
                  <Button size="sm" disabled={bar.save.isPending} onClick={bar.commit}>
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
