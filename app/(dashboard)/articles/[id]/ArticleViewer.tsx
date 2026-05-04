"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

export default function ArticleViewer({ markdown }: { markdown: string }) {
  const [mode, setMode] = useState<"preview" | "raw">("preview");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Article Content</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setMode("preview")}
            className={`px-3 py-1.5 font-medium transition-colors ${mode === "preview" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Preview
          </button>
          <button
            onClick={() => setMode("raw")}
            className={`px-3 py-1.5 font-medium transition-colors ${mode === "raw" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Markdown
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="prose prose-gray max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-indigo-600 prose-blockquote:border-indigo-300 prose-blockquote:bg-indigo-50 prose-blockquote:py-0.5 prose-table:text-sm">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      ) : (
        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
          {markdown}
        </pre>
      )}
    </div>
  );
}
