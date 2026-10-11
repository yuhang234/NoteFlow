import * as React from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = "" }: MarkdownPreviewProps) {
  const [html, setHtml] = React.useState<string>("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    async function processMarkdown() {
      try {
        const processor = unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkMath)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeKatex)
          .use(rehypeStringify);

        const file = await processor.process(content);
        if (isMounted) {
          setHtml(String(file));
        }
      } catch (err) {
        console.error("Markdown compilation error:", err);
        if (isMounted) {
          setHtml(`<div class="text-destructive">解析 Markdown 出错: ${String(err)}</div>`);
        }
      }
    }

    processMarkdown();

    return () => {
      isMounted = false;
    };
  }, [content]);

  // Re-run mermaid after html renders
  React.useEffect(() => {
    if (containerRef.current) {
      const codeBlocks = containerRef.current.querySelectorAll("pre code.language-mermaid");
      codeBlocks.forEach(async (block, index) => {
        try {
          const graphDefinition = block.textContent || "";
          const id = `mermaid-${Date.now()}-${index}`;
          const { svg } = await mermaid.render(id, graphDefinition);
          const parent = block.parentElement;
          if (parent) {
            const div = document.createElement("div");
            div.className = "mermaid-diagram flex justify-center my-4";
            div.innerHTML = svg;
            parent.replaceWith(div);
          }
        } catch (e) {
          console.error("Mermaid rendering error:", e);
        }
      });
    }
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "prose prose-slate dark:prose-invert max-w-none p-6 overflow-y-auto h-full",
        "[&_pre]:bg-muted [&_pre]:text-foreground [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-sm",
        "[&_table]:border-collapse [&_th]:border [&_th]:p-2 [&_td]:border [&_td]:p-2",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
