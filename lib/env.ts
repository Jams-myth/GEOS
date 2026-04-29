import { z } from "zod";

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default("article-media"),
  SUPABASE_PROJECT_ID: z.string().optional(),

  // Vercel revalidation
  VERCEL_REVALIDATE_URL: z.string().url().optional(),
  VERCEL_REVALIDATE_SECRET: z.string().min(1),

  // Inngest
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),

  // LLMs
  ANTHROPIC_API_KEY: z.string().min(1),
  GOOGLE_AI_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  PERPLEXITY_API_KEY: z.string().min(1),

  // Scraping
  FIRECRAWL_API_KEY: z.string().min(1),
  JINA_API_KEY: z.string().optional(),

  // Indexing
  SPEEDYINDEX_API_KEY: z.string().optional(),
  GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON: z.string().optional(),
  INDEXNOW_KEY: z.string().optional(),

  // SEO/Analytics
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // Notifications
  RESEND_API_KEY: z.string().min(1),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_PUBLIC_KEY: z.string().optional(),
  DISCORD_APPLICATION_ID: z.string().optional(),

  // Security
  APPROVAL_TOKEN_HMAC_SECRET: z.string().min(1),

  // Image generation
  FAL_KEY: z.string().min(1),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${missing}\n\nCheck .env.example for required variables.`);
  }
  return result.data;
}

export const env = parseEnv();
