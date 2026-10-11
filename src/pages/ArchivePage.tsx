import * as React from "react";
import { Archive, RotateCcw, FileText } from "lucide-react";
import { useNoteStore } from "@/stores/note-store";
import { Button } from "@/components/ui/button";
import { NoteDetail } from "@/components/NoteDetail";
import { cn } from "@/lib/utils";

export function ArchivePage() {
  const { notes, fetchNotes, archiveNote } = useNoteStore();
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const archivedNotes = React.useMemo(() => {
    return notes.filter((n) => n.meta.archived);
  }, [notes]);

  const activeNote = React.useMemo(() => {
    return (
      archivedNotes.find((n) => n.meta.id === selectedNoteId) ||
      archivedNotes[0] ||
      null
    );
  }, [archivedNotes, selectedNoteId]);

  return (
    <div className="flex w-full h-full">
      {/* Archived list */}
      <div className="w-80 h-full border-r border-border flex flex-col bg-card/20">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            已归档笔记 ({archivedNotes.length})
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {archivedNotes.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              暂无已归档的笔记
            </div>
          ) : (
            archivedNotes.map((note) => {
              const title =
                note.content.trim().split("\n")[0].replace(/^#+\s*/, "") ||
                "无标题笔记";
              return (
                <div
                  key={note.meta.id}
                  onClick={() => setSelectedNoteId(note.meta.id)}
                  className={cn(
                    "p-3 rounded-lg border text-card-foreground bg-card cursor-pointer transition-all hover:shadow-xs",
                    activeNote?.meta.id === note.meta.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-border/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold truncate flex-1">{title}</h4>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveNote(note.meta.id, false);
                      }}
                      title="取消归档"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 h-full overflow-hidden">
        {activeNote ? (
          <NoteDetail key={activeNote.meta.id} note={activeNote} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-xs">选择归档笔记查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
