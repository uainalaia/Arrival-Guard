import { Money } from "@/domain/money/Money";
import type { MoneyDTO } from "../dto/MoneyDTO";

/** Único punto de conversión entre Money (bigint) y MoneyDTO (string). */
export class MoneyMapper {
  static toDTO(money: Money): MoneyDTO {
    return { currency: money.currency, minor: money.minor.toString() };
  }

  static toDTOOrNull(money: Money | null | undefined): MoneyDTO | null {
    return money ? MoneyMapper.toDTO(money) : null;
  }

  static fromDTO(dto: MoneyDTO): Money {
    return Money.fromMinorString(dto.currency, dto.minor);
  }
}
