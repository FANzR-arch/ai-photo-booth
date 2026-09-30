export function printerReport(
  run: (binary: string, args: string[]) => { status: number | null; stdout?: string | null; error?: { code?: string } },
  readPpd?: (queue: string) => string,
): string;
