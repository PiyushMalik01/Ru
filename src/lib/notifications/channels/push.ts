import { sendPushToUser } from "@/lib/push";
import type { DispatchInput } from "../types";

export async function deliverPush(input: DispatchInput): Promise<boolean> {
  try {
    await sendPushToUser(input.userId, {
      title: input.title,
      body: input.body ?? "",
      url: input.url ?? "/inbox",
    });
    return true;
  } catch (e) {
    console.error("[notify:push] failed", e);
    return false;
  }
}
