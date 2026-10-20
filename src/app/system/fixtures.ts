import type { CashProjectionDTO, CaseViewDTO, JourneyStationDTO, RouteEvaluationDTO, RoutingDTO } from "@/application/dto/CaseDTO";
import type { MoneyDTO } from "@/application/dto/MoneyDTO";

// Datos estáticos del escenario base (BUILD_PROMPT 6) para la guía viva. Son sintéticos y solo ilustran los
// componentes; la app muestra lo que entrega el servidor.

const usd = (minor: string): MoneyDTO => ({ currency: "USD", minor });
const cny = (minor: string): MoneyDTO => ({ currency: "CNY", minor });

export const START = "2026-10-20T09:00:00.000Z";
export const COMPARED_AT = "2026-10-20T09:02:00.000Z";
export const INVOICE_NET = cny("2000000");

function route(routeId: string, channel: string, hours: number, debit: string, net: string, reasons: string[], registered = true): RouteEvaluationDTO {
  return {
    routeId,
    channel,
    quoteId: `system-${routeId}`,
    arrivalHours: hours,
    arrivesAt: new Date(Date.parse(COMPARED_AT) + hours * 3_600_000).toISOString(),
    quoteExpiresAt: "2026-10-20T09:32:00.000Z",
    debit: usd(debit),
    net: cny(net),
    receiverMasked: registered ? "•••• 0098" : "•••• 5512",
    receiverIsRegistered: registered,
    reasons,
  };
}

export const ROUTING_48H: RoutingDTO = {
  selectedRouteId: "B",
  blockers: [],
  viable: [route("B", "EDU_PAY_PARTNER", 24, "286000", "2000000", []), route("D", "EXPRESS_EDU", 2, "288000", "2000000", [])],
  discarded: [
    route("A", "BANK_WIRE_STANDARD", 72, "282000", "2000000", ["DEADLINE_MISSED"]),
    route("C", "FX_BROKER_FAST", 12, "284000", "1980000", ["NET_INSUFFICIENT"]),
    route("E", "UNVERIFIED_AGENT", 12, "283000", "2000000", ["RECEIVER_NOT_ALLOWED"], false),
  ],
};

export const ROUTING_6H: RoutingDTO = {
  selectedRouteId: "D",
  blockers: [],
  viable: [route("D", "EXPRESS_EDU", 2, "288000", "2000000", [])],
  discarded: [
    route("A", "BANK_WIRE_STANDARD", 72, "282000", "2000000", ["DEADLINE_MISSED"]),
    route("B", "EDU_PAY_PARTNER", 24, "286000", "2000000", ["DEADLINE_MISSED"]),
    route("C", "FX_BROKER_FAST", 12, "284000", "1980000", ["DEADLINE_MISSED", "NET_INSUFFICIENT"]),
    route("E", "UNVERIFIED_AGENT", 12, "283000", "2000000", ["DEADLINE_MISSED", "RECEIVER_NOT_ALLOWED"], false),
  ],
};

export const ROUTING_1H: RoutingDTO = {
  selectedRouteId: null,
  blockers: ["DEADLINE_MISSED"],
  viable: [],
  discarded: ROUTING_6H.discarded.concat(route("D", "EXPRESS_EDU", 2, "288000", "2000000", ["DEADLINE_MISSED"])),
};

const at = (hhmm: string) => `2026-10-20T${hhmm}:00.000Z`;

type Stations = readonly JourneyStationDTO[];
const station = (key: JourneyStationDTO["key"], state: JourneyStationDTO["state"], time: string | null = null, source: JourneyStationDTO["source"] = null): JourneyStationDTO => ({
  key,
  state,
  at: time ? at(time) : null,
  source,
});

