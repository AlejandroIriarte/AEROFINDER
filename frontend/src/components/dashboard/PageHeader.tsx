// =============================================================================
// AEROFINDER — PageHeader: título, subtítulo + slot de acciones
// =============================================================================

interface PageHeaderProps {
  title:     string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <h1 className="text-[19px] font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
