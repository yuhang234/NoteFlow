import * as React from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { api } from "@/lib/tauri-api";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

// In-memory cache for loaded base64 attachment images
const attachmentImageCache = new Map<string, string>();

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
          .use(remarkBreaks)
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

  // Resolve local attachment images & render mermaid
  React.useEffect(() => {
    if (!containerRef.current) return;

    // 1. Render Mermaid diagrams
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

    // 2. Resolve local attachment images (attachments/...)
    const images = containerRef.current.querySelectorAll<HTMLImageElement>("img[src]");
    images.forEach(async (img) => {
      const src = img.getAttribute("src");
      if (src && (src.startsWith("attachments/") || src.startsWith("attachments\\") || !src.includes("://"))) {
        if (attachmentImageCache.has(src)) {
          img.src = attachmentImageCache.get(src)!;
        } else {
          try {
            const dataUrl = await api.readAttachmentBase64(src);
            attachmentImageCache.set(src, dataUrl);
            img.src = dataUrl;
          } catch (err) {
            console.warn(`Failed to load local attachment image ${src}:`, err);
          }
        }
      }
    });

    // 3. Intercept clicks on attachment links to open them via system viewer
    const links = containerRef.current.querySelectorAll<HTMLAnchorElement>("a[href]");
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.currentTarget as HTMLAnchorElement;
      const href = target.getAttribute("href");
      if (href && (href.startsWith("attachments/") || href.startsWith("attachments\\"))) {
        e.preventDefault();
        api.openAttachment(href).catch((err) => {
          console.error("Failed to open attachment:", err);
        });
      }
    };

    links.forEach((link) => {
      link.addEventListener("click", handleLinkClick);
    });

    return () => {
      links.forEach((link) => {
        link.removeEventListener("click", handleLinkClick);
      });
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "noteflow-markdown p-6 overflow-y-auto h-full",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
