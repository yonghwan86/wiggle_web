import { bindings } from "@/db/runtime";
import { noStoreJson } from "@/lib/security";
import { configuredSubscriptionProvider, subscriptionCapability, verifyAndApplySubscriptionWebhook } from "@/lib/subscriptions";

export async function POST(request: Request) {
  const provider = configuredSubscriptionProvider();
  if (!subscriptionCapability().enabled || !provider) return noStoreJson({ error: "Subscription webhook is disabled.", code: "SUBSCRIPTIONS_DISABLED" }, { status: 503 });
  const result = await verifyAndApplySubscriptionWebhook(bindings().DB, provider, request);
  if (!result.ok) return noStoreJson({ error: "Invalid webhook signature." }, { status: 401 });
  return noStoreJson({ received: true, duplicate: result.duplicate, stale: result.stale });
}
