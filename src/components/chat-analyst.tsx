"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { useYearStore } from "@/hooks/use-year-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const SUGGESTED_QUESTIONS = [
  "What happened in the market in 2008?",
  "Compare GE and Ford performance",
  "Which sectors were hit hardest?",
  "Explain the biggest volume anomaly",
];

export function ChatAnalyst() {
  const year = useYearStore((s) => s.year);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    // Greet on mount
    setMessages([
      {
        role: "assistant",
        content: `Hello! I'm your AI market analyst. I have access to ${year} NYSE data — top movers, volume anomalies, sector performance, and per-ticker history. Ask me anything about the market.`,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    const userMsg: Message = { role: "user", content: q, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, year }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.answer ?? "Sorry, I couldn't process that.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // If the response includes a ticker to open
      if (data.open_ticker) {
        selectTicker(data.open_ticker);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error processing your request.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="col-span-12 lg:col-span-4 flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          AI Market Analyst
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Chat with the data — asks questions in natural language.
        </p>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col">
        <ScrollArea className="flex-1 h-[280px] pr-2" viewportRef={scrollRef as any}>
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {m.role === "assistant" && (
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-1.5 text-xs",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40"
                  )}
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="bg-muted/40 rounded-lg px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggested questions */}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-1 mt-2 mb-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="text-[10px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors flex items-center gap-1"
              >
                <Sparkles className="h-2.5 w-2.5 text-primary" />
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 mt-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about the market…"
            className="h-8 text-xs"
            disabled={loading}
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()} size="sm" className="h-8 px-2">
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
