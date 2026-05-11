// =============================================================================
// AEROFINDER — SectionCard: card con header (título + ícono + link) + children
// =============================================================================

import Link from "next/link";

interface SectionCardProps {
  title:      string;
  icon?:      React.ReactNode;
  linkHref?:  string;
  linkLabel?: string;
  badge?:     number | null;
  children:   React.ReactNode;
  className?: string;
}

export function SectionCard({ title, icon, linkHref, linkLabel = "Ver todo →", badge, children, className = "" }: SectionCardProps) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
          {icon && <span className="text-slate-400">{icon}</span>}
          {title}
          {badge != null && badge > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold text-amber-700">
              {badge}
            </span>
          )}
        </div>
        {linkHref && (
          <Link href={linkHref} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
            {linkLabel}
          </Link>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
