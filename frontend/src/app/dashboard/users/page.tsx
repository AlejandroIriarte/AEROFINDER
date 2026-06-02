// Redirige a la nueva ubicación bajo superadmin
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UsersRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/superadmin/users"); }, [router]);
  return null;
}
