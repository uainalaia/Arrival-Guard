import { apiRoute } from "@/interfaces/http/route";
import { chatBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";
// Hasta 4 llamadas al modelo de 25 s cada una; no se empieza otra pasados 30 s (BUILD_PROMPT 13.2).
export const maxDuration = 60;

// Historial de la conversación activa del rol (texto y componentes del servidor de cada turno).
export const GET = apiRoute({ roles: ["student", "payer"], mutating: false }, async ({ actor, app }) => app.chat.history(actor));

// Un turno: el actor sale de la sesión; el modelo solo usa las herramientas de ese rol.
export const POST = apiRoute({ roles: ["student", "payer"], mutating: true, body: chatBody }, async ({ actor, body, app }) => app.chat.execute(actor, { message: body.message }));
