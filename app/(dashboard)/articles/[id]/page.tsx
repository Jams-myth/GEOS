import { getDb } from "../../../../lib/db/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleViewer from "./ArticleViewer";
import PushToSite from "./PushToSite";
import RePolish from "./RePolish";

export const dynamic = "force-dynamic";

async function getArticle(id: string) {
  const db = getDb();
  const { data, error } = await db
    .from("articles")
    .select("id, title, slug, primary_keyword, secondary_keywords, meta_title, meta_description, schema_type, body_md, status, published_at, url, version, site_id, generation_scores_jsonb, indexing_jobs_jsonb")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

async function getSites() {
  const db = getDb();
  const { data } = await db
    .from("sites")
    .select("id, name, domain, vercel_config_jsonb")
    .order("name");

  return (data ?? []).map((s) => {
    const cfg = s.vercel_config_jsonb as Record<string, string> | null;
    return {
      id: s.id,
      name: s.name,
      domain: s.domain,
      connected: !!(cfg?.revalidate_url),
    };
  });
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [article, sites] = await Promise.all([getArticle(id), getSites()]);

  if (!article) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/articles" className="text-sm text-indigo-600 hover:underline">
          ← Back to articles
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{article.title}</h1>
        <span className={`shrink-0 inline-block text-xs px-2 py-1 rounded-full font-medium ${
          article.status === "published" ? "bg-green-100 text-green-700"
          : article.status === "draft" ? "bg-yellow-100 text-yellow-700"
          : "bg-gray-100 text-gray-600"
        }`}>
          {article.status}
        </span>
      </div>

      {/* Push to site */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Push to site</div>
        <PushToSite
          articleId={article.id}
          currentSiteId={(article as { site_id?: string | null }).site_id ?? null}
          sites={sites}
        />
      </div>

      {/* Re-Polish & Re-Score */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Re-Polish &amp; Re-Score</div>
        <RePolish articleId={article.id} />
      </div>

      {/* Indexing status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Search Engine Indexing</div>
        {(() => {
          type IndexingJob = { adapter: string; jobId: string; status: string; submittedAt?: string };
          const raw = article.indexing_jobs_jsonb;
          const jobs: IndexingJob[] = Array.isArray(raw) ? (raw as IndexingJob[]) : [];
          if (jobs.length === 0) {
            return <p className="text-sm text-gray-400">Not yet submitted. Push to site to trigger SpeedyIndex submission.</p>;
          }
          return (
            <div className="space-y-2">
              {jobs.map((job, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Submitted to SpeedyIndex
                  </span>
                  <span className="text-gray-400 font-mono text-xs">job {job.jobId}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    job.status === "submitted" || job.status === "ok"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {job.status}
                  </span>
                  {job.submittedAt && (
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(job.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Meta */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Primary Keyword</div>
          <div className="text-gray-800">{article.primary_keyword ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Slug</div>
          <div className="text-gray-800 font-mono text-xs">{article.slug}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Meta Title</div>
          <div className="text-gray-800">{article.meta_title ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Meta Description</div>
          <div className="text-gray-800">{article.meta_description ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Schema Type</div>
          <div className="text-gray-800">{article.schema_type ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Published</div>
          <div className="text-gray-800">
            {article.published_at
              ? new Date(article.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "—"}
          </div>
        </div>
        {article.url && (
          <div className="col-span-2">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Live URL</div>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-sm">
              {article.url}
            </a>
          </div>
        )}
      </div>

      {/* Article body */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-end mb-1">
          <span className="text-xs text-gray-400">v{article.version}</span>
        </div>
        <ArticleViewer markdown={article.body_md ?? ""} />
      </div>
    </div>
  );
}
