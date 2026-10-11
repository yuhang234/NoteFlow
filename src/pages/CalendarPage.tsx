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
import { NoteDetail } from "@/components/NoteDetail";
import { cn } from "@/lib/utils";

export function CalendarPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const { notes, fetchNotes } = useNoteStore();

  React.useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  // Filter notes for the selected date
  const selectedDateNotes = React.useMemo(() => {
    return notes.filter((note) => {
      try {
        const noteDate = new Date(note.meta.created_at);
        return isSameDay(noteDate, selectedDate);
      } catch {
        return false;
      }
    });
  }, [notes, selectedDate]);

  // Map notes count per day
  const notesCountByDate = React.useMemo(() => {
    const map = new Map<string, number>();
    notes.forEach((note) => {
      const d = note.meta.created_at.split("T")[0];
      map.set(d, (map.get(d) || 0) + 1);
    });
    return map;
  }, [notes]);

  const [selectedNote, setSelectedNote] = React.useState(selectedDateNotes[0] || null);

  React.useEffect(() => {
    setSelectedNote(selectedDateNotes[0] || null);
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
            <div>一</div>
            <div>二</div>
            <div>三</div>
            <div>四</div>
            <div>五</div>
            <div>六</div>
            <div>日</div>
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
