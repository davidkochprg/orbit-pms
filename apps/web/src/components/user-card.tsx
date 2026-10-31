import { Check, ChevronsUpDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { GuestAvatar } from '@/components/guest-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { staffRoleLabels } from '@/lib/session';
import { Tip } from '@/components/ui/tooltip';

/** The signed-in staff member at the bottom of the sidebar; opens a menu to switch user. */
export function UserCard() {
  const { current, staff, signInAs, signOut } = useSession();
  const navigate = useNavigate();
  if (!current) {
    return <Skeleton className="h-9 min-w-0 flex-1 group-data-[collapsible=icon]:hidden" />;
  }
  const others = staff.filter((s) => s.active);

  return (
    <DropdownMenu>
      <Tip label={`${current.name}, ${staffRoleLabels[current.role]}`}>
        <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0">
          <GuestAvatar name={current.name} size="md" />
          <span className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{current.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {staffRoleLabels[current.role]}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Switch user
          </DropdownMenuLabel>
          {others.map((member) => (
            <DropdownMenuItem key={member.id} onSelect={() => signInAs(member.id)}>
              <GuestAvatar name={member.name} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{member.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {staffRoleLabels[member.role]}
                </span>
              </span>
              {member.id === current.id && <Check className="size-4 text-primary-text" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut();
            void navigate('/welcome', { replace: true });
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
