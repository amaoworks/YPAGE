import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "管理" };

export default function AdminPage() {
  return <AdminView />;
}
