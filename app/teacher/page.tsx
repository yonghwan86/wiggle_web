import { TeacherApp } from "@/app/components/TeacherApp";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  if (process.env.NODE_ENV === "production" && !(await requireTeacher())) redirect("/api/auth/google/start?return_to=%2Fteacher");
  return <TeacherApp />;
}
