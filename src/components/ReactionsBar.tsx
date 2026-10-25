import * as React from "react";
import { SmilePlus } from "lucide-react";
import { api, NoteFile } from "@/lib/tauri-api";
import { useNoteStore } from "@/stores/note-store";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "🤔", "🚀"];

interface ReactionsBarProps {
  note: NoteFile;
}

/** Emoji reactions persisted in the note's front matter. */
export function ReactionsBar({ note }: ReactionsBarProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const selectNote = useNoteStore((state) => state.selectNote);
  const reactions = note.meta.reactions ?? [];

  const mutate = async (emoji: string, remove = false) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const updated = remove
        ? await api.removeReaction(note.meta.id, emoji)
        : await api.addReaction(note.meta.id, emoji);
      selectNote(updated);
    } catch (err) {
      console.error("Failed to update reaction:", err);
    } finally {
      setIsBusy(false);
      setPickerOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => mutate(reaction.emoji, true)}
          title="点击减少一个"
          className="h-6 px-1.5 rounded-full border border-border bg-muted/40 text-[11px] flex items-center gap-1 hover:border-primary/50"
        >
          <span>{reaction.emoji}</span>
          <span className="text-muted-foreground tabular-nums">{reaction.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          onClick={() => setPickerOpen((open) => !open)}
          title="添加表情"
          className={cn(
            "h-6 w-6 rounded-full border border-dashed border-border text-muted-foreground flex items-center justify-center hover:text-foreground",
            pickerOpen && "text-foreground border-primary/60"
          )}
        >
          <SmilePlus className="h-3 w-3" />
        </button>
        {pickerOpen && (
          <div className="absolute z-30 top-7 left-0 flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-md">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => mutate(emoji)}
                className="h-7 w-7 rounded-md text-sm hover:bg-muted flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
