import * as React from "react";
import { cn } from "@/lib/utils";

interface TagBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tag: string;
  count?: number;
  active?: boolean;
  onRemove?: () => void;
}

export function TagBadge({
  tag,
  count,
  active = false,
  onRemove,
  className,
  onClick,
  ...props
}: TagBadgeProps) {
  // Generate consistent color based on string hash
  const hash = Array.from(tag).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hues = [200, 220, 260, 280, 320, 160, 140, 30];
  const hue = hues[hash % hues.length];

  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors border select-none",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:opacity-80",
        className
      )}
      style={
        !active
          ? {
              backgroundColor: `hsl(${hue} 80% 95% / 0.8)`,
              color: `hsl(${hue} 80% 25%)`,
              borderColor: `hsl(${hue} 60% 85%)`,
            }
          : undefined
      }
      {...props}
    >
      <span>#{tag}</span>
      {count !== undefined && (
        <span
          className={cn(
            "text-[10px] px-1 rounded-full font-bold",
            active ? "bg-primary-foreground/20" : "bg-black/5"
          )}
        >
          {count}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:text-destructive transition-colors ml-0.5 text-xs font-bold"
        >
          ×
        </button>
      )}
    </span>
  );
}
