// Escenarios sintéticos como configuración tipada (BUILD_PROMPT 6). Los montos son decimales exactos en texto;
// se convierten a Money con Money.fromDecimal al usarse. Ningún valor de escenario se reparte por el código.

export const SCENARIO_IDS = [
  "base",
  "deadline_impossible",
  "scholarship_deficit",
  "arrival_remittance",
  "overpayment_refund",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type TuitionRouteId = "A" | "B" | "C" | "D" | "E";
export type RemittanceRouteId = "R1" | "R2" | "R3";

export interface TuitionRouteConfig {
  readonly routeId: TuitionRouteId;
  readonly channel: string;
  readonly debitUsd: string;
  readonly netCny: string;
  readonly arrivalHours: number;
  /** A qué cuenta paga la ruta: la registrada por la universidad o una distinta (ruta E). */
  readonly receiver: "UNIVERSITY" | "UNVERIFIED_AGENT_ACCOUNT";
  /** Débito al recotizar la misma ruta (A3). Con la falla REQUOTE_ABOVE_MAX se usa `requote.aboveMaxDebitUsd`. */
  readonly requoteDebitUsd: string;
}

export interface RemittanceRouteConfig {
  readonly routeId: RemittanceRouteId;
  readonly channel: string;
  /** Débito para el neto de referencia `remittanceReferenceNetCny`; otros netos escalan lineal con redondeo bancario. */
  readonly debitUsd: string;
  readonly netCny: string;
  readonly arrivalHours: number;
}

export interface ScenarioDefinition {
  readonly id: ScenarioId;
  readonly label: string;
  readonly description: string;
  readonly servesFor: readonly string[];
  /** Hora virtual inicial del espacio (se muestra como "Tue 20 Oct, 09:00 virtual time"). */
  readonly startVirtualTime: string;
  readonly payer: {
    readonly displayName: string;
    readonly accountMasked: string;
    readonly balanceUsd: string;
  };
  readonly student: {
    readonly displayName: string;
    readonly localAccount: {
      readonly bankName: string;
      readonly masked: string;
      readonly status: "OPEN" | "PENDING_OPENING";
      readonly verified: boolean;
    };
  };
  readonly arrivalReserveUsd: string;
  /** Parte de la reserva de llegada ya consumida al iniciar el escenario. */
  readonly arrivalReserveUsedUsd: string;
  readonly policy: { readonly maxTuitionDebitUsd: string; readonly reserveUsd: string };
  readonly obligation: {
    readonly netDueCny: string;
    readonly reference: string;
    readonly receiverDisplayName: string;
    readonly receiverMasked: string;
    readonly dueInHours: number;
    readonly status: "PENDING" | "CREDITED";
    /** Débito histórico ya acreditado (escenarios que empiezan con la matrícula pagada). */
    readonly historicalDebitUsd?: string;
    /** Neto pagado históricamente a la universidad, si difiere del adeudado (sobrepago). */
    readonly historicalPaidCny?: string;
  };
  readonly defaultTargetArrivalHours: number;
  /** Objetivo que pide la estudiante en el guion del escenario, si es distinto del por defecto. */
  readonly requestedTargetArrivalHours?: number;
  readonly scholarship: {
    readonly amountCny: string;
    readonly status: "AWARDED_NOT_DISBURSED";
    readonly expectedInDays: number;
    readonly condition: "LOCAL_ACCOUNT_OPEN";
  };
  readonly expectedArrivalExpenseUsd: string;
  readonly quoteValidityMinutes: number;
  readonly approvalValidityHours: number;
  readonly acceptedTuitionChannels: readonly string[];
  readonly tuitionRoutes: readonly TuitionRouteConfig[];
  readonly requote: { readonly aboveMaxDebitUsd: string };
  readonly remittanceReferenceNetCny: string;
  readonly remittanceRoutes: readonly RemittanceRouteConfig[];
  readonly mandate?: {
    readonly purpose: "ARRIVAL_EXPENSES";
    readonly periodMaxUsd: string;
    readonly periodDays: number;
    readonly expiresInDays: number;
  };
  readonly refund?: {
    readonly verifiedExcessCny: string;
    readonly settlementUsd: string;
    /** Horas virtuales hasta que la institución liquida un reclamo aprobado. */
    readonly settlesInHours: number;
  };
  /** Horas virtuales extra de la falla DELAY_INSTITUTION_CREDIT. */
  readonly delayedCreditExtraHours: number;
}
