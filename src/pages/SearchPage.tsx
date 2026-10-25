import * as React from "react";
import { Search, FileText, Calendar, Tag as TagIcon } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { useSearchStore } from "@/stores/search-store";
import { NoteDetail } from "@/components/NoteDetail";
import { TagBadge } from "@/components/TagBadge";
import { api, type NoteFile } from "@/lib/tauri-api";
import { cn } from "@/lib/utils";

/**
 * Snippets come back with `<mark>` markers from the backend. Render them as
 * real elements instead of HTML so note content can never inject markup.
 */
function HighlightedSnippet({ snippet }: { snippet: string }) {
  const parts = React.useMemo(() => snippet.split(/(<mark>|<\/mark>)/g), [snippet]);
  let highlighted = false;
  return (
    <>
      {parts.map((part, index) => {
        if (part === "<mark>") {
          highlighted = true;
          return null;
        }
        if (part === "</mark>") {
          highlighted = false;
          return null;
        }
        if (!part) return null;
        return highlighted ? (
          <mark key={index} className="bg-primary/20 text-foreground rounded-xs px-0.5">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

export function SearchPage() {
  const { query, results, isLoading } = useSearchStore();

  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);
  const [matchedNote, setMatchedNote] = React.useState<NoteFile | null>(null);

  // Search results only carry ids, so load the note directly instead of relying
  // on the (possibly unfiltered) list in the note store.
  React.useEffect(() => {
    if (!selectedNoteId) {
      setMatchedNote(null);
      return;
    }
    let cancelled = false;
    api
      .getNote(selectedNoteId)
      .then((note) => {
        if (!cancelled) setMatchedNote(note);
      })
      .catch(() => {
        if (!cancelled) setMatchedNote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedNoteId]);

  return (
    <div className="flex w-full h-full">
      {/* Search sidebar */}
      <div className="w-88 h-full border-r border-border flex flex-col bg-card/20">
        <div className="p-3 border-b border-border">
          <SearchBar />
        </div>

        <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground flex items-center justify-between">
          <span>搜索结果</span>
          <span>共 {results.length} 条</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">正在检索知识库...</div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Search className="h-8 w-8 opacity-30" />
              <p className="text-xs">
                {query ? "未找到匹配的内容" : "输入关键词后按回车搜索"}
              </p>
            </div>
          ) : (
            results.map((item) => (
              <div
                key={item.note_id}
                onClick={() => setSelectedNoteId(item.note_id)}
                className={cn(
                  "p-3 rounded-lg border text-card-foreground bg-card cursor-pointer transition-all hover:shadow-xs space-y-1.5",
                  selectedNoteId === item.note_id
                    ? "border-primary bg-primary/5"
                    : "hover:border-border/80"
                )}
              >
                <h4 className="text-xs font-semibold truncate text-foreground">{item.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  <HighlightedSnippet snippet={item.snippet} />
                </p>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.tags.map((t) => (
                      <TagBadge key={t} tag={t} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 h-full overflow-hidden">
        {matchedNote ? (
          <NoteDetail key={matchedNote.meta.id} note={matchedNote} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-xs">在左侧选择搜索结果预览详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
