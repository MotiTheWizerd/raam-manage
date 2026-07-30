"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SendHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Floating "ask the building" chat panel — design shell only for now (no LLM
// wired yet). Global shortcut Ctrl+K toggles it (Ctrl+Space is taken by the
// lobby door in GateControl). e.code is used so the chord also works when the
// keyboard layout is on Hebrew (where e.key would be "ל").

type Msg = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

const WELCOME: Msg = {
  id: 0,
  role: "assistant",
  text: "היי! 👋 אני העוזר של רעם.\nבקרוב אוכל לענות מתוך הנהלים — אזעקות, מעליות, חניה וכל השאר.",
};

// Until the brain is connected, every question gets this honest answer.
const PLACEHOLDER_REPLY =
  "עוד לא חיברו אותי למוח 🧠 בינתיים אני רק יפה — בקרוב אענה על הכל!";
const REPLY_DELAY_MS = 900;

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const nextId = useRef(1);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Global shortcut: Ctrl+K toggles the panel anywhere in the app.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.code !== "KeyK") return;
      if (e.repeat) return;
      e.preventDefault(); // stop the browser's address-bar search chord
      setOpen((o) => !o);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Esc closes while open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus the input when the panel opens; keep the log scrolled to the newest.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, open]);

  useEffect(() => {
    return () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;
    setDraft("");
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text }]);
    setTyping(true);
    replyTimer.current = setTimeout(() => {
      setTyping(false);
      setMessages((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", text: PLACEHOLDER_REPLY },
      ]);
    }, REPLY_DELAY_MS);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 28, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className={cn(
            "fixed bottom-6 right-6 z-50 flex h-[min(34rem,calc(100vh-7rem))] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-3xl",
            "border border-white/50 bg-white/60 shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl",
            "dark:border-white/10 dark:bg-zinc-900/55 dark:ring-white/5"
          )}
        >
          {/* Glossy sheen across the top of the glass */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/50 to-transparent dark:from-white/10" />

          {/* Header */}
          <div className="relative flex items-center gap-3 border-b border-white/40 px-4 py-3 dark:border-white/10">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white shadow-md">
              <Sparkles size={18} />
            </div>
            <div className="flex-1 leading-tight">
              <div className="text-sm font-semibold">העוזר של רעם</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                שאלו אותי על נהלי הבניין
              </div>
            </div>
            <kbd className="rounded-md border border-black/10 bg-white/50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
              Ctrl K
            </kbd>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="סגירת העוזר"
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
            >
              <X size={15} />
            </button>
          </div>

          {/* Message log */}
          <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  msg.role === "assistant"
                    ? "self-start rounded-ss-sm bg-white/70 text-zinc-800 ring-1 ring-black/5 backdrop-blur-sm dark:bg-white/10 dark:text-zinc-100 dark:ring-white/10"
                    : "self-end rounded-se-sm bg-gradient-to-l from-violet-600 to-sky-600 text-white shadow-md"
                )}
              >
                {msg.text}
              </div>
            ))}
            {typing && (
              <div className="flex items-center gap-1 self-start rounded-2xl rounded-ss-sm bg-white/70 px-3.5 py-3 ring-1 ring-black/5 backdrop-blur-sm dark:bg-white/10 dark:ring-white/10">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-white/40 p-3 dark:border-white/10"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="שאלו אותי משהו…"
              className="h-10 min-w-0 flex-1 rounded-full border border-white/50 bg-white/60 px-4 text-sm text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/30 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={!draft.trim() || typing}
              aria-label="שליחה"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-sky-600 text-white shadow-md transition enabled:hover:brightness-110 disabled:opacity-40"
            >
              <SendHorizontal size={17} className="-scale-x-100" />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
