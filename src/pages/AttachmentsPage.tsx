import * as React from "react";
import { Paperclip, File, Image, FileArchive, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AttachmentsPage() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-primary" />
            附件媒体库
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            统一查看与管理笔记中引用的所有图片、文件和多媒体资源。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Image className="h-4 w-4 text-blue-500" /> 图片资源
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              支持一键粘贴截图与拖拽上传，已自动同步到本地数据目录。
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <File className="h-4 w-4 text-amber-500" /> 文档文件
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              PDF、Markdown、代码文件统一管理与外部程序调用支持。
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-emerald-500" /> 压缩包及其他
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              所有文件均安全存储在用户自选数据目录中，无云端泄露风险。
            </CardContent>
          </Card>
        </div>

        <div className="border rounded-lg p-12 text-center bg-card/40">
          <Paperclip className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-sm font-semibold">暂无孤立附件</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            在笔记编辑过程中拖拽或粘贴文件，相关的附件信息会自动索引并呈现于此。
          </p>
        </div>
      </div>
    </div>
  );
}
