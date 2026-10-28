import {
  type Language,
  languages,
  type StaffMember,
  type StaffRole,
  staffRoles,
} from '@orbit/shared';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { GuestAvatar } from '@/components/guest-avatar';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAddStaff, useUpdateStaff } from '@/lib/api';
import { languageLabels } from '@/lib/format';
import { staffRoleLabels } from '@/lib/session';
import { cn } from '@/lib/utils';

interface Props {
  staff: StaffMember[];
  currentId: string | null;
  readOnly: boolean;
}

/** Who can sign in, and with which role. Changes save right away. */
export function TeamSettings({ staff, currentId, readOnly }: Props) {
  const update = useUpdateStaff();
  const error = update.error;

  return (
    <div className="flex flex-col gap-8">
      {!readOnly && <AddMember />}
      <Section title="Team" count={staff.filter((s) => s.active).length}>
        {error && (
          <ErrorNotice message={error.message} onDismiss={() => update.reset()} className="mb-2" />
        )}
        <ul className="-mx-2 flex flex-col">
          {staff.map((member) => (
            <li
              key={member.id}
              className={cn(
                'flex items-center gap-3 rounded-lg px-2 py-2',
                !member.active && 'opacity-60',
              )}
            >
              <GuestAvatar name={member.name} size="md" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {member.name}
                  {member.id === currentId && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {member.email ?? 'No email'} · reads {languageLabels[member.language]}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-ink/7 bg-ink/4 px-2 py-0.5 text-xs">
                {member.active ? staffRoleLabels[member.role] : 'Inactive'}
              </span>
              {!readOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Change ${member.name}`}
                      disabled={update.isPending}
                      className="text-muted-foreground"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Role
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={member.role}
                      onValueChange={(role) =>
                        update.mutate({ id: member.id, role: role as StaffRole })
                      }
                    >
                      {staffRoles.map((role) => (
                        <DropdownMenuRadioItem key={role} value={role}>
                          {staffRoleLabels[role]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Language for translations
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={member.language}
                      onValueChange={(language) =>
                        update.mutate({ id: member.id, language: language as Language })
                      }
                    >
                      {languages.map((language) => (
                        <DropdownMenuRadioItem key={language} value={language}>
                          {languageLabels[language]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant={member.active ? 'destructive' : 'default'}
                      onSelect={() => update.mutate({ id: member.id, active: !member.active })}
                    >
                      {member.active ? 'Deactivate' : 'Reactivate'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function AddMember() {
  const add = useAddStaff();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('receptionist');

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate(
      { name, email: email.trim() || null, role, language: 'cs' },
      {
        onSuccess: () => {
          setName('');
          setEmail('');
        },
      },
    );
  }

  return (
    <Section title="Add a team member">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name" htmlFor="staff-name">
            <Input
              id="staff-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label="Email" htmlFor="staff-email">
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Role"
            className="grid grid-cols-3 gap-1 rounded-[0.625rem] border border-ink/6 bg-ink/4 p-1"
          >
            {staffRoles.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  role === r && 'relative fill-action text-foreground shadow-action stroke-lit',
                )}
              >
                {staffRoleLabels[r]}
              </button>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={add.isPending || name.trim() === ''}>
            <UserPlus /> Add
          </Button>
        </div>
        {add.error && <ErrorNotice message={add.error.message} onDismiss={() => add.reset()} />}
      </form>
    </Section>
  );
}
