"use client";

import { AccessDenied } from "@/lib/access-denied";
import { useAuth } from "@/lib/auth-context";

// Client-side gate for every /admin page. This is the UX layer only: a normal
// user who types /admin sees a clear "Access denied" state instead of a broken
// page. The security boundary is server-side, where every /api/admin route is
// behind requireAuth + requireSuperAdmin and returns 403 for non-admins.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "SUPER_ADMIN") return <AccessDenied />;
  return <>{children}</>;
}
