import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileEdit, PanelLeftOpen } from "lucide-react";
import { useNoteStore } from "@/stores/note-store";
import { useUIStore } from "@/stores/ui-store";
import { NoteList } from "@/components/NoteList";
import { NoteDetail } from "@/components/NoteDetail";
import { NoteFile } from "@/lib/tauri-api";

export function TimelinePage() {
  const { notes, currentNote, selectNote, fetchNotes, getNoteById, isLoading } =
    useNoteStore();
  const { noteListOpen, toggleNoteList, focusMode } = useUIStore();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  React.useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // The URL is the source of truth: `/note/:id` must open that note, also when
  // the app is opened from a deep link or via back/forward navigation.
  React.useEffect(() => {
    if (!id || currentNote?.meta.id === id) return;
    const fromList = notes.find((note) => note.meta.id === id);
    if (fromList) selectNote(fromList);
    else void getNoteById(id);
  }, [id, notes, currentNote, selectNote, getNoteById]);

  // With no note in the URL, fall back to the first visible note.
  React.useEffect(() => {
    if (id || currentNote || notes.length === 0) return;
    const first = notes.find((note) => !note.meta.archived);
    if (first) navigate(`/note/${first.meta.id}`, { replace: true });
  }, [id, currentNote, notes, navigate]);

  const activeNotes = React.useMemo(() => {
    return notes.filter((n) => !n.meta.archived);
  }, [notes]);

  const handleSelectNote = (note: NoteFile) => {
    selectNote(note);
    navigate(`/note/${note.meta.id}`);
  };

  return (
    <div className="flex w-full h-full">
      {/* Middle list column */}
      {noteListOpen && !focusMode && (
        <div className="w-72 h-full shrink-0">
          <NoteList
            notes={activeNotes}
            selectedNoteId={currentNote?.meta.id}
            onSelectNote={handleSelectNote}
          />
        </div>
      )}

      {/* Right detail/editor column */}
      <div className="relative flex-1 min-w-0 h-full overflow-hidden bg-background">
        {!noteListOpen && !focusMode && (
          <button
            onClick={toggleNoteList}
            title="展开笔记列表"
            className="absolute left-2 top-2 z-20 h-7 w-7 rounded-md flex items-center justify-center bg-card border border-border text-muted-foreground hover:text-foreground shadow-xs"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
        )}
        {currentNote ? (
          <NoteDetail key={currentNote.meta.id} note={currentNote} />
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm">正在加载笔记...</p>
          </div>
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
