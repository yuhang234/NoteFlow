import * as React from "react";
import { Settings, Palette, Type, Database, Save, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore, Theme } from "@/stores/ui-store";
import { useNoteStore } from "@/stores/note-store";
import { useToast } from "@/components/ui/toast";
import { api, AppConfig } from "@/lib/tauri-api";

export function SettingsPage() {
  const { theme, setTheme, fontSize, setFontSize, autoSaveInterval, setAutoSaveInterval } =
    useUIStore();
  const fetchNotes = useNoteStore((state) => state.fetchNotes);
  const { toast } = useToast();
  const [isSwitchingVault, setIsSwitchingVault] = React.useState(false);
  const [config, setConfig] = React.useState<AppConfig | null>(null);
  const [dataDir, setDataDir] = React.useState("");

  React.useEffect(() => {
    api.getConfig().then((cfg) => {
      setConfig(cfg);
      setDataDir(cfg.data_dir);
    }).catch(console.error);
  }, []);

  const handleSaveDataDir = async () => {
    const next = dataDir.trim();
    if (!next) return;
    setIsSwitchingVault(true);
    try {
      // `set_data_dir` re-opens the SQLite index, rebuilds it and moves the
      // file watcher; `save_config` alone would only write the config file.
      await api.setDataDir(next);
      setConfig((prev) => (prev ? { ...prev, data_dir: next } : prev));
      await fetchNotes();
      toast({ title: "数据目录已切换", description: next, type: "success" });
    } catch (err) {
      toast({ title: "切换数据目录失败", description: String(err), type: "destructive" });
    } finally {
      setIsSwitchingVault(false);
    }
  };

  const handleRebuildIndex = async () => {
    try {
      const count = await api.rebuildIndex();
      toast({ title: `索引重建完成，共 ${count} 篇笔记`, type: "success" });
    } catch (e) {
      toast({ title: "重建索引失败", description: String(e), type: "destructive" });
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            偏好设置
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            配置外观主题、编辑器行为及本地数据存储。
          </p>
        </div>

        {/* Theme Settings */}
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" /> 外观主题
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "light", label: "浅色明亮" },
                { id: "dark", label: "暗色极夜" },
                { id: "paper", label: "护眼纸质" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as Theme)}
                  className={`border rounded-lg p-3 text-center text-xs font-medium transition-all ${
                    theme === t.id
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Editor Settings */}
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" /> 编辑器配置
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium">默认字体字号 (px)</label>
                <p className="text-[11px] text-muted-foreground">控制 CodeMirror 6 代码及文字大小</p>
              </div>
              <div className="flex items-center gap-2 w-32">
                <Input
                  type="number"
                  min={12}
                  max={28}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value) || 15)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium">自动保存延迟 (秒)</label>
                <p className="text-[11px] text-muted-foreground">
                  停止输入后多久写入磁盘，Ctrl/⌘+S 可立即保存
                </p>
              </div>
              <div className="flex items-center gap-2 w-32">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={autoSaveInterval}
                  onChange={(e) => setAutoSaveInterval(Number(e.target.value) || 2)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data & Storage */}
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> 存储与索引
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div>
              <label className="text-xs font-medium">本地数据仓库路径</label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  type="text"
                  value={dataDir}
                  onChange={(e) => setDataDir(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="sm"
                  onClick={handleSaveDataDir}
                  disabled={isSwitchingVault}
                  className="h-8 text-xs whitespace-nowrap"
                >
                  {isSwitchingVault ? "切换中..." : "切换并重建"}
                </Button>
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between">
              <div>
                <span className="text-xs font-medium">全文检索索引</span>
                <p className="text-[11px] text-muted-foreground">
                  搜索不准或笔记显示异常时，可重建 SQLite FTS5 全文索引
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRebuildIndex} className="text-xs gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> 重建索引
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
