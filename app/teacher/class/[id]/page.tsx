import { TeacherApp } from "@/app/components/TeacherApp";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function TeacherClassPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (process.env.NODE_ENV === "production" && !(await requireTeacher())) redirect(`/api/auth/google/start?return_to=${encodeURIComponent(`/teacher/class/${id}`)}`);
  return <TeacherApp classroomId={id} />;
}
