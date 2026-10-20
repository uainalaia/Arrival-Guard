import type { Metadata } from "next";
import { SimulationBand } from "@/ui/brand";
import { ThemeToggle } from "@/ui/layout/ThemeToggle";
import { ApprovalDocument } from "@/ui/workspace/ApprovalDocument";

export const metadata: Metadata = { title: "Payment approval", robots: { index: false, follow: false } };

export default async function ApprovalPage({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-20">
        <SimulationBand />
      </div>
      <div className="mx-auto flex max-w-[1344px] justify-end px-4 pt-3 md:px-8">
        <ThemeToggle />
      </div>
      <main id="main">
        <ApprovalDocument workspaceId={id} planId={planId} />
      </main>
    </div>
  );
}
