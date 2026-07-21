import { TeacherApp } from "@/app/components/TeacherApp";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function TeacherClassPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (process.env.NODE_ENV === "production") await requireChatGPTUser(`/teacher/class/${encodeURIComponent(id)}`);
  return <TeacherApp classroomId={id} />;
}
