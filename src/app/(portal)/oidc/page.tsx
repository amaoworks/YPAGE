import type { Metadata } from "next";
import { OidcView } from "@/components/oidc-view";

export const metadata: Metadata = { title: "OIDC" };

export default function OidcPage() {
  return <OidcView />;
}
