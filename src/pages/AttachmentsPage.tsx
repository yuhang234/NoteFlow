import * as React from "react";
import {
  Paperclip,
  File,
  Image,
  FileArchive,
  ExternalLink,
  Trash2,
  FolderOpen,
  Copy,
  Search,
  RefreshCw,
  HardDrive,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, AttachmentInfo, AttachmentStats } from "@/lib/tauri-api";
import {
  forgetAttachment,
  getCachedAttachment,
  loadAttachmentImage,
} from "@/lib/attachment-cache";

/**
 * Thumbnail that only reads the attachment once it scrolls into view.
 * Loading every image up front meant one IPC round trip (with a full base64
 * payload) per attachment on page open.
 */
function AttachmentThumb({ path, filename }: { path: string; filename: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = React.useState<string | null>(
    () => getCachedAttachment(path) ?? null
  );

  React.useEffect(() => {
    if (dataUrl) return;
    let cancelled = false;

    const load = () => {
      loadAttachmentImage(path)
        .then((url) => {
          if (!cancelled) setDataUrl(url);
        })
        .catch(() => {
          /* Missing file: fall back to the icon placeholder. */
        });
    };

    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(element);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [path, dataUrl]);

  return (
    <div
      ref={ref}
      className="h-32 bg-muted/40 flex items-center justify-center overflow-hidden cursor-pointer relative"
      title="点击打开文件"
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={filename}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <Image className="h-10 w-10 text-blue-500/60" />
      )}
    </div>
  );
}

export function AttachmentsPage() {
  const [attachments, setAttachments] = React.useState<AttachmentInfo[]>([]);
  const [stats, setStats] = React.useState<AttachmentStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [category, setCategory] = React.useState<"all" | "image" | "doc" | "archive" | "other">("all");
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [list, stat] = await Promise.all([
        api.listAttachments(""),
        api.getAttachmentStats(),
      ]);
      setAttachments(list);
      setStats(stat);
    } catch (err) {
      console.error("Failed to load attachments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (item: AttachmentInfo) => {
    if (!window.confirm(`确定要彻底删除附件 "${item.filename}" 吗？`)) return;
    try {
      await api.deleteAttachment(item.note_id || "", item.filename);
      forgetAttachment(item.path);
      await loadData();
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  };

  const handleCopyMarkdown = (item: AttachmentInfo) => {
    const isImage = item.mime_type.startsWith("image/");
    const md = isImage ? `![${item.filename}](${item.path})` : `[📎 ${item.filename}](${item.path})`;
    navigator.clipboard.writeText(md);
    setCopiedPath(item.path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filtered = attachments.filter((item) => {
    const matchesSearch = item.filename.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (category === "image") return item.mime_type.startsWith("image/");
    if (category === "doc") return item.mime_type.includes("pdf") || item.mime_type.includes("text") || item.mime_type.includes("json");
    if (category === "archive") return item.mime_type.includes("zip") || item.mime_type.includes("tar") || item.mime_type.includes("octet");
    return true;
  });

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-primary" />
              附件媒体库
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              集中查看与管理本地笔记库中引用的所有图片、文件与多媒体资源。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => api.openAttachmentFolder()}
              className="gap-1.5 text-xs h-8"
              title="在 Windows 资源管理器中打开附件文件夹"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              打开附件总目录
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={loadData}
              disabled={loading}
              className="h-8 w-8"
              title="刷新列表"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>附件总数</span>
                <HardDrive className="h-4 w-4 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold">{stats?.total_count ?? attachments.length} 个</div>
              <p className="text-[11px] text-muted-foreground mt-1">本地安全存储，随时调用</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>占用总空间</span>
                <FileArchive className="h-4 w-4 text-emerald-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold">{formatSize(stats?.total_size_bytes ?? 0)}</div>
              <p className="text-[11px] text-muted-foreground mt-1">完全离线，无云端泄露风险</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>快速上传提示</span>
                <Image className="h-4 w-4 text-blue-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              在任意笔记编辑界面直接按下 <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Ctrl+V</kbd> 即可直接粘贴截图。
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索附件文件名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-xs bg-card"
            />
          </div>

          <div className="flex items-center gap-1 w-full sm:w-auto bg-muted/60 p-0.5 rounded-lg border text-xs">
            <button
              onClick={() => setCategory("all")}
              className={`px-3 py-1 rounded-md transition-colors ${
                category === "all" ? "bg-background text-foreground shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              全部 ({attachments.length})
            </button>
            <button
              onClick={() => setCategory("image")}
              className={`px-3 py-1 rounded-md transition-colors ${
                category === "image" ? "bg-background text-foreground shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              图片
            </button>
            <button
              onClick={() => setCategory("doc")}
              className={`px-3 py-1 rounded-md transition-colors ${
                category === "doc" ? "bg-background text-foreground shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              文档
            </button>
            <button
              onClick={() => setCategory("archive")}
              className={`px-3 py-1 rounded-md transition-colors ${
                category === "archive" ? "bg-background text-foreground shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              压缩包及其他
            </button>
          </div>
        </div>

        {/* Gallery Grid */}
        {filtered.length === 0 ? (
          <div className="border border-dashed rounded-xl p-12 text-center bg-card/30">
            <Paperclip className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-sm font-semibold">暂无匹配的附件</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              在笔记编辑过程中拖拽文件或粘贴截图，附件信息会自动索引并呈现于此。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((item) => {
              const isImage = item.mime_type.startsWith("image/");

              return (
                <div
                  key={item.path}
                  className="group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-all"
                >
                  {/* Thumbnail / Icon area */}
                  <div
                    onClick={() => api.openAttachment(item.path)}
                    className="relative"
                  >
                    {isImage ? (
                      <AttachmentThumb path={item.path} filename={item.filename} />
                    ) : (
                      <div className="h-32 bg-muted/40 flex items-center justify-center overflow-hidden">
                        {item.mime_type.includes("pdf") || item.mime_type.includes("text") ? (
                          <File className="h-10 w-10 text-amber-500/60" />
                        ) : (
                          <FileArchive className="h-10 w-10 text-emerald-500/60" />
                        )}
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 rounded-full shadow"
                        onClick={(e) => {
                          e.stopPropagation();
                          api.openAttachment(item.path);
                        }}
                        title="打开文件"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 rounded-full shadow"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyMarkdown(item);
                        }}
                        title="复制 Markdown 引用"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Metadata and Footer */}
                  <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                    <div>
                      <h4
                        className="text-xs font-semibold truncate leading-tight"
                        title={item.filename}
                      >
                        {item.filename}
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatSize(item.size)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
                      <button
                        onClick={() => handleCopyMarkdown(item)}
                        className="text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        {copiedPath === item.path ? "已复制!" : "复制语法"}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => api.openAttachmentFolder(item.note_id || undefined)}
                          title="在文件夹中显示"
                          className="text-muted-foreground hover:text-foreground p-1 rounded"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          title="删除附件"
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
