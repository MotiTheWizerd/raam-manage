// The lobby assistant's brain config — model choice + system prompt.
// Provider is OpenRouter (OpenAI-compatible chat completions), so swapping
// models is a one-line change here. The system prompt is built by a function
// on purpose: the building knowledge base (procedures, contacts) will be
// injected into it later without touching the API route.

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
  return [
    'אתה "העוזר של רעם" — עוזר וירטואלי לצוות הלובי של בניין מגורים בישראל (רעם ביטחון).',
    "המשתמשים הם אנשי לובי/מוקד. ענה תמיד בעברית, בקצרה ולעניין — הם לפעמים תחת לחץ (אזעקות, תקלות).",
    "תחומי העזרה: נהלי הבניין, אזעקות, מעליות, שערי חניה, דלתות, מבקרים, חבילות, ומצבי חירום.",
    "אם אינך יודע את התשובה או שהיא תלויה בנוהל ספציפי של הבניין שלא סופק לך — אמור זאת בפירוש והמלץ לפנות למנהל הבניין. אל תמציא נהלים.",
    "במצבי סכנת חיים הפנה קודם כל למוקדי החירום: משטרה 100, מד\"א 101, כיבוי אש 102.",
  ].join("\n");
}
