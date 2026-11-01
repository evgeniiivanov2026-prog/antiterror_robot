export interface ParsedCommand {
  name: string;
  args: string;
}

const COMMAND = /^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i;

export function parseCommand(text: string): ParsedCommand | null {
  const match = COMMAND.exec(text.trim());
  const name = match?.[1];
  if (!name) return null;
  return { name: name.toLowerCase(), args: (match?.[2] ?? '').trim() };
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').trim();
  }
  return trimmed;
}

export function firstToken(args: string): { token: string; rest: string } {
  const match = /^(\S+)\s*([\s\S]*)$/.exec(args.trim());
  return { token: match?.[1]?.toLowerCase() ?? '', rest: (match?.[2] ?? '').trim() };
}
