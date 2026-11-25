import * as React from "react";

export function PageHeader({ title, description, actions, breadcrumb }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-sm text-muted-foreground">{breadcrumb}</div> : null}
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
