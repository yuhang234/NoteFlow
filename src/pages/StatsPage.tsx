import * as React from "react";
import { BarChart3, FileText, Pin, Archive, CheckSquare, Code, Link, MapPin } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { api, NoteStats } from "@/lib/tauri-api";
import { useNoteStore } from "@/stores/note-store";
import { ActivityCalendar } from "@/components/ActivityCalendar";

export function StatsPage() {
  const [stats, setStats] = React.useState<NoteStats | null>(null);
  const { notes, fetchNotes } = useNoteStore();

  React.useEffect(() => {
    fetchNotes();
    api.getStats().then(setStats).catch(console.error);
  }, [fetchNotes]);

  const dates = React.useMemo(() => {
    return notes.map((n) => n.meta.created_at);
  }, [notes]);

  const statItems = [
    { label: "笔记总数", value: stats?.total ?? notes.length, icon: FileText, color: "text-blue-500" },
    { label: "已置顶笔记", value: stats?.pinned ?? notes.filter(n => n.meta.pinned).length, icon: Pin, color: "text-amber-500" },
    { label: "已归档笔记", value: stats?.archived ?? notes.filter(n => n.meta.archived).length, icon: Archive, color: "text-purple-500" },
    { label: "包含任务数", value: stats?.with_tasks ?? 0, icon: CheckSquare, color: "text-emerald-500" },
    { label: "包含代码块", value: stats?.with_code ?? 0, icon: Code, color: "text-indigo-500" },
    { label: "包含外链", value: stats?.with_links ?? 0, icon: Link, color: "text-pink-500" },
  ];

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            数据统计看板
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            实时分析知识库规模、写作习惯及活跃度分布。
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {statItems.map((item) => (
            <Card key={item.label}>
              <CardHeader className="p-4 flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">{item.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-3">知识库活跃热力图</h2>
          <ActivityCalendar dates={dates} daysCount={120} />
        </div>
      </div>
    </div>
  );
}
