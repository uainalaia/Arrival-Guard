// Aplica el tema guardado antes de pintar, para que no parpadee (UI_UX 15). Sin elección guardada manda la preferencia
// del sistema (tokens.css). Vive fuera del módulo cliente para poder usarse en el layout del servidor.
export const THEME_STORAGE_KEY = "ag-theme";

export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;
