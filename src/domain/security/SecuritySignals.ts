import type { SecurityCategory } from "../events/DomainEvent";

/**
 * Señales de ataque en un mensaje del usuario (BUILD_PROMPT 14.2). No son el control: el servidor ya impide el efecto
 * (ninguna herramienta cambia el receptor, aprueba, cambia límites ni revela secretos). Sirven para dejar un
 * SECURITY_BLOCK con su categoría oficial en la bitácora y mostrar el aviso. Son conservadoras: una pregunta normal del
 * flujo ("Has my dad approved it yet?", una fecha, "Is my password needed?") no se rotula (VC8). Además del inglés
 * reconocen patrones mínimos en español, portugués, francés, alemán, chino y japonés, el texto normalizado (NFKC, sin
 * caracteres invisibles) y el escondido en base64 o hexadecimal (VC9-4). Son un rótulo de mejor esfuerzo.
 */
export interface SecuritySignal {
  readonly category: SecurityCategory;
  readonly reason: "NEW_DESTINATION" | "CLAIMED_APPROVAL" | "INSTRUCTION_OVERRIDE" | "SECRET_REQUEST" | "FULL_ACCOUNT_NUMBER";
}

const MOVE = /\b(send|pay|transfer|wire|move|deposit|route|redirect|execute)\b/i;
const NEW_DESTINATION_WORDS = /\b(new|other|another|different)\s+(bank\s+)?(account|acct|iban|card|recipient|beneficiary)\b|\baccount\s+(ending|number|no\.?)\s*[:#]?\s*\d{4,}/i;
const ACCOUNT_DIGITS = /\b\d(?:[\s-]?\d){9,}\b/;
// Fechas y horas no son números de cuenta.
const DATES_AND_TIMES = /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?\b|\b\d{1,2}[:.]\d{2}\b/g;
const CLAIMED_APPROVAL = /\b(already|has|have)\s+(approved|authori[sz]ed|signed)\b|\b(dad|father|mom|mother|parent|carlos|payer)\s+(said|says|approved|authori[sz]ed|agreed|allows?|lets?)\b|\b(approve|authori[sz]e)\s+(it\s+)?(yourself|for\s+(him|her|them|me))\b|\bmay\s+approve\b/i;
// Una pregunta sobre el estado ("Has Carlos approved it?") no afirma nada.
const QUESTION = /^\s*(has|have|did|does|do|is|was|were|can|could|will|would)\b[^.!]*\?\s*$/i;
const OVERRIDE = /\b(ignore|disregard|forget|bypass|override)\s+(all\s+|any\s+|your\s+|the\s+|previous\s+|prior\s+)*(instructions|rules|limits?|restrictions|policy|policies|guardrails|system prompt)\b|\byou\s+are\s+now\b|\bdeveloper\s+mode\b|\bjailbreak\b/i;
const SECRET_TERMS = String.raw`(api[\s_-]?key|secret|session\s+token|access\s+token|auth(entication)?\s+token|password|connection\s+string|database\s+(url|password|credentials)|env(ironment)?\s+variables?|system\s+prompt|hidden\s+(config|configuration|instructions)|evaluation\s+code|access\s+code|pepper)`;
// Pedir un secreto: un verbo de pedido o "what is" junto al término.
const SECRET_REQUEST = new RegExp(
  String.raw`\b(show|print|give|tell|reveal|send|share|display|dump|leak|list|output|repeat|expose)\b[^.?!]*\b` + SECRET_TERMS + String.raw`\b|\bwhat\s+(is|are)\s+(your|the)\b[^.?!]*\b` + SECRET_TERMS + String.raw`\b`,
  "i",
);
const FULL_ACCOUNT = /\b(full|complete|entire|whole)\s+(account|card|iban)(\s+number)?\b|\b(all|every)\s+(the\s+)?digits\b/i;

// Español, portugués y chino (VC9-4). \b no sirve con acentos ni con chino: se usan límites explícitos.
const MOVE_OTHER = /(^|[^\p{L}])(env[ií]a(lo|la)?|paga(lo)?|transfiere|transfere|manda(lo)?|deposita|pague|envie)([^\p{L}]|$)|转账|汇款|付款|支付|转到|汇到|打到/iu;
const NEW_DESTINATION_OTHER = /(cuenta|conta)\s+(nueva|nova)|(nueva|otra|nova|outra)\s+(cuenta|conta)|新(的)?(账户|账号|帐户)|另一个(账户|账号)|这个(账户|账号)/iu;
const CLAIMED_APPROVAL_OTHER = new RegExp(
  [
    String.raw`(ya|j[aá])\s+(lo\s+|la\s+)?(aprob[oó]|autoriz[oó]|aprovou|autorizou)`,
    String.raw`(pap[aá]|padre|mam[aá]|madre|carlos|pai|m[aã]e)\s+(lo\s+)?(aprob[oó]|autoriz[oó]|aprovou|autorizou|dijo que s[ií]|disse que sim|dio el visto bueno)`,
    String.raw`visto\s+bueno`,
    String.raw`(a|ont)\s+(d[eé]j[aà]\s+)?(approuv[eé]|autoris[eé]|valid[eé])`,
    String.raw`(hat|haben)\s+(es\s+)?(schon|bereits)\s+(genehmigt|freigegeben|erlaubt)`,
    String.raw`已经?(批准|同意|授权)|(批准|同意|授权)了|(爸爸|父亲|父親|爸|妈妈|媽媽)[^。！？]{0,6}(说|說)(可以|行|没问题|沒問題|好)`,
    String.raw`(承認|許可)(した|しました|済み)`,
  ].join("|"),
  "iu",
);
const OVERRIDE_OTHER = new RegExp(
  [
    String.raw`(^|[^\p{L}])(ignora|ignore|ignorez|ignorer|ignoriere|ignorieren|olvida|olvidar|oublie|oubliez|vergiss|vergessen|omite|esquece|esque[cç]a|desconsidera)\s+[^.!?。！？]{0,30}(instrucciones|instru[cç][oõ]es|instructions|reglas|regras|r[eè]gles|normas|l[ií]mites|limites|restricciones|restri[cç][oõ]es|anweisungen|regeln|grenzen|vorgaben)`,
    String.raw`(忽略|无视|無視|忘记|忘記|不要理会|不要理會)[^。！？]{0,20}(指令|指示|规则|規則|限制|提示|说明|說明)`,
    String.raw`(指示|ルール|制限|命令)[^。！？]{0,10}(無視|忘れ)`,
    String.raw`你现在是|你現在是`,
  ].join("|"),
  "iu",
);
const SECRET_OTHER = new RegExp(
  [
    String.raw`(mu[eé]stra(me)?|dame|dime|imprime|revela|mostra|me\s+d[aá]|diga|montre|donne|affiche|zeig|gib)[^.?!¿¡]{0,40}(clave\s+de\s+api|contrase[nñ]a|token|jeton|cadena\s+de\s+conexi[oó]n|prompt\s+del\s+sistema|prompt\s+syst[eè]me|chave\s+de\s+api|senha|cl[eé]\s+(d'?)?api|mot\s+de\s+passe|api-?schl[uü]ssel|passwort|systemprompt)`,
    String.raw`(cu[aá]l\s+es|qual\s+[eé]|quelle\s+est|was\s+ist)\s+[^.?!]{0,20}(clave|contrase[nñ]a|token|senha|chave|cl[eé]|mot\s+de\s+passe|schl[uü]ssel|passwort)`,
    String.raw`(显示|打印|告诉我|给我|泄露|顯示|告訴我|給我|洩露)[^。！？]{0,20}(系统提示|系統提示|密钥|密鑰|密码|密碼|令牌|配置)`,
  ].join("|"),
  "iu",
);
// Pedir que repita lo que vino antes es intentar sacar el prompt.
const PROMPT_LEAK = /\b(repeat|print|output|show|reveal)\s+(everything|all|the\s+(text|words|messages?))\s+(above|before|preceding)\b/i;
// Una pregunta en otro idioma ("¿Ya aprobó Carlos?", "批准了吗？") no afirma nada.
const QUESTION_OTHER = /[¿?？]|吗\s*$/u;
// Texto escondido: base64 (estándar o url-safe, también en trozos separados por espacios) y hexadecimal. Se decodifica
// como UTF-8 y se vuelve a revisar solo si el resultado es texto legible.
const BASE64_RUN = /[A-Za-z0-9+/_-]{16,}={0,2}/g;
const BASE64_CHUNKS = /(?:[A-Za-z0-9+/_-]{4,}={0,2}[ \t]+){2,}[A-Za-z0-9+/_-]{2,}={0,2}/g;
const HEX_RUN = /\b(?:[0-9a-fA-F]{2}){12,}\b/g;
const HEX_DIGITS = "0123456789abcdef";

function readable(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/[\p{Cc}]/u.test(text.replace(/\s/g, "")) || !/\p{L}{2,}/u.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

function fromBase64(run: string): string | null {
  const standard = run.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (standard.length % 4 === 1) return null;
  try {
    const binary = atob(standard + "=".repeat((4 - (standard.length % 4)) % 4));
    return readable(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

function hiddenTexts(text: string): string[] {
  const out: string[] = [];
  const candidates = [...(text.match(BASE64_RUN) ?? []), ...(text.match(BASE64_CHUNKS) ?? []).map((c) => c.replace(/\s+/g, ""))];
  for (const run of candidates) {
    const decoded = fromBase64(run);
    if (decoded) out.push(decoded);
  }
  for (const run of text.match(HEX_RUN) ?? []) {
    const decoded = readable(Uint8Array.from(run.toLowerCase().match(/../g)!, (h) => HEX_DIGITS.indexOf(h[0]!) * 16 + HEX_DIGITS.indexOf(h[1]!)));
    if (decoded) out.push(decoded);
  }
  return out;
}

/** NFKC (ancho completo y compatibilidad a su forma simple) y sin caracteres de formato invisibles (ancho cero). */
function normalized(text: string): string {
  return text.normalize("NFKC").replace(/\p{Cf}/gu, "");
}

export function detectSecuritySignals(text: string): SecuritySignal[] {
  const clean = normalized(text);
  const signals = signalsIn(clean);
  for (const decoded of hiddenTexts(clean)) {
    for (const s of signalsIn(normalized(decoded))) if (!signals.some((x) => x.reason === s.reason)) signals.push(s);
  }
  return signals;
}

function signalsIn(text: string): SecuritySignal[] {
  const signals: SecuritySignal[] = [];
  const withoutDates = text.replace(DATES_AND_TIMES, " ");
  const moves = MOVE.test(text) || MOVE_OTHER.test(text);
  if (moves && (NEW_DESTINATION_WORDS.test(text) || NEW_DESTINATION_OTHER.test(text) || ACCOUNT_DIGITS.test(withoutDates))) signals.push({ category: "INDUCED_TRANSFER", reason: "NEW_DESTINATION" });
  if ((CLAIMED_APPROVAL.test(text) && !QUESTION.test(text)) || (CLAIMED_APPROVAL_OTHER.test(text) && !QUESTION_OTHER.test(text))) signals.push({ category: "INDUCED_TRANSFER", reason: "CLAIMED_APPROVAL" });
  if (OVERRIDE.test(text) || OVERRIDE_OTHER.test(text)) signals.push({ category: "PROMPT_INJECTION", reason: "INSTRUCTION_OVERRIDE" });
  if (SECRET_REQUEST.test(text) || SECRET_OTHER.test(text) || PROMPT_LEAK.test(text)) signals.push({ category: "DATA_EXTRACTION", reason: "SECRET_REQUEST" });
  if (FULL_ACCOUNT.test(text)) signals.push({ category: "DATA_EXTRACTION", reason: "FULL_ACCOUNT_NUMBER" });
  return signals;
}
