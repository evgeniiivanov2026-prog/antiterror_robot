import { domainToASCII, domainToUnicode } from 'node:url';
import type { IncomingLink } from '../domain/types.js';

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'clck.ru',
  'vk.cc',
  'is.gd',
  'cutt.ly',
  'rb.gy',
  'ow.ly',
  'buff.ly',
  'shorturl.at',
  'tiny.cc',
  'bit.do',
  'rebrand.ly',
]);

const SUSPICIOUS = [
  'login',
  'verify',
  'secure',
  'wallet',
  'bonus',
  'gift',
  'kyc',
  'seed',
  'account',
];

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/giu;

export interface RawUrlParts {
  text: string;
  buttonUrls: string[];
  shareUrls: string[];
  markupUrls: string[];
}

export function extractUrls(parts: RawUrlParts): IncomingLink[] {
  const raws = [
    ...matchTextUrls(parts.text),
    ...parts.buttonUrls,
    ...parts.shareUrls,
    ...parts.markupUrls,
  ];
  const seen = new Set<string>();
  const links: IncomingLink[] = [];
  for (const raw of raws) {
    const parsed = parseLink(raw);
    if (!parsed) continue;
    const key = `${parsed.host}${parsed.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(parsed);
  }
  return links;
}

function matchTextUrls(text: string): string[] {
  return text.match(URL_IN_TEXT) ?? [];
}

export function parseLink(rawInput: string): IncomingLink | null {
  let raw = rawInput.trim().replace(/[),.;!?>\]]+$/g, '');
  if (!raw) return null;
  if (raw.startsWith('www.')) raw = `https://${raw}`;
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = normalizeHost(url.hostname);
  if (!host) return null;
  const isIp = isIpHost(host);
  const unicode = safeUnicode(host);
  const isShortener = SHORTENERS.has(host) || SHORTENERS.has(unicode);
  const suspicious =
    isShortener || isIp || SUSPICIOUS.some((word) => host.includes(word) || unicode.includes(word));
  return { raw: url.toString(), host, isIp, isShortener, suspicious };
}

export function normalizeDomainInput(input: string): string | null {
  let raw = input.trim().toLowerCase();
  raw = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const host = raw.split('/')[0]?.split('?')[0]?.split('#')[0]?.replace(/\.$/, '') ?? '';
  return normalizeHost(host);
}

function normalizeHost(host: string): string | null {
  const trimmed = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!trimmed || trimmed.length > 253 || trimmed.includes('..')) return null;
  if (isIpHost(trimmed)) return trimmed;
  try {
    const ascii = domainToASCII(trimmed);
    if (!ascii || !/^[a-z0-9.-]+$/.test(ascii)) return null;
    return ascii;
  } catch {
    return null;
  }
}

function safeUnicode(host: string): string {
  try {
    return domainToUnicode(host);
  } catch {
    return host;
  }
}

function isIpHost(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(':');
}

export function hostMatches(host: string, ruleDomain: string): boolean {
  return host === ruleDomain || host.endsWith(`.${ruleDomain}`);
}
