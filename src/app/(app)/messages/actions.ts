"use server";
import { runAction } from "@/lib/action";
import { messageSchema, sendMessage } from "@/server/messages";

export async function sendMessageAction(raw: unknown) {
  return runAction(messageSchema, "message.send", raw, (i, u) => sendMessage(i, u));
}
