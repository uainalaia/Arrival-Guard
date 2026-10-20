import type { MoneyDTO } from "../dto/MoneyDTO";

export interface AiUsageDTO {
  readonly workspace: MoneyDTO;
  readonly daily: MoneyDTO;
  readonly workspaceBudget: MoneyDTO;
  readonly dailyBudget: MoneyDTO;
}

/** Micro-USD a centavos (redondeo hacia arriba: nunca se muestra menos de lo gastado). */
const cents = (micros: bigint): MoneyDTO => ({ currency: "USD", minor: ((micros + 9_999n) / 10_000n).toString() });

export class AiUsageMapper {
  static toDTO(u: { workspace: bigint; daily: bigint; workspaceBudget: bigint; dailyBudget: bigint }): AiUsageDTO {
    return { workspace: cents(u.workspace), daily: cents(u.daily), workspaceBudget: cents(u.workspaceBudget), dailyBudget: cents(u.dailyBudget) };
  }
}
