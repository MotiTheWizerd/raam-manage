"use client";

/* eslint-disable @next/next/no-img-element */

import { LogOut, QrCode, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useSelectedResident } from "@/components/PreferencesProvider";
import { getResidentPrimaryPhone } from "@/app/renters/actions";
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
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const wasConnectedRef = useRef(false);
  const selectedResident = useSelectedResident();
  const selectedResidentId = selectedResident?.id ?? null;

  const connected = status.state === "connected";

  const statusTone = useMemo(() => {
    if (status.state === "connected")
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
    if (status.state === "qr" || status.state === "connecting")
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200";
    return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
  }, [status.state]);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const next = await fetchStatus();
        if (active) setStatus(next);
      } catch {
        /* silent — polled call */
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);

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
    if (selectedResidentId === null) return;
    let active = true;
    void getResidentPrimaryPhone(selectedResidentId).then((primary) => {
      if (active && primary) setPhone(primary);
    });
    return () => {
      active = false;
    };
  }, [selectedResidentId]);

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

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      toast.success("ההודעה נשלחה");
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
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-col gap-3 rounded-md border border-black/10 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">בדיקת WhatsApp</h1>
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

      <form
        onSubmit={sendMessage}
        className="space-y-4 rounded-md border border-black/10 p-4 dark:border-white/10"
      >
        <h2 className="text-base font-semibold">שליחת הודעה</h2>

        <Field
          label="טלפון"
          htmlFor="whatsapp-phone"
          hint="אפשר להזין 9725... או מספר ישראלי שמתחיל ב-05."
          required
        >
          <Input
            id="whatsapp-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="972501234567"
            inputMode="tel"
            required
          />
        </Field>

        <Field label="הודעה" htmlFor="whatsapp-message" required>
          <Textarea
            id="whatsapp-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="שלום, זו הודעת בדיקה"
            required
          />
        </Field>

        <Button
          type="submit"
          disabled={busyAction !== null || !connected}
          className="w-full sm:w-auto"
        >
          <Send size={16} aria-hidden="true" />
          שליחה
        </Button>
      </form>

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
