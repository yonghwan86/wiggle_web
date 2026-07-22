import { bindings } from "@/db/runtime";
import { jsonError, noStoreJson, requireTeacher, sameOrigin } from "@/lib/security";
import { configuredSubscriptionProvider, subscriptionCapability } from "@/lib/subscriptions";

export async function GET() {
  const teacher = await requireTeacher();
  if (!teacher) return jsonError("교사 로그인이 필요해요.", 401);
  const entitlement = await bindings().DB.prepare(`SELECT plan_code AS planCode, status, current_period_end AS currentPeriodEnd FROM subscription_entitlements WHERE teacher_id = ?`).bind(teacher.id).first();
  return noStoreJson({ capability: subscriptionCapability(), entitlement: entitlement ?? { planCode: "free", status: "disabled", currentPeriodEnd: null } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("요청 출처를 확인할 수 없어요.", 403);
  const teacher = await requireTeacher();
  if (!teacher) return jsonError("교사 로그인이 필요해요.", 401);
  const provider = configuredSubscriptionProvider();
  if (!subscriptionCapability().enabled || !provider) return noStoreJson({ error: "결제 제공자가 아직 연결되지 않았어요.", code: "SUBSCRIPTIONS_DISABLED" }, { status: 503 });
  return jsonError("지원하지 않는 요청이에요.");
}
