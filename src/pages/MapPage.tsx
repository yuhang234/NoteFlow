import * as React from "react";
import { Map, MapPin } from "lucide-react";
import { useNoteStore } from "@/stores/note-store";
import { NoteDetail } from "@/components/NoteDetail";

export function MapPage() {
  const { notes, fetchNotes } = useNoteStore();
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const geoNotes = React.useMemo(() => {
    return notes.filter((n) => n.meta.location !== null);
  }, [notes]);

  const activeNote = React.useMemo(() => {
    return geoNotes.find((n) => n.meta.id === selectedNoteId) || geoNotes[0] || null;
  }, [geoNotes, selectedNoteId]);

  return (
    <div className="flex w-full h-full">
      {/* Map visualization panel */}
      <div className="w-[450px] h-full border-r border-border flex flex-col bg-card/20">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-sm">空间与足迹</h2>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            共 {geoNotes.length} 处足迹
          </span>
        </div>

        {/* Coordinate Grid / Map Container */}
        <div className="flex-1 p-4 flex flex-col justify-between relative overflow-hidden bg-dot-grid">
          <div className="relative w-full h-72 border rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center border-dashed">
            {/* Grid pattern overlay */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />

            {geoNotes.length === 0 ? (
              <div className="text-center p-6 space-y-2 z-10">
                <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">
                  当前尚无附带 GPS 坐标位置的笔记。
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  在笔记属性中记录地理位置后，将在此处以空间足迹呈现。
                </p>
              </div>
            ) : (
              <div className="absolute inset-0 p-4">
                {geoNotes.map((note) => (
                  <button
                    key={note.meta.id}
                    onClick={() => setSelectedNoteId(note.meta.id)}
                    className="absolute flex items-center gap-1 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full shadow-md hover:scale-110 transition-transform"
                    style={{
                      left: `${((note.meta.location?.longitude || 0) % 80) + 10}%`,
                      top: `${((note.meta.location?.latitude || 0) % 80) + 10}%`,
                    }}
                  >
                    <MapPin className="h-3 w-3" />
                    <span>{note.meta.location?.name || "位置"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex-1">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">已标记地点笔记</h3>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {geoNotes.map((note) => (
                <div
                  key={note.meta.id}
                  onClick={() => setSelectedNoteId(note.meta.id)}
                  className="p-2.5 rounded-lg border bg-card cursor-pointer hover:border-primary/60 transition-colors flex items-center justify-between"
                >
                  <div className="truncate pr-2">
                    <h4 className="text-xs font-medium truncate">
                      {note.content.trim().split("\n")[0].replace(/^#+\s*/, "") || "无标题"}
                    </h4>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {note.meta.location?.name} ({note.meta.location?.latitude.toFixed(2)}, {note.meta.location?.longitude.toFixed(2)})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Note view panel */}
      <div className="flex-1 h-full overflow-hidden">
        {activeNote ? (
          <NoteDetail key={activeNote.meta.id} note={activeNote} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MapPin className="h-10 w-10 opacity-30" />
            <p className="text-xs">选择笔记查看空间位置与详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
