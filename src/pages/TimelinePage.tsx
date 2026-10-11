import * as React from "react";
import { useNoteStore } from "@/stores/note-store";
import { NoteList } from "@/components/NoteList";
import { NoteDetail } from "@/components/NoteDetail";
import { FileEdit } from "lucide-react";

export function TimelinePage() {
  const { notes, currentNote, selectNote, fetchNotes, isLoading } = useNoteStore();

  React.useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Default to first note if none selected and notes exist
  React.useEffect(() => {
    if (!currentNote && notes.length > 0) {
      selectNote(notes[0]);
    }
  }, [notes, currentNote, selectNote]);

  const activeNotes = React.useMemo(() => {
    return notes.filter((n) => !n.meta.archived);
  }, [notes]);

  return (
    <div className="flex w-full h-full">
      {/* Middle list column */}
      <div className="w-80 h-full shrink-0">
        <NoteList
          notes={activeNotes}
          selectedNoteId={currentNote?.meta.id}
          onSelectNote={selectNote}
        />
      </div>

      {/* Right detail/editor column */}
      <div className="flex-1 h-full overflow-hidden bg-background">
        {currentNote ? (
          <NoteDetail key={currentNote.meta.id} note={currentNote} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <FileEdit className="h-12 w-12 stroke-1 opacity-40" />
            <p className="text-sm">选择或新建一篇笔记开始编辑</p>
          </div>
        )}
      </div>
    </div>
  );
}
