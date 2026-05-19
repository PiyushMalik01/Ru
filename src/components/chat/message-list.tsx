"use client";

import { motion } from "framer-motion";
import type { ChatMessage } from "@/lib/stores/chat-store";
import { MessageBubble } from "./message-bubble";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((m, i) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          <MessageBubble message={m} isLast={i === messages.length - 1} />
        </motion.div>
      ))}
    </div>
  );
}
