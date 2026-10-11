import * as React from "react";
import { TagBadge } from "@/components/TagBadge";
import { Input } from "@/components/ui/input";
import { useTagStore } from "@/stores/tag-store";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagInput({ tags, onChange, placeholder = "添加标签 (按回车)..." }: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const { tags: allTags, fetchTags } = useTagStore();

  React.useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = inputValue.trim().replace(/^#/, "");
      if (val && !tags.includes(val)) {
        onChange([...tags, val]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      {tags.map((tag) => (
        <TagBadge key={tag} tag={tag} onRemove={() => removeTag(tag)} />
      ))}
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="border-0 p-0 h-6 text-sm shadow-none focus-visible:ring-0 flex-1 min-w-[120px]"
      />
    </div>
  );
}
