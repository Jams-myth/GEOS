"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ArchiveButton({
  articleId,
  currentStatus,
}: {
  articleId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isArchived = currentStatus === "archived";

  async function handleToggle() {
    if (!isArchived && !confirm("Archive this article? It will be hidden from the main list but not deleted.")) return;
    setLoading(true);
    try {
      await fetch(`/api/articles/${articleId}/archive`, {
        method: isArchived ? "DELETE" : "POST",
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        isArchived
          ? "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          : "border-gray-300 bg-white text-gray-500 hover:border-red-200 hover:text-red-600"
      }`}
    >
      {loading ? "…" : isArchived ? "↩ Restore" : "Archive"}
    </button>
  );
}
