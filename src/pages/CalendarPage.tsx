import * as React from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNoteStore } from "@/stores/note-store";
import type { NoteFile } from "@/lib/tauri-api";
import { NoteDetail } from "@/components/NoteDetail";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { noteTitle } from "@/lib/markdown-text";

export function CalendarPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const { notes, fetchNotes } = useNoteStore();
  const weekStartDay = useUIStore((state) => state.weekStartDay);

  React.useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: weekStartDay });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: weekStartDay });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  // Timestamps are stored in UTC; bucket them by the *local* calendar day so the
  // grid and the day list always agree.
  const localDayKey = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd");
  };

  // Archived notes stay out of the calendar view.
  const activeNotes = React.useMemo(
    () => notes.filter((note) => !note.meta.archived),
    [notes]
  );

  // Filter notes for the selected date
  const selectedDateNotes = React.useMemo(() => {
    const key = format(selectedDate, "yyyy-MM-dd");
    return activeNotes.filter((note) => localDayKey(note.meta.created_at) === key);
  }, [activeNotes, selectedDate]);

  // Map notes count per day
  const notesCountByDate = React.useMemo(() => {
    const map = new Map<string, number>();
    activeNotes.forEach((note) => {
      const key = localDayKey(note.meta.created_at);
      if (key) map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [activeNotes]);

  const [selectedNote, setSelectedNote] = React.useState<NoteFile | null>(
    selectedDateNotes[0] || null
  );

  // Keep the current selection (and its fresh content) instead of jumping back
  // to the first note every time an autosave refreshes the note list.
  React.useEffect(() => {
    setSelectedNote((previous) => {
      if (previous) {
        const refreshed = selectedDateNotes.find(
          (note) => note.meta.id === previous.meta.id
        );
        if (refreshed) return refreshed;
      }
      return selectedDateNotes[0] || null;
    });
  }, [selectedDateNotes]);

  return (
    <div className="flex w-full h-full">
      {/* Calendar View Column */}
      <div className="w-[380px] h-full border-r border-border flex flex-col bg-card/30">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            {format(currentDate, "yyyy年 MMMM", { locale: zhCN })}
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCurrentDate(new Date());
                setSelectedDate(new Date());
              }}
              className="text-xs h-7 px-2"
            >
              今天
            </Button>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-7 w-7">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Days grid */}
        <div className="p-4 flex-1">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground mb-2">
            {(weekStartDay === 1
              ? ["一", "二", "三", "四", "五", "六", "日"]
              : ["日", "一", "二", "三", "四", "五", "六"]
            ).map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const count = notesCountByDate.get(dateStr) || 0;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "h-10 rounded-md flex flex-col items-center justify-center relative transition-colors",
                    !isCurrentMonth && "text-muted-foreground/40",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span className="text-xs">{format(day, "d")}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full mt-0.5",
                        isSelected ? "bg-primary-foreground" : "bg-primary"
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* List of notes for selected day */}
          <div className="mt-6 border-t pt-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">
              {format(selectedDate, "M月d日", { locale: zhCN })} 的笔记 ({selectedDateNotes.length})
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {selectedDateNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">该日期暂无笔记</p>
              ) : (
                selectedDateNotes.map((note) => {
                  const title = note.content.trim().split("\n")[0].replace(/^#+\s*/, "") || "无标题";
                  return (
                    <button
                      key={note.meta.id}
                      onClick={() => setSelectedNote(note)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-md text-xs truncate transition-colors",
                        selectedNote?.meta.id === note.meta.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      {title}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor/Detail column */}
      <div className="flex-1 h-full overflow-hidden">
        {selectedNote ? (
          <NoteDetail key={selectedNote.meta.id} note={selectedNote} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-xs">选择任意一天的笔记进行查看与编辑</p>
          </div>
        )}
      </div>
    </div>
  );
}
