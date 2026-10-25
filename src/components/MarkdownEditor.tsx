import * as React from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { useUIStore } from "@/stores/ui-store";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  className = "",
  placeholder = "输入 Markdown 内容...",
}: MarkdownEditorProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const fontSizeCompartment = React.useRef(new Compartment());
  const onChangeRef = React.useRef(onChange);
  const { fontSize } = useUIStore();

  onChangeRef.current = onChange;

  const fontSizeTheme = React.useCallback(
    (size: number) =>
      EditorView.theme({
        "&": { fontSize: `${size}px` },
      }),
    []
  );

  React.useEffect(() => {
    if (!containerRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        // Soft wrap long lines instead of scrolling horizontally.
        EditorView.lineWrapping,
        markdown(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        fontSizeCompartment.current.of(fontSizeTheme(fontSize)),
        EditorView.theme({
          "&": {
            height: "100%",
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          },
          ".cm-scroller": {
            overflow: "auto",
            lineHeight: "1.6",
          },
          ".cm-content": {
            padding: "16px 20px",
          },
          "&.cm-focused": {
            outline: "none",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            borderRight: "1px solid var(--border)",
            color: "hsl(var(--muted-foreground))",
          },
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Reflow when the surrounding pane is resized (split drag, sidebar toggle).
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => view.requestMeasure())
        : null;
    observer?.observe(containerRef.current);

    return () => {
      observer?.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Apply font size changes without rebuilding the editor state.
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: fontSizeCompartment.current.reconfigure(fontSizeTheme(fontSize)),
    });
  }, [fontSize, fontSizeTheme]);

  // Sync external value updates to editor if changed externally
  React.useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const currentDoc = view.state.doc.toString();
      if (value !== currentDoc) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
        });
      }
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden bg-background ${className}`}
    />
  );
}
