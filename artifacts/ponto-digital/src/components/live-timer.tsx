import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardQueryKey,
  getListServicesQueryKey,
} from "@workspace/api-client-react";
import { displayedElapsedSeconds } from "./elapsed-timer";

interface LiveTimerProps {
  elapsedSeconds: number;
  receivedAt: number;
  isPaused?: boolean;
  className?: string;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function LiveTimer({
  elapsedSeconds,
  receivedAt,
  isPaused = false,
  className,
}: LiveTimerProps) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const displayed = displayedElapsedSeconds(
    elapsedSeconds,
    isPaused,
    receivedAt,
    now,
  );

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const synchronize = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    };

    refresh();
    window.addEventListener("pageshow", synchronize);
    document.addEventListener("visibilitychange", synchronize);
    if (isPaused) {
      return () => {
        window.removeEventListener("pageshow", synchronize);
        document.removeEventListener("visibilitychange", synchronize);
      };
    }

    const interval = window.setInterval(refresh, 250);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pageshow", synchronize);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, [isPaused, queryClient]);

  return <div className={className}>{formatDuration(displayed)}</div>;
}

export function formatStaticDuration(seconds: number) {
  return formatDuration(Math.max(0, Math.floor(seconds || 0)));
}