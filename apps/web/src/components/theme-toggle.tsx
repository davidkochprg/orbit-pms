import { type LucideIcon, Monitor, Moon, Sun, Sunrise } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { dayGradient, formatMinute, MINUTES_PER_DAY, phaseLabel } from '@/lib/daylight';
import { type Theme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const themes: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'daylight', label: 'Daylight', icon: Sunrise },
  { value: 'system', label: 'System', icon: Monitor },
];

// Computed once: the track previews the whole day.
const trackStyle = { backgroundImage: dayGradient() };

/** Appearance picker. The daylight theme gets a slider to preview any time of day. */
export function ThemeToggle() {
  const { theme, setTheme, daylightMinute, pinnedMinute, setPinnedMinute } = useTheme();
  const Current = themes.find((t) => t.value === theme)?.icon ?? Monitor;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Appearance"
          className="text-muted-foreground"
        >
          <Current />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="flex flex-col gap-3">
        <p className="font-medium">Appearance</p>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1"
        >
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                theme === value && 'bg-background text-foreground shadow-raised',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {theme === 'daylight' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">{phaseLabel(daylightMinute)}</span>
              <span className="font-medium tabular-nums">{formatMinute(daylightMinute)}</span>
            </div>
            <Slider
              aria-label="Time of day"
              min={0}
              max={MINUTES_PER_DAY - 5}
              step={5}
              value={[daylightMinute]}
              onValueChange={([minute]) => minute !== undefined && setPinnedMinute(minute)}
              trackStyle={trackStyle}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {pinnedMinute === null ? 'Following your clock' : 'Previewing a time of day'}
              </span>
              {pinnedMinute !== null && (
                <button
                  type="button"
                  onClick={() => setPinnedMinute(null)}
                  className="rounded font-medium text-primary-text hover:underline"
                >
                  Back to now
                </button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
