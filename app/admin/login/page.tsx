import { Suspense } from "react";
import { AdminLogin } from "@/components/AdminLogin";

export const metadata = { title: "Sign in — Devlore" };
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLogin />
    </Suspense>
  );
}
