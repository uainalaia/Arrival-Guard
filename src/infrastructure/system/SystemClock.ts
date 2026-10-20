import { randomUUID } from "node:crypto";
import type { IdGeneratorPort, RealClockPort } from "@/domain/ports/ClockPort";
import { RealInstant } from "@/domain/time/Instant";

export class SystemClock implements RealClockPort {
  now(): RealInstant {
    return RealInstant.fromDate(new Date());
  }
}

export class UuidGenerator implements IdGeneratorPort {
  newId(): string {
    return randomUUID();
  }
}
