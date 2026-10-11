import * as React from "react";
import { format, subDays, eachDayOfInterval, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityCalendarProps {
  dates?: string[];
  daysCount?: number;
  onSelectDate?: (date: string) => void;
}

export function ActivityCalendar({
  dates = [],
  daysCount = 90,
  onSelectDate,
}: ActivityCalendarProps) {
  const today = React.useMemo(() => new Date(), []);
  const startDate = React.useMemo(() => subDays(today, daysCount), [today, daysCount]);

  const allDays = React.useMemo(() => {
    return eachDayOfInterval({ start: startDate, end: today });
  }, [startDate, today]);

  // Count frequencies
  const dateCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    dates.forEach((d) => {
      const key = d.split("T")[0];
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [dates]);

  return (
    <div className="flex flex-col gap-2 p-3 bg-card border rounded-lg">
      <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
        <span>近 {daysCount} 天动态</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px]">少</span>
          <div className="w-2.5 h-2.5 rounded-xs bg-muted" />
          <div className="w-2.5 h-2.5 rounded-xs bg-primary/30" />
          <div className="w-2.5 h-2.5 rounded-xs bg-primary/60" />
          <div className="w-2.5 h-2.5 rounded-xs bg-primary" />
          <span className="text-[10px]">多</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {allDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const count = dateCounts.get(dateStr) || 0;

          let bg = "bg-muted";
          if (count === 1) bg = "bg-primary/30";
          else if (count >= 2 && count <= 4) bg = "bg-primary/60";
          else if (count > 4) bg = "bg-primary";

          return (
            <div
              key={dateStr}
              title={`${dateStr}: ${count} 条笔记`}
              onClick={() => onSelectDate?.(dateStr)}
              className={cn(
                "w-3 h-3 rounded-xs cursor-pointer transition-all hover:scale-125 hover:ring-1 hover:ring-primary",
                bg
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
