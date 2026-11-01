import { domainToASCII } from 'node:url';

const URL_IN_TEXT =
  /\b(?:(?:https?:\/\/|www\.)[^\s<>()"']+|(?:(?:\d{1,3}\.){3}\d{1,3})(?::\d{2,5})?(?:\/[^\s<>()"']*)?|(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,})(?:\/[^\s<>()"']*)?)/giu;

export interface ExtractedLink {
  raw: string;
  host: string;
  suspicious: boolean;
}

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'clck.ru',
  'vk.cc',
  'cutt.ly',
  'is.gd',
  'ow.ly',
  'rb.gy',
  'tiny.cc',
  'u.to',
]);

const SUSPICIOUS_KEYWORDS = [
  'login',
  'verify',
  'account',
  'wallet',
  'seed',
  'crypto',
  'casino',
  'prize',
  'free-money',
  'password',
  'парол',
  'взлом',
  'раздач',
];

export function extractUrlsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const value = match[0];
    if (value) found.add(trimUrl(value));
  }
  return [...found];
}

export function normalizeHost(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  if (host.startsWith('www.')) host = host.slice(4);
  const ascii = domainToASCII(host);
  if (!ascii) return null;
  if (!isIp(ascii) && !ascii.includes('.')) return null;
  return ascii;
}

export function describeLink(raw: string): ExtractedLink | null {
  const host = normalizeHost(raw);
  if (!host) return null;
  const haystack = raw.toLowerCase();
  const suspicious =
    isIp(host) ||
    SHORTENERS.has(host) ||
    SUSPICIOUS_KEYWORDS.some((word) => haystack.includes(word));
  return { raw, host, suspicious };
}

export function hostMatches(host: string, ruleDomain: string): boolean {
  return host === ruleDomain || host.endsWith(`.${ruleDomain}`);
}

export function isIp(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
}

function trimUrl(value: string): string {
  return value.replace(/[),.;!?]+$/g, '');
}
