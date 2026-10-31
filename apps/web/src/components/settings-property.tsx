import { type HotelProfile, type Language, languages } from '@orbit/shared';
import { FormField } from '@/components/form-field';
import { Section } from '@/components/section';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatTimeOfDay, languageLabels } from '@/lib/format';
import { countryOptions } from '@/lib/registration';

interface Props {
  profile: HotelProfile;
  onChange: (profile: HotelProfile) => void;
}

/** Name, description, country and language, contact details and check-in/out times. */
/** Every half hour of the day, plus `current` when it falls between. */
function timeOptions(current: string): string[] {
  const slots = Array.from(
    { length: 48 },
    (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
  );
  return slots.includes(current) ? slots : [...slots, current].sort();
}

export function PropertySettings({ profile, onChange }: Props) {
  const set = <K extends keyof HotelProfile>(key: K, value: HotelProfile[K]) =>
    onChange({ ...profile, [key]: value });
  const optional = (value: string) => (value.trim() === '' ? null : value);
  /** Clearing either field turns the forecast off. */
  const setCoordinate = (key: 'latitude' | 'longitude', raw: string) => {
    if (raw.trim() === '') return set('coordinates', null);
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    set('coordinates', { ...(profile.coordinates ?? { latitude: 0, longitude: 0 }), [key]: value });
  };

  return (
    <div className="flex flex-col gap-8">
      <Section title="Property">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" htmlFor="name">
            <Input id="name" value={profile.name} onChange={(e) => set('name', e.target.value)} />
          </FormField>
          <FormField label="Location" htmlFor="location">
            <Input
              id="location"
              value={profile.location}
              onChange={(e) => set('location', e.target.value)}
            />
          </FormField>
          <FormField label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea
              id="description"
              rows={3}
              value={profile.description ?? ''}
              onChange={(e) => set('description', optional(e.target.value))}
            />
          </FormField>
        </div>
      </Section>

      <Section title="Weather">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Latitude" htmlFor="latitude">
            <Input
              id="latitude"
              placeholder="37.65"
              type="number"
              step="0.01"
              min={-90}
              max={90}
              value={profile.coordinates?.latitude ?? ''}
              onChange={(e) => setCoordinate('latitude', e.target.value)}
            />
          </FormField>
          <FormField label="Longitude" htmlFor="longitude">
            <Input
              id="longitude"
              placeholder="-118.97"
              type="number"
              step="0.01"
              min={-180}
              max={180}
              value={profile.coordinates?.longitude ?? ''}
              onChange={(e) => setCoordinate('longitude', e.target.value)}
            />
          </FormField>
        </div>
      </Section>

      <Section title="Country and language">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Country" htmlFor="country">
            <Select
              id="country"
              value={profile.country}
              onValueChange={(value) => set('country', value)}
            >
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Working language" htmlFor="language">
            <Select
              id="language"
              value={profile.language}
              onValueChange={(value) => set('language', value as Language)}
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {languageLabels[l]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Section>

      <Section title="Arrival and departure">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Check-in from" htmlFor="check-in">
            <Select
              id="check-in"
              value={profile.checkInFrom}
              onValueChange={(value) => set('checkInFrom', value)}
            >
              {timeOptions(profile.checkInFrom).map((t) => (
                <option key={t} value={t}>
                  {formatTimeOfDay(t)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Check-out by" htmlFor="check-out">
            <Select
              id="check-out"
              value={profile.checkOutBy}
              onValueChange={(value) => set('checkOutBy', value)}
            >
              {timeOptions(profile.checkOutBy).map((t) => (
                <option key={t} value={t}>
                  {formatTimeOfDay(t)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Phone" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              value={profile.phone ?? ''}
              onChange={(e) => set('phone', optional(e.target.value))}
            />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={profile.email ?? ''}
              onChange={(e) => set('email', optional(e.target.value))}
            />
          </FormField>
          <FormField label="Website" htmlFor="website">
            <Input
              id="website"
              type="url"
              value={profile.website ?? ''}
              onChange={(e) => set('website', optional(e.target.value))}
            />
          </FormField>
        </div>
      </Section>
    </div>
  );
}
