export interface LexiconEntry {
  pattern: string;
  wholeWord: boolean;
}

/**
 * Initial profanity stems copied into the chat database on first join.
 * After seeding, the database is the source of truth and admins can edit the rows.
 */
export const DEFAULT_LEXICON: readonly LexiconEntry[] = [
  { pattern: 'хуй', wholeWord: true },
  { pattern: 'хуя', wholeWord: false },
  { pattern: 'хуе', wholeWord: false },
  { pattern: 'пизд', wholeWord: false },
  { pattern: 'ебан', wholeWord: false },
  { pattern: 'ебат', wholeWord: false },
  { pattern: 'ёбан', wholeWord: false },
  { pattern: 'бляд', wholeWord: false },
  { pattern: 'блять', wholeWord: true },
  { pattern: 'сука', wholeWord: true },
  { pattern: 'мудак', wholeWord: true },
  { pattern: 'пидор', wholeWord: true },
  { pattern: 'пидар', wholeWord: true },
];
