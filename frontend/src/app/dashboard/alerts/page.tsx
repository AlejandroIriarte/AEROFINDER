// Redirige a /dashboard/detections (tab "Por revisar" reemplaza esta página)
import { redirect } from "next/navigation";

export default function AlertsPage() {
  redirect("/dashboard/detections");
}
