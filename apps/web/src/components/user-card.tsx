import { GuestAvatar } from '@/components/guest-avatar';
import { currentUser, staffRoleLabels } from '@/lib/session';

/** The signed-in staff member, at the bottom of the sidebar. */
export function UserCard() {
  return (
    <div
      title={`${currentUser.name}, ${staffRoleLabels[currentUser.role]}`}
      className="flex min-w-0 flex-1 items-center gap-2.5 px-1 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0"
    >
      <GuestAvatar
        name={currentUser.name}
        size="md"
        className="bg-primary-soft text-primary-text ring-primary/20"
      />
      <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-medium">{currentUser.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {staffRoleLabels[currentUser.role]}
        </span>
      </div>
    </div>
  );
}
