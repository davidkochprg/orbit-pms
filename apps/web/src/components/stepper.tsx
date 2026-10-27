import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** A whole number with minus and plus buttons, e.g. the number of adults. */
export function Stepper({ label, value, min = 0, max = 20, onChange, disabled }: StepperProps) {
  return (
    <div className="inline-flex items-center rounded-lg border" role="group" aria-label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus />
      </Button>
      <output aria-live="polite" className="w-7 text-center text-sm font-medium tabular-nums">
        {value}
      </output>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}
