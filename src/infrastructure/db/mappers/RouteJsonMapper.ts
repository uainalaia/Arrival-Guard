import { Money, type MoneyJSON } from "@/domain/money/Money";
import type { TuitionRoutingResult } from "@/domain/policy/PolicyEngine";
import { isReasonCode, type ReasonCode } from "@/domain/policy/ReasonCode";
import type { RouteEvaluation, RouteQuote } from "@/domain/policy/RouteQuote";
import { VirtualInstant } from "@/domain/time/Instant";

export interface RouteQuoteJSON {
  readonly quoteId: string;
  readonly routeId: string;
  readonly channel: string;
  readonly receiverId: string;
  readonly debit: MoneyJSON;
  readonly net: MoneyJSON;
  readonly arrivalMinutes: number;
  readonly quotedAt: string;
  readonly expiresAt: string;
  readonly providerMessage: string | null;
}

export interface RouteEvaluationJSON {
  readonly quoteId: string;
  readonly routeId: string;
  readonly channel: string;
  readonly receiverId: string;
  readonly debit: MoneyJSON;
  readonly net: MoneyJSON;
  readonly arrivalMinutes: number;
  readonly arrivesAt: string;
  readonly expiresAt: string;
  readonly reasons: readonly string[];
}

export interface RoutingResultJSON {
  readonly blockers: readonly string[];
  readonly viable: readonly RouteEvaluationJSON[];
  readonly discarded: readonly RouteEvaluationJSON[];
  readonly selectedRouteId: string | null;
}

/** Serializa cotizaciones y evaluaciones para jsonb: dinero como { currency, minor } y horas como ISO. */
export class RouteJsonMapper {
  static quoteToJSON(quote: RouteQuote): RouteQuoteJSON {
    return {
      quoteId: quote.quoteId,
      routeId: quote.routeId,
      channel: quote.channel,
      receiverId: quote.receiverId,
      debit: quote.debit.toJSON(),
      net: quote.net.toJSON(),
      arrivalMinutes: quote.arrivalMinutes,
      quotedAt: quote.quotedAt.toISOString(),
      expiresAt: quote.expiresAt.toISOString(),
      providerMessage: quote.providerMessage,
    };
  }

  static quoteFromJSON(json: RouteQuoteJSON): RouteQuote {
    return {
      quoteId: json.quoteId,
      routeId: json.routeId,
      channel: json.channel,
      receiverId: json.receiverId,
      debit: Money.fromJSON(json.debit),
      net: Money.fromJSON(json.net),
      arrivalMinutes: json.arrivalMinutes,
      quotedAt: VirtualInstant.fromISO(json.quotedAt),
      expiresAt: VirtualInstant.fromISO(json.expiresAt),
      providerMessage: json.providerMessage,
    };
  }

  static evaluationToJSON(evaluation: RouteEvaluation): RouteEvaluationJSON {
    return {
      quoteId: evaluation.quoteId,
      routeId: evaluation.routeId,
      channel: evaluation.channel,
      receiverId: evaluation.receiverId,
      debit: evaluation.debit.toJSON(),
      net: evaluation.net.toJSON(),
      arrivalMinutes: evaluation.arrivalMinutes,
      arrivesAt: evaluation.arrivesAt.toISOString(),
      expiresAt: evaluation.expiresAt.toISOString(),
      reasons: [...evaluation.reasons],
    };
  }

  static evaluationFromJSON(json: RouteEvaluationJSON): RouteEvaluation {
    return {
      quoteId: json.quoteId,
      routeId: json.routeId,
      channel: json.channel,
      receiverId: json.receiverId,
      debit: Money.fromJSON(json.debit),
      net: Money.fromJSON(json.net),
      arrivalMinutes: json.arrivalMinutes,
      arrivesAt: VirtualInstant.fromISO(json.arrivesAt),
      expiresAt: VirtualInstant.fromISO(json.expiresAt),
      reasons: reasonsFrom(json.reasons),
    };
  }

  static resultToJSON(result: TuitionRoutingResult): RoutingResultJSON {
    return {
      blockers: [...result.blockers],
      viable: result.viable.map(RouteJsonMapper.evaluationToJSON),
      discarded: result.discarded.map(RouteJsonMapper.evaluationToJSON),
      selectedRouteId: result.selected?.routeId ?? null,
    };
  }

  static resultFromJSON(json: RoutingResultJSON): TuitionRoutingResult {
    const viable = json.viable.map(RouteJsonMapper.evaluationFromJSON);
    return {
      blockers: reasonsFrom(json.blockers),
      viable,
      discarded: json.discarded.map(RouteJsonMapper.evaluationFromJSON),
      selected: viable.find((v) => v.routeId === json.selectedRouteId) ?? null,
    };
  }
}

function reasonsFrom(values: readonly string[]): ReasonCode[] {
  return values.filter(isReasonCode);
}
