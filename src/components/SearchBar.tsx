import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSearchStore } from "@/stores/search-store";
import { useNavigate } from "react-router-dom";

export function SearchBar() {
  const { query, setQuery, search, clearSearch } = useSearchStore();
  const navigate = useNavigate();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      search(query);
      navigate("/search");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (!val) {
      clearSearch();
    }
  };

  return (
    <div className="relative w-full">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder="搜索笔记、标签、关键词 (按回车)..."
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="pl-9 pr-8 h-9 text-sm bg-muted/40 hover:bg-muted/60 focus:bg-background transition-colors"
      />
      {query && (
        <button
          onClick={() => {
            clearSearch();
          }}
          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
