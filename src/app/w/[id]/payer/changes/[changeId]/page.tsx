import type { Metadata } from "next";
import { SimulationBand } from "@/ui/brand";
import { ThemeToggle } from "@/ui/layout/ThemeToggle";
import { ChangeConfirmation } from "@/ui/workspace/ChangeConfirmation";

export const metadata: Metadata = { title: "Confirm change", robots: { index: false, follow: false } };

export default async function ChangePage({ params }: { params: Promise<{ id: string; changeId: string }> }) {
  const { id, changeId } = await params;
  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-20">
        <SimulationBand />
      </div>
      <div className="mx-auto flex max-w-[1344px] justify-end px-4 pt-3 md:px-8">
        <ThemeToggle />
      </div>
      <main id="main">
        <ChangeConfirmation workspaceId={id} changeId={changeId} />
      </main>
    </div>
  );
}
