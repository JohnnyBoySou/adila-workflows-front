import { useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { RemotePresence } from "~/hooks/use-collaboration";
import { colorForUserId, initialsFor } from "./collab-color";

type CollabPresenceStackProps = {
  status: "idle" | "connecting" | "online" | "offline";
  others: RemotePresence[];
  max?: number;
};

export function CollabPresenceStack({ status, others, max = 5 }: CollabPresenceStackProps) {
  const visible = useMemo(() => others.slice(0, max), [others, max]);
  const overflow = Math.max(0, others.length - visible.length);

  if (status === "idle") return null;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <div className="flex -space-x-2">
          {visible.map((p) => {
            const color = colorForUserId(p.userId);
            const label = p.displayName ?? short(p.userId);
            return (
              <Tooltip key={p.userId}>
                <TooltipTrigger asChild>
                  <Avatar
                    className="size-7 ring-2 ring-background"
                    style={{ outline: `2px solid ${color}`, outlineOffset: -2 }}
                  >
                    {p.image && <AvatarImage src={p.image} alt={label} />}
                    <AvatarFallback
                      className="text-[10px] font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {initialsFor(label)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            );
          })}
          {overflow > 0 && (
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-background">
              +{overflow}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function StatusDot({ status }: { status: "idle" | "connecting" | "online" | "offline" }) {
  const color =
    status === "online"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500 animate-pulse"
        : "bg-zinc-400";
  const label =
    status === "online" ? "Colaboração ativa" : status === "connecting" ? "Conectando…" : "Offline";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-block size-2 rounded-full", color)} aria-label={label} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function short(id: string) {
  return id.slice(0, 6);
}
