import * as React from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { api } from "@/lib/tauri-api";
import { markdownSanitizeSchema } from "@/lib/sanitize-schema";
import { useUIStore } from "@/stores/ui-store";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

// In-memory cache for loaded base64 attachment images. Base64 payloads are
// large, so keep it bounded instead of growing for the whole session.
const attachmentImageCache = new Map<string, string>();
const ATTACHMENT_CACHE_LIMIT = 40;

function cacheAttachmentImage(src: string, dataUrl: string) {
  if (attachmentImageCache.size >= ATTACHMENT_CACHE_LIMIT) {
    const oldest = attachmentImageCache.keys().next().value;
    if (oldest !== undefined) attachmentImageCache.delete(oldest);
  }
  attachmentImageCache.set(src, dataUrl);
}

export function MarkdownPreview({ content, className = "" }: MarkdownPreviewProps) {
  const [html, setHtml] = React.useState<string>("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const isDark = useUIStore((state) => state.theme) === "dark";

  // Debounce so a fast typist does not re-run the whole unified pipeline on
  // every keystroke; the preview stays one frame behind at most.
  const [renderContent, setRenderContent] = React.useState(content);
  React.useEffect(() => {
    const timer = setTimeout(() => setRenderContent(content), 120);
    return () => clearTimeout(timer);
  }, [content]);

  React.useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      // Notes may come from untrusted files: never allow scripts/links in diagrams.
      securityLevel: "strict",
    });
  }, [isDark]);

  // Re-render already drawn diagrams when the app theme changes.
  React.useEffect(() => {
    const nodes = containerRef.current?.querySelectorAll<HTMLElement>(
      ".mermaid-diagram[data-mermaid-source]"
    );
    if (!nodes || nodes.length === 0) return;
    nodes.forEach(async (node, index) => {
      const source = node.dataset.mermaidSource;
      if (!source) return;
      try {
        const { svg } = await mermaid.render(
          `mermaid-theme-${Date.now()}-${index}`,
          source
        );
        node.innerHTML = svg;
      } catch (err) {
        console.error("Mermaid theme re-render failed:", err);
      }
    });
  }, [isDark]);

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
          // Sanitize user HTML before KaTeX turns TeX source into trusted markup.
          .use(rehypeSanitize, markdownSanitizeSchema)
          .use(rehypeKatex)
          .use(rehypeStringify);

        const file = await processor.process(renderContent);
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
  }, [renderContent]);

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
          div.dataset.mermaidSource = graphDefinition;
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
      // Only vault-relative paths (e.g. `attachments/<id>/a.png`) need resolving.
      // Anything with a scheme (`data:`, `blob:`, `https:`) or protocol-relative
      // (`//host/x.png`) is already renderable by the webview.
      const isVaultRelative =
        !!src && !src.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(src);
      if (src && isVaultRelative) {
        if (attachmentImageCache.has(src)) {
          img.src = attachmentImageCache.get(src)!;
        } else {
          try {
            const dataUrl = await api.readAttachmentBase64(src);
            cacheAttachmentImage(src, dataUrl);
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
