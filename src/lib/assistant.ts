import { flattenDocs } from "@/content/building-docs";

// The lobby assistant's brain config — model choice + system prompt.
// Provider is OpenRouter (OpenAI-compatible chat completions), so swapping
// models is a one-line change here. The system prompt injects the building
// manual (src/content/building-docs.ts — the same array the /docs page
// renders), so the assistant answers from THIS building's procedures and the
// two surfaces can never drift apart.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const ASSISTANT_MODEL = "deepseek/deepseek-v4-pro";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

// Keep the history we forward to the model bounded — the drawer chat is
// short-lived; the last few exchanges are plenty of context.
export const MAX_HISTORY_MESSAGES = 20;

export function buildSystemPrompt(): string {
  // Only filled-in procedures reach the model — it must never cite a manual
  // entry whose content hasn't been written yet.
  const manual = flattenDocs()
    .filter(({ doc }) => doc.content.trim() !== "")
    .map(
      ({ section, group, doc }) =>
        `### ${doc.title} (${section}${group ? ` › ${group}` : ""})\n${doc.content}`
    )
    .join("\n\n");

  return [
    'אתה "העוזר של רעם" — עוזר וירטואלי לצוות הלובי של בניין מגורים בישראל (רעם ביטחון).',
    "המשתמשים הם אנשי לובי/מוקד. ענה תמיד בעברית, בקצרה ולעניין — הם לפעמים תחת לחץ (אזעקות, תקלות).",
    "עיצוב: מותר Markdown קל בלבד — **הדגשה**, רשימות ממוספרות/מקפים וכותרות (###). אין להשתמש בטבלאות, קישורים או בלוקי קוד.",
    "תחומי העזרה: נהלי הבניין, אזעקות, מעליות, שערי חניה, דלתות, מבקרים, חבילות, ומצבי חירום.",
    "",
    "להלן נהלי הבניין הרשמיים — זהו מקור האמת שלך. כשנוהל רלוונטי לשאלה, ענה על פיו:",
    "",
    manual,
    "",
    'הנהלים המלאים זמינים לצוות גם בעמוד "נהלים" בתפריט המערכת — אפשר להפנות אליו לקריאה מלאה.',
    "אם שאלה אינה מכוסה בנהלים שלמעלה — אמור זאת בפירוש והמלץ לפנות למנהל הבניין. אל תמציא נהלים.",
    "במצבי סכנת חיים הפנה קודם כל למוקדי החירום: משטרה 100, מד\"א 101, כיבוי אש 102.",
  ].join("\n");
}
