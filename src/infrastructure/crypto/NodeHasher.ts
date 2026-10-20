import { createHash } from "node:crypto";
import type { HasherPort } from "@/domain/ports/HasherPort";

export class NodeHasher implements HasherPort {
  sha256Hex(input: string): string {
    return createHash("sha256").update(input, "utf8").digest("hex");
  }
}
