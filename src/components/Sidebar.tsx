import * as React from "react";
import { NavLink } from "react-router-dom";
import {
  Clock,
  Calendar,
  Search,
  Tag,
  Paperclip,
  BarChart3,
  Settings,
  Trash2,
  Map,
  Archive,
  Plus,
  Folder,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, Theme } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useNoteStore } from "@/stores/note-store";
import { Button } from "@/components/ui/button";
import { QuickCapture } from "@/components/QuickCapture";

interface SidebarProps {
  onCreateNote: () => void;
}

export function Sidebar({ onCreateNote }: SidebarProps) {
  const { theme, setTheme } = useUIStore();
  const { workspaces, activeWorkspaceId, setActiveWorkspace, fetchWorkspaces } =
    useWorkspaceStore();
  const { setWorkspaceFilter } = useNoteStore();

  React.useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const navItems = [
    { label: "时间线", path: "/", icon: Clock },
    { label: "日历视图", path: "/calendar", icon: Calendar },
    { label: "全局搜索", path: "/search", icon: Search },
    { label: "标签分类", path: "/tags", icon: Tag },
    { label: "附件库", path: "/attachments", icon: Paperclip },
    { label: "地图空间", path: "/map", icon: Map },
    { label: "统计看板", path: "/stats", icon: BarChart3 },
    { label: "归档记录", path: "/archive", icon: Archive },
    { label: "废纸篓", path: "/trash", icon: Trash2 },
  ];

  const handleSelectWorkspace = (wsId: string | null) => {
    setActiveWorkspace(wsId);
    setWorkspaceFilter(wsId);
  };

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("paper");
    else setTheme("light");
  };

  return (
    <aside className="w-64 h-full flex flex-col bg-card border-r border-border select-none">
      {/* App Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow-xs">
            N
          </div>
          <span className="font-bold text-base tracking-tight text-foreground">
            NoteFlow
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          title={`当前主题: ${theme} (点击切换)`}
          className="h-8 w-8"
        >
          {theme === "light" && <Sun className="h-4 w-4 text-amber-500" />}
          {theme === "dark" && <Moon className="h-4 w-4 text-blue-400" />}
          {theme === "paper" && <BookOpen className="h-4 w-4 text-amber-700" />}
        </Button>
      </div>

      {/* Quick capture input */}
      <div className="p-3 border-b border-border/50">
        <QuickCapture />
      </div>

      {/* Main Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        <div className="space-y-0.5">
          <Button
            onClick={onCreateNote}
            className="w-full justify-start gap-2 mb-2 font-medium shadow-xs"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            新建笔记
          </Button>

          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Workspaces Section */}
        <div>
          <div className="flex items-center justify-between px-3 py-1 mb-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              工作空间
            </span>
          </div>

          <div className="space-y-0.5">
            <button
              onClick={() => handleSelectWorkspace(null)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors text-left",
                activeWorkspaceId === null
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span>全部笔记</span>
            </button>

            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors text-left",
                  activeWorkspaceId === ws.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span>{ws.icon || "📁"}</span>
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Nav */}
      <div className="p-2 border-t border-border">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>应用设置</span>
        </NavLink>
      </div>
    </aside>
  );
}
