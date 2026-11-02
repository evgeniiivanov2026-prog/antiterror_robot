import { domainToASCII } from 'node:url';

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
  'tiny.cc',
  'shorturl.at',
]);

const SUSPICIOUS_LABELS = [
  'login',
  'verify',
  'wallet',
  'seed',
  'crypto',
  'casino',
  'prize',
  'giveaway',
  'bonus',
  'secure',
  'account',
  'password',
];

const IGNORED_HOST_SUFFIXES = ['max.ru'];

const URL_PATTERN =
  /\b(?:(?:https?:\/\/|www\.)[^\s<>()"']+|(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>()"']*)?)/giu;

export interface ExtractedUrl {
  raw: string;
  host: string;
  unicodeHost: string;
  suspicious: boolean;
  reason: string | null;
}

export function deobfuscateLinkText(input: string): string {
  return input
    .replace(/hxxps?/gi, (value) => (value.toLowerCase() === 'hxxps' ? 'https' : 'http'))
    .replace(/\[\.\]|\{\.\}|\(\.\)/g, '.')
    .replace(/\s+\.\s+/g, '.');
}

function trimUrl(value: string): string {
  return value.replace(/[),.;!?]+$/g, '');
}

function looksLikeHost(host: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(':')) return true;
  const labels = host.split('.').filter((label) => label.length > 0);
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1] ?? '';
  if (!/^[a-z]{2,24}$/i.test(tld)) return false;
  return labels.every(
    (label) => /^[a-z0-9-]{1,63}$/i.test(label) || label.toLowerCase().startsWith('xn--'),
  );
}

export function canonicalDomain(input: string): string | null {
  const trimmed = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  const host = trimmed.split('/')[0]?.split('?')[0]?.split('#')[0]?.replace(/\.$/, '') ?? '';
  if (!host || host.includes(' ') || !looksLikeHost(host)) return null;
  const ascii = domainToASCII(host);
  return ascii || host;
}

function suspiciousReason(host: string): string | null {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return 'ip-literal';
  if (host.split('.').some((label) => label.startsWith('xn--'))) return 'punycode';
  if (SHORTENERS.has(host)) return 'shortener';
  const labels = host.split('.');
  if (labels.some((label) => SUSPICIOUS_LABELS.includes(label))) return 'suspicious-keyword';
  return null;
}

export function isIgnoredHost(host: string): boolean {
  return IGNORED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function domainMatches(host: string, ruleDomain: string): boolean {
  return host === ruleDomain || host.endsWith(`.${ruleDomain}`);
}

export function extractUrls(input: string): ExtractedUrl[] {
  const source = deobfuscateLinkText(input);
  const found = new Map<string, ExtractedUrl>();
  for (const match of source.matchAll(URL_PATTERN)) {
    const raw = trimUrl(match[0] ?? '');
    if (!raw) continue;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^www\./i, '')}`;
    let parsed: URL;
    try {
      parsed = new URL(withScheme);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!looksLikeHost(host) || isIgnoredHost(host)) continue;
    const reason = suspiciousReason(host);
    const key = `${host}${parsed.pathname}`;
    if (found.has(key)) continue;
    found.set(key, {
      raw,
      host,
      unicodeHost: host,
      suspicious: reason !== null,
      reason,
    });
  }
  return [...found.values()];
}
