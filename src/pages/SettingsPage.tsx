import * as React from "react";
import {
  Settings,
  Palette,
  Type,
  Database,
  RotateCcw,
  DownloadCloud,
  UploadCloud,
  HardDriveDownload,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore, Theme } from "@/stores/ui-store";
import { useNoteStore } from "@/stores/note-store";
import { useToast } from "@/components/ui/toast";
import { api, AppConfig, BackupInfo } from "@/lib/tauri-api";

export function SettingsPage() {
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    autoSaveInterval,
    setAutoSaveInterval,
    weekStartDay,
    setWeekStartDay,
  } = useUIStore();
  const fetchNotes = useNoteStore((state) => state.fetchNotes);
  const { toast } = useToast();
  const [isSwitchingVault, setIsSwitchingVault] = React.useState(false);
  const [config, setConfig] = React.useState<AppConfig | null>(null);
  const [dataDir, setDataDir] = React.useState("");
  const [backups, setBackups] = React.useState<BackupInfo[]>([]);
  const [isBackingUp, setIsBackingUp] = React.useState(false);
  const [importPath, setImportPath] = React.useState("");
  const [exportPath, setExportPath] = React.useState("");

  const loadBackups = React.useCallback(async () => {
    try {
      setBackups(await api.listBackups());
    } catch (err) {
      console.error("Failed to list backups:", err);
    }
  }, []);

  React.useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        setConfig(cfg);
        setDataDir(cfg.data_dir);
        setExportPath(`${cfg.data_dir}\noteflow-export.zip`);
        // The config file is the source of truth on a fresh install; only fall
        // back to it when the user has no local preferences yet.
        if (!localStorage.getItem("noteflow-font-size") && cfg.editor_font_size) {
          setFontSize(cfg.editor_font_size);
        }
        if (!localStorage.getItem("noteflow-week-start")) {
          setWeekStartDay(cfg.week_start_day === 0 ? 0 : 1);
        }
      })
      .catch(console.error);
    void loadBackups();
  }, [loadBackups, setFontSize, setWeekStartDay]);

  /** Mirror a UI preference into `.noteflow/config.json`. */
  const persistConfig = React.useCallback(
    async (patch: Partial<AppConfig>) => {
      const current = config;
      if (!current) return;
      const next = { ...current, ...patch };
      setConfig(next);
      try {
        await api.saveConfig(next);
      } catch (err) {
        console.error("Failed to save config:", err);
      }
    },
    [config]
  );

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

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const path = await api.createBackup();
      await loadBackups();
      toast({ title: "备份完成", description: path, type: "success" });
    } catch (err) {
      toast({ title: "备份失败", description: String(err), type: "destructive" });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async (backup: BackupInfo) => {
    if (
      !window.confirm(
        `从备份恢复会用备份内容覆盖当前笔记库中的同名文件，确定恢复 ${backup.filename} 吗？`
      )
    ) {
      return;
    }
    try {
      const report = await api.restoreBackup(backup.path);
      await fetchNotes();
      toast({
        title: "恢复完成",
        description: `${report.restored_notes} 篇笔记、${report.restored_attachments} 个附件`,
        type: "success",
      });
    } catch (err) {
      toast({ title: "恢复失败", description: String(err), type: "destructive" });
    }
  };

  const handleImport = async () => {
    const source = importPath.trim();
    if (!source) return;
    try {
      const report = await api.importMarkdownFolder(source);
      await fetchNotes();
      toast({
        title: `已导入 ${report.imported_count} 篇笔记`,
        description:
          report.skipped_count > 0
            ? `跳过 ${report.skipped_count} 个文件${report.errors.length ? `，${report.errors.length} 个错误` : ""}`
            : undefined,
        type: "success",
      });
    } catch (err) {
      toast({ title: "导入失败", description: String(err), type: "destructive" });
    }
  };

  const handleExportZip = async () => {
    const target = exportPath.trim();
    if (!target) return;
    try {
      const { notes } = useNoteStore.getState();
      await api.exportNotesZip(
        notes.map((note) => note.meta.id),
        target
      );
      toast({ title: "导出完成", description: target, type: "success" });
    } catch (err) {
      toast({ title: "导出失败", description: String(err), type: "destructive" });
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
                  onChange={(e) => {
                    const seconds = Number(e.target.value) || 2;
                    setAutoSaveInterval(seconds);
                    void persistConfig({ auto_save_interval: seconds });
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium">每周起始日</label>
                <p className="text-[11px] text-muted-foreground">影响日历视图的排版</p>
              </div>
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border text-xs">
                {[
                  { value: 1 as const, label: "周一" },
                  { value: 0 as const, label: "周日" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setWeekStartDay(option.value);
                      void persistConfig({ week_start_day: option.value });
                    }}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      weekStartDay === option.value
                        ? "bg-background text-foreground shadow-xs font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
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

        {/* Backups */}
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HardDriveDownload className="h-4 w-4 text-primary" /> 本地备份
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                备份以 zip 形式保存在数据仓库的 backups 目录，完全离线。
              </p>
              <Button
                size="sm"
                onClick={handleCreateBackup}
                disabled={isBackingUp}
                className="h-8 text-xs gap-1.5 whitespace-nowrap"
              >
                <HardDriveDownload className="h-3.5 w-3.5" />
                {isBackingUp ? "备份中..." : "立即备份"}
              </Button>
            </div>

            {backups.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">还没有备份。</p>
            ) : (
              <ul className="divide-y divide-border/60 border rounded-lg overflow-hidden">
                {backups.map((backup) => (
                  <li
                    key={backup.path}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-card"
                  >
                    <div className="min-w-0">
                      <p className="font-mono truncate">{backup.filename}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(backup.size / 1024 / 1024).toFixed(2)} MB · {backup.created_at}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreBackup(backup)}
                      className="h-7 text-[11px] whitespace-nowrap"
                    >
                      恢复
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Import & Export */}
        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DownloadCloud className="h-4 w-4 text-primary" /> 导入与导出
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div>
              <label className="text-xs font-medium">导入 Markdown 文件夹</label>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                粘贴一个文件夹的完整路径，其中的 .md 文件会被复制进笔记库
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="D:\Notes\import"
                  value={importPath}
                  onChange={(e) => setImportPath(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={!importPath.trim()}
                  className="h-8 text-xs gap-1.5 whitespace-nowrap"
                >
                  <UploadCloud className="h-3.5 w-3.5" /> 导入
                </Button>
              </div>
            </div>

            <div className="pt-2 border-t">
              <label className="text-xs font-medium">导出全部笔记为 zip</label>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                输出 zip 的完整路径，包含 Markdown 文件与附件
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportZip}
                  disabled={!exportPath.trim()}
                  className="h-8 text-xs gap-1.5 whitespace-nowrap"
                >
                  <DownloadCloud className="h-3.5 w-3.5" /> 导出
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
