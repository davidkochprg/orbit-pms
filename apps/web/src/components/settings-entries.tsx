import type { HotelInfoCategory, HotelInfoEntry, HotelProfile } from '@orbit/shared';
import { BookOpenText, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { entryHints, newEntry } from '@/lib/settings';

interface Props {
  category: HotelInfoCategory;
  profile: HotelProfile;
  onChange: (profile: HotelProfile) => void;
  readOnly: boolean;
}

/** The policies, amenities or guest info entries, each a title and a few sentences. */
export function EntrySettings({ category, profile, onChange, readOnly }: Props) {
  const { title, example } = entryHints[category];
  const entries = profile.entries.filter((e) => e.category === category);

  const update = (id: string, patch: Partial<HotelInfoEntry>) =>
    onChange({
      ...profile,
      entries: profile.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  const remove = (id: string) =>
    onChange({ ...profile, entries: profile.entries.filter((e) => e.id !== id) });
  const add = () =>
    onChange({ ...profile, entries: [...profile.entries, newEntry(category, profile.entries)] });

  return (
    <Section
      title={title}
      count={entries.length}
      actions={
        !readOnly && (
          <Button variant="ghost" size="sm" onClick={add}>
            <Plus /> Add
          </Button>
        )
      }
    >
      {entries.length === 0 ? (
        <EmptyState icon={BookOpenText} title={`No ${title.toLowerCase()} yet`} className="py-8" />
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-2 rounded-lg bg-surface-raised p-3 shadow-raised"
            >
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Title"
                  placeholder={example}
                  value={entry.title}
                  onChange={(e) => update(entry.id, { title: e.target.value })}
                  className="font-medium"
                />
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${entry.title || 'entry'}`}
                    onClick={() => remove(entry.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <Textarea
                aria-label="Details"
                rows={2}
                placeholder="What guests should know"
                value={entry.details}
                onChange={(e) => update(entry.id, { details: e.target.value })}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
