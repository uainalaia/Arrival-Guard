/** Lee `--nombre valor` o `--nombre=valor` de la línea de comandos. */
export function getArg(name: string, argv: string[] = process.argv): string | undefined {
  const flag = `--${name}`;
  const index = argv.indexOf(flag);
  if (index >= 0) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

export function hasFlag(name: string, argv: string[] = process.argv): boolean {
  return argv.includes(`--${name}`);
}

/** Corre `main` y deja el código de salida sin `process.exit()` (en Windows corta sockets que se están cerrando). */
export function runMain(main: () => Promise<number | void>): void {
  main()
    .then((code) => {
      process.exitCode = code ?? 0;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
