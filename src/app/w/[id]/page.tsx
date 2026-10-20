import type { Metadata } from "next";
import { WorkspaceApp } from "@/ui/workspace/WorkspaceApp";
import type { ActorRole } from "@/ui/lib/api";

export const metadata: Metadata = { title: "Workspace", robots: { index: false, follow: false } };

const ROLES: readonly ActorRole[] = ["student", "payer", "evaluator"];

export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string }> }) {
  const { id } = await params;
  const { as } = await searchParams;
  const role = ROLES.includes(as as ActorRole) ? (as as ActorRole) : "student";
  return <WorkspaceApp key={role} workspaceId={id} role={role} />;
}
