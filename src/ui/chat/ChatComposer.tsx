"use client";

import { SendHorizontal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/ui/lib/cn";

export const MAX_MESSAGE_LENGTH = 2000;

/** Compositor del chat (DESIGN_PLAN 5.2): campo de 44 px y botón de enviar de 44 × 44. Ctrl/Cmd + Enter envía. */
export function ChatComposer({ onSend, busy = false, disabled = false, className }: { onSend: (text: string) => void; busy?: boolean; disabled?: boolean; className?: string }) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const blocked = busy || disabled || trimmed.length === 0;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (blocked) return;
    onSend(trimmed.slice(0, MAX_MESSAGE_LENGTH));
    setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className={cn("flex items-end gap-2", className)}>
      <label htmlFor="chat-message" className="sr-only">
        Message ArrivalGuard
      </label>
      <textarea
        id="chat-message"
        rows={1}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder="Message ArrivalGuard"
        aria-describedby="chat-message-hint"
        className="min-h-11 flex-1 resize-y rounded-control border border-line-strong bg-surface px-3 py-[10px] text-[15px] leading-[22px] text-ink placeholder:text-muted focus-visible:border-route disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span id="chat-message-hint" className="sr-only">
        Press Control or Command and Enter to send.
      </span>
      <button
        type="submit"
        aria-label="Send message"
        disabled={blocked}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-route text-on-route transition-colors duration-fast hover:bg-route-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SendHorizontal aria-hidden className="size-5" strokeWidth={1.75} />
      </button>
    </form>
  );
}
