"use client";

/* eslint-disable @next/next/no-img-element */

import { Check, CheckCheck, Clock, LogOut, QrCode, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/Modal";
import { Textarea } from "@/components/ui/Textarea";
import {
  useSelectedResident,
  useSetSelectedResident,
} from "@/components/PreferencesProvider";
import {
  getResidentPhoneOptions,
  getWhatsAppConversations,
  getWhatsAppMessages,
  type ResidentPhoneOption,
  type WhatsAppConversation,
  type WhatsAppMessageRow,
} from "@/app/test/whatsapp/actions";
import { cn } from "@/lib/cn";

type WhatsAppStatus = {
  state: "idle" | "connecting" | "qr" | "connected" | "closed";
  qrDataUrl: string | null;
  user: string | null;
  lastError: string | null;
};

const statusLabels: Record<WhatsAppStatus["state"], string> = {
  idle: "לא מחובר",
  connecting: "מתחבר",
  qr: "ממתין לסריקת QR",
  connected: "מחובר",
  closed: "מנותק",
};

export function WhatsAppTestPage() {
  const [status, setStatus] = useState<WhatsAppStatus>({
    state: "idle",
    qrDataUrl: null,
    user: null,
    lastError: null,
  });
  const [phone, setPhone] = useState("");
  const [residentPhones, setResidentPhones] = useState<ResidentPhoneOption[]>(
    []
  );
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([]);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const wasConnectedRef = useRef(false);
  const selectedResident = useSelectedResident();
  const setSelectedResident = useSetSelectedResident();
  const selectedResidentId = selectedResident?.id ?? null;

  // Refs so the polling tick always reads the latest values without
  // re-creating the interval on every keystroke.
  const phoneRef = useRef(phone);
  const residentIdRef = useRef<number | null>(selectedResidentId);
  useEffect(() => {
    phoneRef.current = phone;
  }, [phone]);
  useEffect(() => {
    residentIdRef.current = selectedResidentId;
  }, [selectedResidentId]);

  const connected = status.state === "connected";
  const hasConversation = Boolean(selectedResidentId) || phone.trim().length > 0;

  const statusTone = useMemo(() => {
    if (status.state === "connected")
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
    if (status.state === "qr" || status.state === "connecting")
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200";
    return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
  }, [status.state]);

  // Single polling loop: status + active-conversation messages every 2s.
  useEffect(() => {
    let active = true;

    async function tick() {
      try {
        const [nextStatus, nextMessages, nextConversations] = await Promise.all([
          fetchStatus(),
          getWhatsAppMessages({
            residentId: residentIdRef.current,
            phone: phoneRef.current,
          }),
          getWhatsAppConversations(),
        ]);
        if (!active) return;
        setStatus(nextStatus);
        setMessages(nextMessages);
        setConversations(nextConversations);
      } catch {
        /* silent — polled */
      }
    }

    void tick();
    const interval = window.setInterval(() => void tick(), 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (connected && loginOpen) {
      void Promise.resolve().then(() => setLoginOpen(false));
    }
    if (connected && !wasConnectedRef.current) {
      toast.success("WhatsApp מחובר");
    }
    wasConnectedRef.current = connected;
  }, [connected, loginOpen]);

  useEffect(() => {
    let active = true;
    if (selectedResidentId === null) {
      void Promise.resolve().then(() => {
        if (active) setResidentPhones([]);
      });
      return () => {
        active = false;
      };
    }
    void getResidentPhoneOptions(selectedResidentId).then((phones) => {
      if (!active) return;
      setResidentPhones(phones);
      const selected =
        phones.find((p) => p.is_primary === 1) ?? phones[0] ?? null;
      if (selected) setPhone(selected.number);
      else setPhone("");
    });
    return () => {
      active = false;
    };
  }, [selectedResidentId]);

  // Force-refresh messages immediately when the conversation key changes
  // (otherwise the user waits up to 2s before the chat reflects the switch).
  useEffect(() => {
    let active = true;
    const trimmed = phone.trim();
    if (!selectedResidentId && !trimmed) {
      void Promise.resolve().then(() => {
        if (active) setMessages([]);
      });
      return;
    }
    void getWhatsAppMessages({
      residentId: selectedResidentId,
      phone: trimmed,
    }).then((rows) => {
      if (active) setMessages(rows);
    });
    return () => {
      active = false;
    };
  }, [selectedResidentId, phone]);

  async function openLogin() {
    setLoginOpen(true);
    if (status.state === "connecting" || status.state === "qr") return;

    await runAction("connect", async () => {
      const next = await postStatus("/api/test/whatsapp/connect");
      setStatus(next);
    });
  }

  async function logout() {
    await runAction("logout", async () => {
      const next = await postStatus("/api/test/whatsapp/logout");
      setStatus(next);
      toast.success("החיבור אופס");
    });
  }

  const refetchMessages = useCallback(async () => {
    const trimmed = phoneRef.current.trim();
    if (!residentIdRef.current && !trimmed) return;
    const rows = await getWhatsAppMessages({
      residentId: residentIdRef.current,
      phone: trimmed,
    });
    setMessages(rows);
  }, []);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;

    await runAction("send", async () => {
      const response = await fetch("/api/test/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      const body = (await response.json()) as {
        error?: string;
        status?: WhatsAppStatus;
      };

      if (!response.ok) throw new Error(body.error ?? "שליחת ההודעה נכשלה");
      if (body.status) setStatus(body.status);
      setMessage("");
      await refetchMessages();
    });
  }

  async function runAction(name: string, action: () => Promise<void>) {
    setBusyAction(name);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הפעולה נכשלה");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] max-w-5xl flex-col gap-4">
      <header className="flex flex-col gap-3 rounded-md border border-black/10 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">WhatsApp</h1>
          <div
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium",
              statusTone
            )}
          >
            {statusLabels[status.state]}
          </div>
          {connected && status.user && (
            <span className="text-sm text-foreground/70">{status.user}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <Button
              variant="outline"
              onClick={logout}
              disabled={busyAction !== null}
            >
              <LogOut size={16} aria-hidden="true" />
              התנתק
            </Button>
          ) : (
            <Button onClick={openLogin} disabled={busyAction !== null}>
              <QrCode size={16} aria-hidden="true" />
              התחבר
            </Button>
          )}
        </div>
      </header>

      {!connected && status.lastError && (
        <div className="rounded-md border border-red-500/20 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300">
          {status.lastError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
        <ConversationSidebar
          conversations={conversations}
          activePhone={phone}
          onPick={(conv) => {
            setPhone(conv.phone);
            if (conv.resident) setSelectedResident(conv.resident);
          }}
        />
        <ChatPanel
          residentName={
            selectedResident
              ? `${selectedResident.first_name} ${selectedResident.last_name}`.trim()
              : null
          }
          phone={phone}
          onPhoneChange={setPhone}
          phoneOptions={toPhoneDropdownOptions(residentPhones)}
          messages={messages}
          message={message}
          onMessageChange={setMessage}
          onSubmit={sendMessage}
          canSend={connected && hasConversation}
          sending={busyAction === "send"}
        />
      </div>

      <Modal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="התחברות ל-WhatsApp"
        size="sm"
      >
        <div className="space-y-3">
          <div className="grid min-h-[280px] place-items-center rounded-md bg-zinc-50 p-3 dark:bg-zinc-950">
            {status.qrDataUrl ? (
              <img
                src={status.qrDataUrl}
                alt="WhatsApp QR"
                className="h-[252px] w-[252px] rounded bg-white p-2"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-center text-sm text-foreground/60">
                <QrCode size={44} aria-hidden="true" />
                <span>
                  {status.state === "connecting"
                    ? "מתחבר..."
                    : "ממתין ליצירת QR"}
                </span>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-foreground/60">
            פתח את WhatsApp בנייד, היכנס להגדרות ← מכשירים מקושרים, וסרוק את ה-QR.
          </p>

          {status.lastError && (
            <p className="text-center text-xs text-red-600 dark:text-red-400">
              {status.lastError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function toPhoneDropdownOptions(phones: ResidentPhoneOption[]): DropdownOption[] {
  return phones.map((p) => {
    const details = [p.comment, p.label].filter(Boolean).join(" · ");
    return {
      value: p.number,
      label: details ? `${p.number} · ${details}` : p.number,
    };
  });
}

type ConversationSidebarProps = {
  conversations: WhatsAppConversation[];
  activePhone: string;
  onPick: (conv: WhatsAppConversation) => void;
};

function ConversationSidebar({
  conversations,
  activePhone,
  onPick,
}: ConversationSidebarProps) {
  const trimmedActive = activePhone.trim();
  return (
    <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-e border-black/10 bg-zinc-50/40 dark:border-white/10 dark:bg-zinc-950/30">
      {conversations.length === 0 ? (
        <div className="grid h-full place-items-center p-4 text-center text-xs text-foreground/50">
          אין שיחות עדיין
        </div>
      ) : (
        conversations.map((conv) => {
          const isActive = conv.phone === trimmedActive;
          const title = conv.resident
            ? `${conv.resident.first_name} ${conv.resident.last_name}`.trim()
            : conv.phone;
          const subtitle = conv.resident
            ? `דירה ${conv.resident.apartment_number}`
            : null;
          const preview = formatPreview(conv);
          return (
            <button
              type="button"
              key={conv.phone}
              onClick={() => onPick(conv)}
              className={cn(
                "flex flex-col gap-0.5 border-b border-black/5 px-3 py-2.5 text-start transition-colors hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5",
                isActive && "bg-emerald-50 dark:bg-emerald-950/30"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{title}</span>
                <span className="shrink-0 text-[10px] text-foreground/55">
                  {formatTime(conv.last_at)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-foreground/60">
                  {preview}
                </span>
                {subtitle && (
                  <span className="shrink-0 text-[10px] text-foreground/45">
                    {subtitle}
                  </span>
                )}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

function formatPreview(conv: WhatsAppConversation): string {
  const body = conv.last_body.replace(/\s+/g, " ").trim();
  const prefix = conv.last_direction === "out" ? "אתה: " : "";
  return `${prefix}${body}`;
}

type ChatPanelProps = {
  residentName: string | null;
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneOptions: DropdownOption[];
  messages: WhatsAppMessageRow[];
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  canSend: boolean;
  sending: boolean;
};

function ChatPanel({
  residentName,
  phone,
  onPhoneChange,
  phoneOptions,
  messages,
  message,
  onMessageChange,
  onSubmit,
  canSend,
  sending,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  const hasConversation = residentName || phone.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-black/10 bg-zinc-50/60 p-3 dark:border-white/10 dark:bg-zinc-950/40 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-semibold">
            {residentName ?? "שיחה חופשית"}
          </span>
          <span className="text-xs text-foreground/60">
            {phone.trim() ? phone : "ללא מספר"}
          </span>
        </div>
        {phoneOptions.length > 0 ? (
          <Dropdown
            value={phone}
            onChange={onPhoneChange}
            options={phoneOptions}
            placeholder="בחר טלפון"
            className="sm:w-60"
          />
        ) : (
          <Input
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder="972501234567"
            inputMode="tel"
            className="sm:w-48"
            aria-label="מספר טלפון"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-zinc-50/40 p-3 dark:bg-zinc-950/20">
        {!hasConversation ? (
          <EmptyState text="בחר דייר בסרגל החיפוש או הזן מספר טלפון כדי להתחיל" />
        ) : messages.length === 0 ? (
          <EmptyState text="אין הודעות עדיין" />
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-black/10 p-3 dark:border-white/10"
      >
        <div className="flex items-end gap-1 rounded-md border border-zinc-300 bg-transparent pe-1 transition-colors focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-foreground/20 dark:border-zinc-700">
          <Textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="כתוב הודעה..."
            rows={2}
            className="flex-1 border-0 bg-transparent focus:ring-0 focus:outline-none"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button
            type="submit"
            disabled={!canSend || sending || !message.trim()}
            variant="ghost"
            size="icon-sm"
            className="mb-1 text-red-600 dark:text-red-500"
            aria-label="שליחה"
          >
            <Send size={16} aria-hidden="true" className="-scale-x-100" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: WhatsAppMessageRow }) {
  const isOut = msg.direction === "out";
  const isFailed = msg.status === "failed";

  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isOut
            ? "bg-emerald-100 text-zinc-900 dark:bg-emerald-900/40 dark:text-zinc-100"
            : "bg-white text-zinc-900 ring-1 ring-black/5 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/5",
          isFailed && "ring-1 ring-red-400 dark:ring-red-500/60"
        )}
      >
        <div className="whitespace-pre-wrap break-words">{msg.body}</div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-foreground/55">
          <span>{formatTime(msg.created_at)}</span>
          {isOut && <StatusIcon status={msg.status} />}
        </div>
        {isFailed && msg.error && (
          <div className="mt-1 text-[10px] text-red-600 dark:text-red-400">
            {msg.error}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: WhatsAppMessageRow["status"] }) {
  if (status === "pending")
    return <Clock size={12} aria-label="ממתין" className="opacity-70" />;
  if (status === "sent")
    return <Check size={12} aria-label="נשלח" />;
  if (status === "delivered")
    return <CheckCheck size={12} aria-label="נמסר" />;
  if (status === "read")
    return <CheckCheck size={12} aria-label="נקרא" className="text-sky-500" />;
  if (status === "failed")
    return <X size={12} aria-label="נכשל" className="text-red-500" />;
  return null;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-foreground/50">
      {text}
    </div>
  );
}

function formatTime(iso: string): string {
  // SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC.
  // Treat as UTC, render in local time.
  const utc = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

async function fetchStatus(): Promise<WhatsAppStatus> {
  const response = await fetch("/api/test/whatsapp/status", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load WhatsApp status.");
  return (await response.json()) as WhatsAppStatus;
}

async function postStatus(url: string): Promise<WhatsAppStatus> {
  const response = await fetch(url, { method: "POST" });
  const body = (await response.json()) as WhatsAppStatus & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "WhatsApp action failed.");
  return body;
}