export const JOURNEYS: { readonly label: string; readonly stations: Stations }[] = [
  {
    label: "Plan ready, waiting for Carlos",
    stations: [station("PLANNED", "done", "09:02", "SYSTEM"), station("APPROVED", "current"), station("SENT", "pending"), station("ACCEPTED", "pending"), station("UNIVERSITY", "pending"), station("CREDITED", "pending")],
  },
  {
    label: "Approved, ready to send",
    stations: [station("PLANNED", "done", "09:02", "SYSTEM"), station("APPROVED", "done", "09:07", "PAYER"), station("SENT", "current"), station("ACCEPTED", "pending"), station("UNIVERSITY", "pending"), station("CREDITED", "pending")],
  },
  {
    label: "Checking with the provider",
    stations: [
      station("PLANNED", "done", "09:09", "SYSTEM"),
      station("APPROVED", "done", "09:12", "PAYER"),
      station("SENT", "done", "09:13", "SYSTEM"),
      station("ACCEPTED", "uncertain"),
      station("UNIVERSITY", "pending"),
      station("CREDITED", "pending"),
    ],
  },
  {
    label: "Waiting for the university",
    stations: [
      station("PLANNED", "done", "09:09", "SYSTEM"),
      station("APPROVED", "done", "09:12", "PAYER"),
      station("SENT", "done", "09:13", "SYSTEM"),
      station("ACCEPTED", "done", "09:14", "PROVIDER"),
      station("UNIVERSITY", "current"),
      station("CREDITED", "pending"),
    ],
  },
  {
    label: "Credited by the university",
    stations: [
      station("PLANNED", "done", "09:09", "SYSTEM"),
      station("APPROVED", "done", "09:12", "PAYER"),
      station("SENT", "done", "09:13", "SYSTEM"),
      station("ACCEPTED", "done", "09:14", "PROVIDER"),
      station("UNIVERSITY", "done", "11:14", "UNIVERSITY"),
      station("CREDITED", "done", "11:14", "UNIVERSITY"),
    ],
  },
  {
    label: "Blocked at approval",
    stations: [station("PLANNED", "done", "09:02", "SYSTEM"), station("APPROVED", "blocked"), station("SENT", "pending"), station("ACCEPTED", "pending"), station("UNIVERSITY", "pending"), station("CREDITED", "pending")],
  },
];

export const FUNDS_BEFORE: CaseViewDTO["familyFunds"] = {
  accountMasked: "•••• 4821",
  balance: usd("500000"),
  arrivalReserve: usd("180000"),
  arrivalReserveTotal: usd("180000"),
  activeHolds: usd("0"),
  availableForTuition: usd("320000"),
  tuitionLimit: usd("290000"),
  minimumReserve: usd("180000"),
};

export const FUNDS_HELD: CaseViewDTO["familyFunds"] = { ...FUNDS_BEFORE, activeHolds: usd("288000"), availableForTuition: usd("32000") };

export const CASH_DEFICIT: CashProjectionDTO["byCurrency"][number] = {
  currency: "USD",
  confirmedBalance: usd("500000"),
  arrivalReserve: usd("180000"),
  activeHolds: usd("0"),
  plannedDebits: usd("286000"),
  balanceAfterPlanned: usd("214000"),
  availableForArrivalExpenses: usd("214000"),
  expectedExpenses: usd("250000"),
  pendingObligations: usd("0"),
};

export const CASH_COVERED: CashProjectionDTO["byCurrency"][number] = { ...CASH_DEFICIT, expectedExpenses: usd("180000") };

// Huellas ilustrativas (DESIGN_PLAN 8): la app muestra el SHA-256 real que calcula el servidor.
export const FINGERPRINTS = [
  { label: "First approval, route B", time: "Tue 20 Oct, 09:07", value: "3f9a21c7e04b88d1c2a7f0b93e6d5148a1c0e9f2b7d63a58e4c1f09b2d7a6e35" },
  { label: "Second approval, route D", time: "Tue 20 Oct, 09:12", value: "b7710e2a9c4f5d63e08a1b27f4c93d65a2e7f1c08b49d36e5f2a7c10d8b3e941" },
  { label: "Arrival transfer approval", time: "Tue 20 Oct, 09:31", value: "5c02e8a14b9d7f36a1e5c28d0f7b49e3c6a2d15f8e0b74c93d1a6f2e85b0c47d" },
] as const;

export const SAMPLE = { usd, cny } as const;
