export interface ParsedCommand {
  name: string;
  args: string;
}

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  const match = /^\/([a-z][a-z0-9_]*)(?:@[\w.]+)?(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (!match) return null;
  const name = match[1]?.toLowerCase();
  if (!name) return null;
  return { name, args: (match[2] ?? '').trim() };
}

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const expression = /"((?:\\.|[^"\\])*)"|(\S+)/g;
  for (const match of input.matchAll(expression)) {
    if (match[1] !== undefined) {
      tokens.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    }
  }
  return tokens;
}

export function isPublicCommand(name: string): boolean {
  return name === 'start' || name === 'help';
}
