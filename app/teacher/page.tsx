import { TeacherApp } from "@/app/components/TeacherApp";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  if (process.env.NODE_ENV === "production") await requireChatGPTUser("/teacher");
  return <TeacherApp />;
}
