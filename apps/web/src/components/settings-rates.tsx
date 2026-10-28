import {
  type Currency,
  currencies,
  type PricingBasis,
  type PricingConfig,
  type TaxMode,
  type VatBracket,
} from '@orbit/shared';
import { Plus, Trash2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router';
import { FormField } from '@/components/form-field';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { currencyMark } from '@/lib/format';
import { fromPercent, fromSurcharge, newSeason, toPercent, toSurcharge } from '@/lib/settings';
import { cn } from '@/lib/utils';

interface Props {
  pricing: PricingConfig;
  onChange: (pricing: PricingConfig) => void;
  readOnly: boolean;
}

/** Seasons, child and long-stay discounts, and add-on prices: everything `quote()` reads. */
export function RatesSettings({ pricing, onChange, readOnly }: Props) {
  const set = <K extends keyof PricingConfig>(key: K, value: PricingConfig[K]) =>
    onChange({ ...pricing, [key]: value });
  const replaceAt = <T,>(list: T[], index: number, item: T) =>
    list.map((x, i) => (i === index ? item : x));
  const removeAt = <T,>(list: T[], index: number) => list.filter((_, i) => i !== index);

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-prose text-sm text-muted-foreground">
        Every quote, in the app and from the agent, is computed from these rates. New quotes use
        them as soon as you save; existing bookings keep their price. Base prices per room type are
        under{' '}
        <Link to="/settings/rooms" className="text-foreground underline underline-offset-2">
          Rooms
        </Link>
        .
      </p>

      <Section title="Currency and taxes">
        <Hint>
          How prices are stated. In the US, rates are per room and taxes go on top of them; in
          Europe, prices usually include VAT. Changing the currency doesn&apos;t convert any amount.
        </Hint>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Currency" htmlFor="currency">
            <NativeSelect
              id="currency"
              value={pricing.currency}
              disabled={readOnly}
              onChange={(e) => set('currency', e.target.value as Currency)}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Base prices are</span>
            <Segmented<PricingBasis>
              label="Base prices are"
              value={pricing.pricingBasis}
              disabled={readOnly}
              options={[
                { value: 'per_room', label: 'Per room' },
                { value: 'per_person', label: 'Per person' },
              ]}
              onChange={(v) => set('pricingBasis', v)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Taxes</span>
            <Segmented<TaxMode>
              label="Taxes"
              value={pricing.tax.mode}
              disabled={readOnly}
              options={[
                { value: 'exclusive', label: 'Added on top of prices' },
                { value: 'inclusive', label: 'Included in prices' },
              ]}
              onChange={(mode) => set('tax', { ...pricing.tax, mode })}
            />
          </div>
          {(
            [
              [
                'reduced',
                'Lodging tax',
                'Accommodation and extra beds, e.g. an occupancy tax or reduced VAT.',
              ],
              ['standard', 'Other tax', 'Most extras, e.g. a sales tax or standard VAT.'],
            ] as [Exclude<VatBracket, 'none'>, string, string][]
          ).map(([bracket, title, hint]) => (
            <FormField key={bracket} label={title} htmlFor={`tax-${bracket}`} hint={hint}>
              <div className="grid grid-cols-[1fr_7.5rem] gap-2">
                <Input
                  id={`tax-${bracket}`}
                  aria-label={`${title} name`}
                  value={pricing.tax[bracket].label}
                  disabled={readOnly}
                  onChange={(e) =>
                    set('tax', {
                      ...pricing.tax,
                      [bracket]: { ...pricing.tax[bracket], label: e.target.value },
                    })
                  }
                />
                <NumberInput
                  aria-label={`${title} rate`}
                  min={0}
                  max={50}
                  step={0.01}
                  suffix="%"
                  value={pricing.tax[bracket].rate}
                  disabled={readOnly}
                  onValue={(v) =>
                    set('tax', {
                      ...pricing.tax,
                      [bracket]: { ...pricing.tax[bracket], rate: Math.round(v * 100) / 100 },
                    })
                  }
                />
              </div>
            </FormField>
          ))}
        </div>
      </Section>

      <Section
        title="Seasons"
        count={pricing.seasons.length}
        actions={
          !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => set('seasons', [...pricing.seasons, newSeason(pricing.seasons)])}
            >
              <Plus /> Add
            </Button>
          )
        }
      >
        <Hint>
          A surcharge on the base price for nights from the first to the last day, both included. A
          season may wrap the new year (12-20 to 03-15). The first matching season wins.
        </Hint>
        <Rows
          header={['Name', 'First night', 'Last night', 'Surcharge %']}
          columns="sm:grid-cols-[1fr_7rem_7rem_7rem_2rem]"
          headerOnMobile={false}
          empty="No seasons: every night is at the base price."
        >
          {pricing.seasons.map((season, i) => (
            <Row
              key={i}
              columns="grid-cols-[1fr_1fr_1fr_2rem] sm:grid-cols-[1fr_7rem_7rem_7rem_2rem]"
              removeClassName="-order-1 sm:order-none"
              onRemove={readOnly ? undefined : () => set('seasons', removeAt(pricing.seasons, i))}
              removeLabel={`Remove ${season.name}`}
            >
              <Input
                aria-label="Season name"
                className="-order-2 col-span-3 sm:order-none sm:col-span-1"
                value={season.name}
                onChange={(e) =>
                  set('seasons', replaceAt(pricing.seasons, i, { ...season, name: e.target.value }))
                }
              />
              <Input
                aria-label="First night (MM-DD)"
                placeholder="MM-DD"
                value={season.from}
                onChange={(e) =>
                  set('seasons', replaceAt(pricing.seasons, i, { ...season, from: e.target.value }))
                }
              />
              <Input
                aria-label="Last night (MM-DD)"
                placeholder="MM-DD"
                value={season.to}
                onChange={(e) =>
                  set('seasons', replaceAt(pricing.seasons, i, { ...season, to: e.target.value }))
                }
              />
              <NumberInput
                aria-label="Surcharge in percent"
                step={1}
                suffix="%"
                value={toSurcharge(season.multiplier)}
                onValue={(v) =>
                  set(
                    'seasons',
                    replaceAt(pricing.seasons, i, { ...season, multiplier: fromSurcharge(v) }),
                  )
                }
              />
            </Row>
          ))}
        </Rows>
      </Section>

      {pricing.pricingBasis === 'per_person' && (
        <Section
          title="Child discounts"
          count={pricing.childDiscounts.length}
          actions={
            !readOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const last = pricing.childDiscounts.at(-1);
                  set('childDiscounts', [
                    ...pricing.childDiscounts,
                    { maxAge: Math.min((last?.maxAge ?? -1) + 1, 17), discount: 0.25 },
                  ]);
                }}
              >
                <Plus /> Add
              </Button>
            )
          }
        >
          <Hint>
            Off the adult rate, for each child up to and including the age. List the youngest tier
            first; older children pay the adult rate.
          </Hint>
          <Rows
            header={['Up to age', 'Discount %']}
            columns="grid-cols-[1fr_1fr_2rem] sm:grid-cols-[7rem_7rem_2rem]"
            empty="No child discounts: children pay the adult rate."
          >
            {pricing.childDiscounts.map((tier, i) => (
              <Row
                key={i}
                columns="grid-cols-[1fr_1fr_2rem] sm:grid-cols-[7rem_7rem_2rem]"
                onRemove={
                  readOnly
                    ? undefined
                    : () => set('childDiscounts', removeAt(pricing.childDiscounts, i))
                }
                removeLabel={`Remove the tier up to age ${tier.maxAge}`}
              >
                <NumberInput
                  aria-label="Up to age"
                  min={0}
                  max={17}
                  value={tier.maxAge}
                  onValue={(v) =>
                    set(
                      'childDiscounts',
                      replaceAt(pricing.childDiscounts, i, { ...tier, maxAge: Math.round(v) }),
                    )
                  }
                />
                <NumberInput
                  aria-label="Discount in percent"
                  min={0}
                  max={100}
                  value={toPercent(tier.discount)}
                  onValue={(v) =>
                    set(
                      'childDiscounts',
                      replaceAt(pricing.childDiscounts, i, { ...tier, discount: fromPercent(v) }),
                    )
                  }
                />
              </Row>
            ))}
          </Rows>
        </Section>
      )}

      <Section
        title="Long stays"
        count={pricing.longStay.length}
        actions={
          !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const longest = Math.max(1, ...pricing.longStay.map((t) => t.minNights));
                set('longStay', [...pricing.longStay, { minNights: longest + 1, discount: 0.05 }]);
              }}
            >
              <Plus /> Add
            </Button>
          )
        }
      >
        <Hint>
          Off accommodation, after child discounts. A stay gets the tier with the most nights it
          reaches. Add-ons are not discounted.
        </Hint>
        <Rows
          header={['From nights', 'Discount %']}
          columns="grid-cols-[1fr_1fr_2rem] sm:grid-cols-[7rem_7rem_2rem]"
          empty="No long-stay discounts."
        >
          {pricing.longStay.map((tier, i) => (
            <Row
              key={i}
              columns="grid-cols-[1fr_1fr_2rem] sm:grid-cols-[7rem_7rem_2rem]"
              onRemove={readOnly ? undefined : () => set('longStay', removeAt(pricing.longStay, i))}
              removeLabel={`Remove the ${tier.minNights}-night discount`}
            >
              <NumberInput
                aria-label="From nights"
                min={2}
                value={tier.minNights}
                onValue={(v) =>
                  set(
                    'longStay',
                    replaceAt(pricing.longStay, i, { ...tier, minNights: Math.round(v) }),
                  )
                }
              />
              <NumberInput
                aria-label="Discount in percent"
                min={0}
                max={100}
                value={toPercent(tier.discount)}
                onValue={(v) =>
                  set(
                    'longStay',
                    replaceAt(pricing.longStay, i, { ...tier, discount: fromPercent(v) }),
                  )
                }
              />
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title="Add-ons">
        <Hint>Whole {pricing.currency}, per night of the stay.</Hint>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Wellness, per guest per night" htmlFor="wellness-price">
            <NumberInput
              id="wellness-price"
              min={0}
              suffix={currencyMark(pricing.currency)}
              value={pricing.wellness.perPersonPerNight}
              onValue={(v) =>
                set('wellness', { ...pricing.wellness, perPersonPerNight: Math.round(v) })
              }
            />
          </FormField>
          <FormField
            label="Wellness from age"
            htmlFor="wellness-age"
            hint="Younger children use it for free."
          >
            <NumberInput
              id="wellness-age"
              min={0}
              max={17}
              value={pricing.wellness.minAge}
              onValue={(v) => set('wellness', { ...pricing.wellness, minAge: Math.round(v) })}
            />
          </FormField>
          <FormField label="Extra bed, per bed per night" htmlFor="extra-bed-price">
            <NumberInput
              id="extra-bed-price"
              min={0}
              suffix={currencyMark(pricing.currency)}
              value={pricing.extraBed.perNight}
              onValue={(v) => set('extraBed', { perNight: Math.round(v) })}
            />
          </FormField>
          <FormField label="Dog, per dog per night" htmlFor="dog-price">
            <NumberInput
              id="dog-price"
              min={0}
              suffix={currencyMark(pricing.currency)}
              value={pricing.dog.perNight}
              onValue={(v) => set('dog', { perNight: Math.round(v) })}
            />
          </FormField>
        </div>
      </Section>

      <Section title={pricing.cityTax.label}>
        <Hint>
          A local tax or fee per paying guest per night, added to each bill rather than to the
          quoted price. Adults always pay it. Set it to 0 if there is none.
        </Hint>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name on the bill" htmlFor="city-tax-label" className="sm:col-span-2">
            <Input
              id="city-tax-label"
              value={pricing.cityTax.label}
              disabled={readOnly}
              onChange={(e) => set('cityTax', { ...pricing.cityTax, label: e.target.value })}
            />
          </FormField>
          <FormField label="Per guest per night" htmlFor="city-tax-price">
            <NumberInput
              id="city-tax-price"
              min={0}
              suffix={currencyMark(pricing.currency)}
              value={pricing.cityTax.perPersonPerNight}
              onValue={(v) =>
                set('cityTax', { ...pricing.cityTax, perPersonPerNight: Math.round(v) })
              }
            />
          </FormField>
          <FormField
            label="Children pay from age"
            htmlFor="city-tax-age"
            hint="18 means children don't pay."
          >
            <NumberInput
              id="city-tax-age"
              min={0}
              max={18}
              value={pricing.cityTax.minAge}
              onValue={(v) => set('cityTax', { ...pricing.cityTax, minAge: Math.round(v) })}
            />
          </FormField>
        </div>
      </Section>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="-mt-1 max-w-prose text-sm text-muted-foreground">{children}</p>;
}

/** A list of editable rows with column headers on wider screens. */
function Rows({
  header,
  columns,
  empty,
  headerOnMobile = true,
  children,
}: {
  header: string[];
  columns: string;
  /** Off when the columns wrap on narrow screens, so the headers would not line up. */
  headerOnMobile?: boolean;
  empty: string;
  children: ReactNode[];
}) {
  if (children.length === 0) {
    return <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden
        className={cn(
          'gap-2 px-0.5 text-xs text-muted-foreground',
          headerOnMobile ? 'grid' : 'hidden sm:grid',
          columns,
        )}
      >
        {header.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

function Row({
  columns,
  onRemove,
  removeLabel,
  removeClassName,
  children,
}: {
  columns: string;
  onRemove: (() => void) | undefined;
  removeLabel: string;
  removeClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid items-center gap-2', columns)}>
      {children}
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={removeLabel}
          onClick={onRemove}
          className={cn('text-muted-foreground hover:text-destructive', removeClassName)}
        >
          <Trash2 />
        </Button>
      ) : (
        <span className={removeClassName} />
      )}
    </div>
  );
}

/** A number input that reports numbers; an emptied field counts as 0. */
function NumberInput({
  value,
  onValue,
  suffix,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValue: (value: number) => void;
  suffix?: string;
}) {
  const input = (
    <Input
      type="number"
      inputMode="decimal"
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onValue(e.target.value === '' ? 0 : Number(e.target.value))}
      {...props}
      className={cn('tabular-nums', suffix && 'pr-12', props.className)}
    />
  );
  if (!suffix) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}
