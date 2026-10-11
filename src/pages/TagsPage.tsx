import * as React from "react";
import { Tag, Hash, FileText } from "lucide-react";
import { useTagStore } from "@/stores/tag-store";
import { useNoteStore } from "@/stores/note-store";
import { TagBadge } from "@/components/TagBadge";
import { NoteCard } from "@/components/NoteCard";
import { NoteDetail } from "@/components/NoteDetail";
import { cn } from "@/lib/utils";

export function TagsPage() {
  const { tags, selectedTag, selectTag, fetchTags } = useTagStore();
  const { notes, fetchNotes } = useNoteStore();
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchTags();
    fetchNotes();
  }, [fetchTags, fetchNotes]);

  // Notes filtered by tag
  const filteredNotes = React.useMemo(() => {
    if (!selectedTag) return [];
    return notes.filter((n) => n.content.includes(`#${selectedTag}`));
  }, [notes, selectedTag]);

  const activeNote = React.useMemo(() => {
    return (
      filteredNotes.find((n) => n.meta.id === selectedNoteId) ||
      filteredNotes[0] ||
      null
    );
  }, [filteredNotes, selectedNoteId]);

  return (
    <div className="flex w-full h-full">
      {/* Tags List */}
      <div className="w-64 h-full border-r border-border flex flex-col bg-card/20">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            所有标签 ({tags.length})
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tags.map(([tagName, count]) => (
            <button
              key={tagName}
              onClick={() => {
                selectTag(tagName);
                setSelectedNoteId(null);
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors",
                selectedTag === tagName
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{tagName}</span>
              </div>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                  selectedTag === tagName
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtered Notes List */}
      <div className="w-80 h-full border-r border-border flex flex-col bg-muted/10">
        <div className="p-3 border-b border-border text-xs font-semibold text-muted-foreground">
          {selectedTag ? `#${selectedTag} 的笔记 (${filteredNotes.length})` : "请选择标签"}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredNotes.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              {selectedTag ? "该标签下暂无笔记" : "从左侧选择标签"}
            </div>
          ) : (
            filteredNotes.map((note) => (
              <NoteCard
                key={note.meta.id}
                note={note}
                isSelected={note.meta.id === activeNote?.meta.id}
                onClick={() => setSelectedNoteId(note.meta.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 h-full overflow-hidden">
        {activeNote ? (
          <NoteDetail key={activeNote.meta.id} note={activeNote} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-xs">选择笔记查看与编辑</p>
          </div>
        )}
      </div>
    </div>
  );
}
