"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Notion-style markdown render scoped to assistant messages.
// Headings, lists, bold, code, tables, links. No prose plugin so we control type tight.
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-6 mb-2 text-[20px] font-semibold tracking-tight first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-5 mb-2 text-[17px] font-semibold tracking-tight first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-4 mb-2 text-[15px] font-semibold tracking-tight first:mt-0">
            {children}
          </h3>
        ),
        p: ({ children }) => <p className="mt-2 first:mt-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-muted-foreground first:mt-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mt-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground first:mt-0">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-muted-foreground underline-offset-2 transition-colors hover:decoration-foreground"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-5 border-t border-border" />,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-border pl-4 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !/language-/.test(className ?? "");
          if (isInline) {
            return (
              <code
                className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.92em] text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <code className={cn("font-mono text-[13px]", className)} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-[13px] leading-relaxed">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border px-3 py-2 align-top">{children}</td>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
