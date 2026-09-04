import { cn } from '../../../../lib/utils';

export type ToolStatus = 'running' | 'completed' | 'error' | 'denied';

const STATUS_CONFIG: Record<ToolStatus, { label: string; className: string }> = {
  running: {
    label: 'Running',
    className: 'bg-blue-100 text-blue-700 bg-blue-900/30 text-blue-300',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-100 text-green-700 bg-green-900/30 text-green-300',
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-700 bg-red-900/30 text-red-300',
  },
  denied: {
    label: 'Denied',
    className: 'bg-orange-100 text-orange-700 bg-orange-900/30 text-orange-300',
  },
};

interface ToolStatusBadgeProps {
  status: ToolStatus;
  className?: string;
}

export function ToolStatusBadge({ status, className }: ToolStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-px text-[length:var(--fs-10)] font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
