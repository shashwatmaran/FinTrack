import { ACCENT_BG } from "@/lib/accent";
import type { AppUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const sizes = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-12 w-12 text-[15px]",
};

export function Avatar({
  user,
  size = "md",
  className,
}: {
  user: Pick<AppUser, "initials" | "color" | "name">;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      title={user.name}
      className={cn(
        "flex flex-none items-center justify-center rounded-full border-2 border-ft-ink font-bold",
        ACCENT_BG[user.color],
        sizes[size],
        className
      )}
    >
      {user.initials}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 4,
  size = "xs",
}: {
  users: Pick<AppUser, "initials" | "color" | "name" | "id">[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;
  return (
    <div className="flex">
      {shown.map((user, i) => (
        <Avatar
          key={user.id}
          user={user}
          size={size}
          className={i > 0 ? "-ml-2" : undefined}
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "-ml-2 flex flex-none items-center justify-center rounded-full border-2 border-ft-ink bg-ft-line font-bold",
            sizes[size]
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
