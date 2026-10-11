import * as React from "react";
import { Send, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNoteStore } from "@/stores/note-store";

export function QuickCapture() {
  const [text, setText] = React.useState("");
  const { createNote } = useNoteStore();

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    await createNote(text.trim());
    setText("");
  };

  return (
    <form
      onSubmit={handleCapture}
      className="flex items-center gap-1.5 p-2 bg-muted/40 rounded-lg border border-border focus-within:border-primary/50 transition-colors"
    >
      <Zap className="h-4 w-4 text-amber-500 shrink-0 ml-1" />
      <Input
        type="text"
        placeholder="闪念捕捉 (按回车即时保存)..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={!text.trim()}
      >
        <Send className="h-3 w-3" />
      </Button>
    </form>
  );
}
