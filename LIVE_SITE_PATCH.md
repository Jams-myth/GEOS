# LIVE_SITE_PATCH.md

Changes to apply to the **live site repo** (not this pipeline repo). Apply before first publish.

---

## 1. `/api/revalidate` Route

Create `app/api/revalidate/route.ts` in the live site:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "REVALIDATE_SECRET not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { paths?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.paths) || body.paths.length === 0) {
    return NextResponse.json({ error: "paths array required" }, { status: 400 });
  }

  for (const path of body.paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: body.paths, timestamp: new Date().toISOString() });
}
```

---

## 2. RLS Policy SQL (apply in Supabase SQL editor)

```sql
-- Ensure anon key can only read published articles
CREATE POLICY "Anon read published articles"
  ON articles FOR SELECT
  TO anon
  USING (status = 'published');
```

---

## 3. IndexNow Site Key File

Create a static file at `public/<INDEXNOW_KEY>.txt` containing only the key value:

```
<your-indexnow-key-value>
```

This must be accessible at `https://<your-domain>/<indexnow-key>.txt` (no path prefix).

---

## 4. Environment Variables (add to live site Vercel dashboard)

| Variable | Value | Note |
|---|---|---|
| `REVALIDATE_SECRET` | same value as pipeline's `VERCEL_REVALIDATE_SECRET` | **Must match exactly** |
| `NEXT_PUBLIC_SUPABASE_URL` | same as pipeline's `SUPABASE_URL` | Same project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as pipeline's `SUPABASE_ANON_KEY` | Read-only anon key |

Generate `REVALIDATE_SECRET` with: `openssl rand -hex 32`

---

## 5. Renderer Requirements (new Supabase columns)

### `meta_title` → `<title>` and OpenGraph
```typescript
// In your article page component
import type { Metadata } from "next";

export async function generateMetadata({ params }): Promise<Metadata> {
  const article = await getArticle(params.slug);
  return {
    title: article.meta_title ?? article.title,
    description: article.meta_description ?? undefined,
    openGraph: {
      title: article.meta_title ?? article.title,
      description: article.meta_description ?? undefined,
    },
  };
}
```

### `meta_description` → `<meta name="description">`
Set via `generateMetadata` as shown above — Next.js handles the `<meta>` tag automatically.

### `schema_type` → JSON-LD generation
```typescript
function buildJsonLd(article: Article) {
  const schemas = [];

  // Always emit Article schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    author: { "@type": "Person", name: article.author_name },
    datePublished: article.published_at,
    dateModified: article.updated_at,
    description: article.meta_description,
  });

  // Emit FAQPage schema if schema_type includes FAQ
  if (article.schema_type?.includes("FAQ") && article.faq_json_ld) {
    schemas.push(article.faq_json_ld);
  }

  // Emit HowTo schema if flagged
  if (article.schema_type?.includes("HowTo")) {
    // Implement HowTo schema from body_md steps
  }

  return schemas;
}
```

### `tldr_bullets` → Key Takeaways block + FAQ schema input
```typescript
// Key Takeaways visible block
export function KeyTakeaways({ bullets }: { bullets: string[] }) {
  return (
    <aside className="key-takeaways">
      <h2>Key Takeaways</h2>
      <ul>
        {bullets.map((bullet, i) => (
          <li key={i}>{bullet}</li>
        ))}
      </ul>
    </aside>
  );
}

// Also feed tldr_bullets into FAQ schema as short-answer entries if faq_json_ld is null
```

### `body_md` → Markdown renderer
`body_md` starts with the H1 (`# `). No META BLOCK stripping needed — the pipeline already stripped it. Feed directly into your markdown renderer (MDX, react-markdown, etc.):

```typescript
import ReactMarkdown from "react-markdown";

<ReactMarkdown>{article.body_md}</ReactMarkdown>
```

---

## 6. Setup Checklist

- [ ] Generate `REVALIDATE_SECRET`: `openssl rand -hex 32`
- [ ] Set `REVALIDATE_SECRET` in live site Vercel env vars
- [ ] Set `VERCEL_REVALIDATE_SECRET` in pipeline env vars to the **same value**
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in live site
- [ ] Create `/app/api/revalidate/route.ts` (code above)
- [ ] Create `public/<INDEXNOW_KEY>.txt` with the key value
- [ ] Apply RLS policy SQL in Supabase
- [ ] Update article page to use `meta_title`, `meta_description`, `schema_type`, `tldr_bullets`
- [ ] Redeploy live site
