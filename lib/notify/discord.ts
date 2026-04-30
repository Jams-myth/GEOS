import { withRetry } from "../util/retry";

export type DiscordNotification =
  | {
      kind: "article_published";
      articleId: string;
      title: string;
      url: string;
      scores: Record<string, number>;
      footnoteCount: number;
      tableCount: number;
      quoteCount: number;
    }
  | {
      kind: "manual_review";
      articleId: string;
      headline: string;
      draftExcerpt: string;
      revisionNotes: string[];
    }
  | {
      kind: "placeholder_detected";
      articleId: string;
      headline: string;
    }
  | {
      kind: "topic_candidates";
      siteId: string;
      siteName: string;
      candidates: Array<{ id: string; headline: string; score: number }>;
    };

interface DiscordEmbed {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
}

// Discord embed colours
const COLOUR_GREEN = 0x57f287;
const COLOUR_RED = 0xed4245;
const COLOUR_ORANGE = 0xfee75c;
const COLOUR_BLUE = 0x5865f2;

function buildEmbed(notification: DiscordNotification): DiscordEmbed {
  switch (notification.kind) {
    case "article_published": {
      const scoreFields = Object.entries(notification.scores).map(([k, v]) => ({
        name: k.replace(/_/g, " "),
        value: `${v}/10`,
        inline: true,
      }));
      return {
        title: `Published: ${notification.title}`,
        color: COLOUR_GREEN,
        fields: [
          { name: "URL", value: notification.url },
          ...scoreFields,
          {
            name: "Content counts",
            value: `Footnotes: ${notification.footnoteCount} | Tables: ${notification.tableCount} | Quotes: ${notification.quoteCount}`,
          },
        ],
        footer: { text: `Article ID: ${notification.articleId}` },
      };
    }
    case "manual_review": {
      return {
        title: `Manual Review Required: ${notification.headline}`,
        color: COLOUR_RED,
        fields: [
          {
            name: "Draft excerpt",
            value: notification.draftExcerpt.slice(0, 200) || "(empty)",
          },
          {
            name: "Revision notes",
            value:
              notification.revisionNotes.length > 0
                ? notification.revisionNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")
                : "None",
          },
        ],
        footer: { text: `Article ID: ${notification.articleId}` },
      };
    }
    case "placeholder_detected": {
      return {
        title: `Placeholder Detected: ${notification.headline}`,
        color: COLOUR_ORANGE,
        fields: [
          {
            name: "Action required",
            value:
              "Provide a real Information Gain Asset (statistic, named quote, or study) before retrying this article.",
          },
        ],
        footer: { text: `Article ID: ${notification.articleId}` },
      };
    }
    case "topic_candidates": {
      const topFive = notification.candidates.slice(0, 5);
      return {
        title: `New Topic Candidates — ${notification.siteName}`,
        color: COLOUR_BLUE,
        fields: topFive.map((c, i) => ({
          name: `${i + 1}. ${c.headline}`,
          value: `Score: ${c.score.toFixed(2)} | ID: ${c.id}`,
        })),
        footer: {
          text: `Site: ${notification.siteId} — Approval buttons will be wired up in Task 4 (Discord interaction handler).`,
        },
      };
    }
  }
}

export async function notifyDiscord(notification: DiscordNotification): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error(
      "DISCORD_WEBHOOK_URL is not set. Add it to your .env.local before sending Discord notifications."
    );
  }

  const embed = buildEmbed(notification);

  return withRetry(async () => {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable body)");
      throw new Error(
        `Discord webhook returned ${response.status} ${response.statusText}: ${body}`
      );
    }
  });
}
