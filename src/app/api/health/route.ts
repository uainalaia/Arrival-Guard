import { NextResponse } from "next/server";
import { getPool } from "@/infrastructure/db/client";

export const dynamic = "force-dynamic";

// Salud del servicio para smoke y monitoreo. No devuelve configuración ni secretos.
export async function GET() {
  let database: "ok" | "error" = "ok";
  try {
    await getPool().query("select 1");
  } catch {
    database = "error";
  }
  return NextResponse.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      service: "arrivalguard",
      database,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      environment: process.env.VERCEL_ENV ?? "local",
      synthetic: true,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
