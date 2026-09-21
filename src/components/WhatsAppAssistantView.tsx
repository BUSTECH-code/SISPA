"use client";

import React, { useState, useRef, useEffect } from "react";
import { useStock } from "@/context/StockContext";
import {
  MessageSquare,
  Send,
  Check,
  X,
  HelpCircle,
  FileText,
  CreditCard,
  ShoppingBag,
  Sparkles,
  Bot,
  User as UserIcon,
  Copy,
  ExternalLink,
} from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "USER" | "SISPA";
  text: string;
  timestamp: string;
  actionPending?: boolean;
  actionData?: any;
}

export function WhatsAppAssistantView() {
  const { user, refreshData } = useStock();
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "SISPA",
      text: `Hello ${user?.fullName ? user.fullName.split(" ")[0] : "Boss"}! 👋\n\nI'm your SISPA Shop Assistant on WhatsApp.\n\nYou can chat with me in plain language to check your business or record transactions:\n\n• "Who owes me?"\n• "What do I need to buy?"\n• "Sold 20 cement to Musa"\n• "Musa paid 100k"\n• "Weekly report"\n• "Received 50 cement from ABC"`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [copiedBriefing, setCopiedBriefing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "USER",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });

      const json = await res.json();
      if (json.success) {
        const botMsg: ChatMessage = {
          id: String(Date.now() + 1),
          sender: "SISPA",
          text: json.replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          actionPending: json.actionPending,
          actionData: json.actionPending
            ? {
                intent: json.parsed.intent,
                productId: json.parsed.matchedProductId,
                quantity: json.parsed.quantity,
                customerId: json.parsed.matchedCustomerId,
                amount: json.parsed.amount,
                supplierName: json.parsed.supplierName,
              }
            : undefined,
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: "SISPA",
            text: "Sorry, I had trouble processing that. Check your connection and try again.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: "SISPA",
          text: "Network error. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmAction = async (msgId: string, actionData: any) => {
    setIsSending(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executeAction: true, actionData }),
      });

      const json = await res.json();
      if (json.success) {
        // Mark confirmed
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, actionPending: false } : m))
        );

        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            sender: "SISPA",
            text: json.replyText,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);

        await refreshData();
      }
    } catch {
      alert("Failed to execute action.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyWeeklyReport = async () => {
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "weekly report" }),
      });
      const json = await res.json();
      if (json.replyText) {
        navigator.clipboard.writeText(json.replyText);
        setCopiedBriefing(true);
        setTimeout(() => setCopiedBriefing(false), 2500);
      }
    } catch {
      alert("Could not copy report.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
            <MessageSquare className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">WhatsApp Assistant</h2>
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Live on Same Database
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Operate your business through WhatsApp messages or chat here directly.
            </p>
          </div>
        </div>

        <button
          onClick={handleCopyWeeklyReport}
          className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors self-start sm:self-auto"
        >
          {copiedBriefing ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copiedBriefing ? "Copied Report!" : "Copy WhatsApp Report"}</span>
        </button>
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          "Who owes me?",
          "What do I need to buy?",
          "Show me this week's report",
          "How much stock do I have?",
        ].map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSend(prompt)}
            disabled={isSending}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 transition-colors whitespace-nowrap active:scale-95 disabled:opacity-50 shadow-2xs"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <div className="flex flex-col h-[520px] rounded-3xl border border-slate-200 bg-linear-to-b from-slate-50 to-white shadow-inner overflow-hidden">
        {/* Messages view */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => {
            const isUser = msg.sender === "USER";

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 max-w-[85%] ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isUser ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"
                  }`}
                >
                  {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div
                  className={`rounded-2xl p-3.5 text-xs leading-relaxed shadow-2xs ${
                    isUser
                      ? "bg-amber-600 text-white rounded-tr-xs"
                      : "bg-white text-slate-900 border border-slate-200/80 rounded-tl-xs whitespace-pre-line"
                  }`}
                >
                  <div>{msg.text}</div>

                  {/* Pending Action Confirmation Buttons */}
                  {msg.actionPending && msg.actionData && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmAction(msg.id, msg.actionData)}
                        disabled={isSending}
                        className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition-all"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        <span>Yes, Record This</span>
                      </button>

                      <button
                        onClick={() =>
                          setMessages((prev) =>
                            prev.map((m) => (m.id === msg.id ? { ...m, actionPending: false } : m))
                          )
                        }
                        className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <div className={`mt-1 text-[10px] text-right ${isUser ? "text-amber-200" : "text-slate-400"}`}>
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-200 bg-white p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask anything or record e.g. 'Sold 20 cement to Musa'..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSending}
              className="flex-1 min-h-[46px] rounded-2xl border border-slate-300 px-4 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:scale-95 disabled:opacity-50 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Integration Note */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1.5">
        <div className="font-bold text-slate-800 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          <span>Real WhatsApp Cloud API Ready</span>
        </div>
        <p>
          This assistant uses the exact same backend engine as your physical WhatsApp connection. Webhook endpoint: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px]">POST /api/whatsapp</code>.
        </p>
      </div>
    </div>
  );
}
