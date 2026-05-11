// =============================================================================
// AEROFINDER — LiveFeed: feed scrollable de eventos WS en tiempo real
// =============================================================================

"use client";

import { useEffect, useRef } from "react";

export interface FeedEvent {
  type:      "detection" | "alert" | "telemetry" | "mission_update";
  message:   string;
  timestamp: number;
}

const TYPE_CHIP: Record<FeedEvent["type"], string> = {
  detection:      "bg-violet-100 text-violet-700",
  alert:          "bg-red-100    text-red-700",
  telemetry:      "bg-blue-100   text-blue-700",
  mission_update: "bg-slate-100  text-slate-600",
};

const TYPE_LABEL: Record<FeedEvent["type"], string> = {
  detection:      "DETECCIÓN",
  alert:          "ALERTA",
  telemetry:      "TELEMETRÍA",
  mission_update: "MISIÓN",
};

function formatTs(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60_000);
  if (diff === 0) return "ahora";
  if (diff < 60) return `hace ${diff}m`;
  return `hace ${Math.floor(diff / 60)}h`;
}

export function LiveFeed({ events, maxHeight = "220px" }: { events: FeedEvent[]; maxHeight?: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[12px] text-slate-400">
        Esperando eventos WebSocket…
      </div>
    );
  }

  return (
    <div className="overflow-y-auto" style={{ maxHeight }}>
      {events.map((ev, i) => (
        <div key={i} className="flex items-start gap-2.5 border-b border-slate-50 px-4 py-2 last:border-0">
          <span className={`mt-0.5 flex-shrink-0 rounded px-1.5 py-px text-[9px] font-bold ${TYPE_CHIP[ev.type]}`}>
            {TYPE_LABEL[ev.type]}
          </span>
          <p className="flex-1 text-[11px] leading-[1.4] text-slate-700">{ev.message}</p>
          <span className="flex-shrink-0 text-[10px] text-slate-400">{formatTs(ev.timestamp)}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
