import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from 'cn';
import { Select as SelectPrimitive } from 'radix-ui';

/** Radix refuses an empty item value; a blank option ("Choose…") stands in with this. */
const BLANK = '__blank__';

interface Option {
  value: string;
  label: React.ReactNode;
  disabled: boolean;
}

/** The `<option>` elements among the children, through arrays and fragments. */
function optionsOf(children: React.ReactNode): Option[] {
  const found: Option[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return;
    if (child.type === React.Fragment) {
      found.push(...optionsOf(child.props.children));
      return;
    }
    if (child.type !== 'option') return;
    const props = child.props as React.ComponentProps<'option'>;
    found.push({
      value: String(props.value ?? ''),
      label: props.children,
      disabled: Boolean(props.disabled),
    });
  });
  return found;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  /** `<option value>label</option>` elements, as with a native select. */
  children: React.ReactNode;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  /** Opens the list as soon as it mounts, e.g. for editing in place. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** The app's select: a field that opens a list styled like its menus, instead of the OS one. */
function Select({
  value,
  onValueChange,
  children,
  id,
  disabled,
  className,
  defaultOpen,
  onOpenChange,
  ...props
}: SelectProps) {
  const options = optionsOf(children);
  const blank = options.find((o) => o.value === '');
  return (
    <SelectPrimitive.Root
      value={value === '' ? BLANK : value}
      onValueChange={(v) => onValueChange(v === BLANK ? '' : v)}
      disabled={disabled}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={props['aria-label']}
        data-slot="select"
        className={cn(
          'flex h-9 w-full min-w-0 items-center gap-2 rounded-control border border-input bg-background py-1 pr-2.5 pl-3 text-left text-sm shadow-[inset_0_1px_2px_var(--shadow-soft)] outline-none focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
          value === '' && 'text-subtle-foreground',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value placeholder={blank?.label} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-floating backdrop-blur-2xl data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <SelectPrimitive.Viewport className="scrollbar-thin max-h-72 p-1.5">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value || BLANK}
                value={o.value || BLANK}
                disabled={o.disabled}
                className={cn(
                  'relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
                  o.value === '' && 'text-muted-foreground',
                )}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { Select };
