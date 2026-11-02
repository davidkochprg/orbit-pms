import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type Theme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const themes: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Appearance picker. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Current = themes.find((t) => t.value === theme)?.icon ?? Monitor;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Appearance"
          tooltip="Appearance"
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
          className="grid grid-cols-3 gap-1 rounded-control border border-ink/6 bg-ink/4 p-1"
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
                theme === value && 'relative fill-action text-foreground shadow-action stroke-lit',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
