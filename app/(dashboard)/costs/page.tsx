import { getDb } from "../../../lib/db/client";

export const dynamic = "force-dynamic";

interface CostByModel {
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  call_count: number;
}

interface CostByDay {
  day: string;
  total_cost_usd: number;
}

interface ArticleCost {
  article_id: string | null;
  title: string | null;
  total_cost_usd: number;
  call_count: number;
}

async function fetchCostData() {
  const db = getDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  const [byModelRes, byDayRes, byArticleRes, totalRes] = await Promise.all([
    // Cost by model (last 30 days)
    db
      .from("token_usage_logs")
      .select("model, input_tokens, output_tokens, cost_usd")
      .gte("created_at", cutoff),

    // Cost by day (last 30 days)
    db
      .from("token_usage_logs")
      .select("created_at, cost_usd")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true }),

    // Cost by article (top 20 most expensive, last 30 days)
    db
      .from("token_usage_logs")
      .select("article_id, cost_usd")
      .gte("created_at", cutoff)
      .not("article_id", "is", null),

    // All-time total
    db.from("token_usage_logs").select("cost_usd"),
  ]);

  const rows = byModelRes.data ?? [];

  // Aggregate by model
  const modelMap = new Map<string, CostByModel>();
  for (const row of rows) {
    const m = modelMap.get(row.model) ?? {
      model: row.model,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      call_count: 0,
    };
    m.total_input_tokens += row.input_tokens;
    m.total_output_tokens += row.output_tokens;
    m.total_cost_usd += Number(row.cost_usd);
    m.call_count += 1;
    modelMap.set(row.model, m);
  }
  const byModel = [...modelMap.values()].sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  // Aggregate by day
  const dayMap = new Map<string, number>();
  for (const row of byDayRes.data ?? []) {
    const day = (row.created_at ?? "").slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + Number(row.cost_usd));
  }
  const byDay: CostByDay[] = [...dayMap.entries()]
    .map(([day, total_cost_usd]) => ({ day, total_cost_usd }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Aggregate by article
  const articleMap = new Map<string, { total_cost_usd: number; call_count: number }>();
  for (const row of byArticleRes.data ?? []) {
    if (!row.article_id) continue;
    const a = articleMap.get(row.article_id) ?? { total_cost_usd: 0, call_count: 0 };
    a.total_cost_usd += Number(row.cost_usd);
    a.call_count += 1;
    articleMap.set(row.article_id, a);
  }

  // Fetch article titles for the top 20
  const topArticleIds = [...articleMap.entries()]
    .sort((a, b) => b[1].total_cost_usd - a[1].total_cost_usd)
    .slice(0, 20)
    .map(([id]) => id);

  let articleTitles: Record<string, string> = {};
  if (topArticleIds.length > 0) {
    const { data: articles } = await db
      .from("articles")
      .select("id, title")
      .in("id", topArticleIds);
    articleTitles = Object.fromEntries((articles ?? []).map((a) => [a.id, a.title]));
  }

  const byArticle: ArticleCost[] = topArticleIds.map((id) => ({
    article_id: id,
    title: articleTitles[id] ?? null,
    ...articleMap.get(id)!,
  }));

  const allTimeTotal = (totalRes.data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  const thirtyDayTotal = rows.reduce((s, r) => s + Number(r.cost_usd), 0);

  return { byModel, byDay, byArticle, allTimeTotal, thirtyDayTotal };
}

export default async function CostsPage() {
  const { byModel, byDay, byArticle, allTimeTotal, thirtyDayTotal } = await fetchCostData();

  return (
    <div style={{ padding: "24px", fontFamily: "sans-serif", color: "#1a1a1a", maxWidth: "1100px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "24px" }}>LLM Cost Dashboard</h1>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
        <div style={cardStyle}>
          <div style={cardLabel}>All-time total</div>
          <div style={cardValue}>${allTimeTotal.toFixed(4)}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Last 30 days</div>
          <div style={cardValue}>${thirtyDayTotal.toFixed(4)}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Models tracked</div>
          <div style={cardValue}>{byModel.length}</div>
        </div>
      </div>

      {/* Cost by model */}
      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionHeader}>Cost by Model (last 30 days)</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["Model", "Calls", "Input tokens", "Output tokens", "Cost (USD)"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byModel.map((r) => (
              <tr key={r.model}>
                <td style={tdStyle}><code>{r.model}</code></td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{r.call_count.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{r.total_input_tokens.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{r.total_output_tokens.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>${r.total_cost_usd.toFixed(4)}</td>
              </tr>
            ))}
            {byModel.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, color: "#6b7280", textAlign: "center" }}>No data yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Cost by day */}
      <section style={{ marginBottom: "40px" }}>
        <h2 style={sectionHeader}>Daily Cost (last 30 days)</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["Date", "Cost (USD)"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byDay.map((r) => (
              <tr key={r.day}>
                <td style={tdStyle}>{r.day}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>${r.total_cost_usd.toFixed(4)}</td>
              </tr>
            ))}
            {byDay.length === 0 && (
              <tr>
                <td colSpan={2} style={{ ...tdStyle, color: "#6b7280", textAlign: "center" }}>No data yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Cost by article */}
      <section>
        <h2 style={sectionHeader}>Top Articles by Cost (last 30 days)</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["Article", "Calls", "Cost (USD)"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byArticle.map((r) => (
              <tr key={r.article_id}>
                <td style={tdStyle}>
                  <span style={{ fontSize: "13px", color: "#374151" }}>{r.title ?? r.article_id}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{r.call_count}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>${r.total_cost_usd.toFixed(4)}</td>
              </tr>
            ))}
            {byArticle.length === 0 && (
              <tr>
                <td colSpan={3} style={{ ...tdStyle, color: "#6b7280", textAlign: "center" }}>No data yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "16px 24px",
  minWidth: "180px",
};

const cardLabel: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  marginBottom: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const cardValue: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  color: "#111827",
};

const sectionHeader: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  marginBottom: "12px",
  color: "#111827",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #e5e7eb",
  color: "#374151",
};
