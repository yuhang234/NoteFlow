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
          : "tag-badge hover:opacity-80",
        className
      )}
      // The hue is theme-independent; `tag-badge` picks light/dark/paper colours.
      style={!active ? ({ "--tag-hue": hue } as React.CSSProperties) : undefined}
      {...props}
    >
      <span>#{tag}</span>
      {count !== undefined && (
        <span
          className={cn(
            "text-[10px] px-1 rounded-full font-bold",
            active ? "bg-primary-foreground/20" : "bg-foreground/10"
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
