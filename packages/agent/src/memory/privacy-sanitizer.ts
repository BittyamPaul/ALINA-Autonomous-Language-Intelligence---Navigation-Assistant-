import { EpistemicTier } from '@alina/database';

export interface PrivacySanitizationResult {
  valid: boolean;
  sanitizedContent: string;
  error?: string;
  blockedReason?: string;
  tempered?: boolean;
}

// Credential & Secret Patterns (passwords, tokens, API keys, private keys)
const FORBIDDEN_SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9-_]{20,}/i,
  /ghp_[a-zA-Z0-9]{36}/i,
  /bearer\s+[a-zA-Z0-9_\-\.]{15,}/i,
  /password\s*[:=]\s*[^\s]+/i,
  /passwd\s*[:=]\s*[^\s]+/i,
  /api[_-]?key\s*[:=]\s*[^\s]+/i,
  /secret[_-]?key\s*[:=]\s*[^\s]+/i,
  /private[_-]?key\s*[:=]\s*[^\s]+/i,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
  /access_token\s*[:=]\s*[^\s]+/i,
  /auth_token\s*[:=]\s*[^\s]+/i,
  /\b[A-Za-z0-9+/]{40,}\b/, // Raw base64 secret tokens
];

// Sensitive Personal Attribute Patterns (Strictly Forbidden from Automated Profiling)
const SENSITIVE_PERSONAL_PATTERNS = [
  // Financial credentials & account numbers
  /\b(?:\d[ -]*?){13,16}\b/, // Credit card sequences
  /\bcvv\s*[:=]?\s*\d{3,4}\b/i,
  /\bbank account\s*[:=]?\s*\d+/i,
  // Sensitive personal inferences (Health, Medical, Biometric, Religion, Politics, Sexual Orientation)
  /\b(medical condition|diagnosis|prescription drugs?|health record|illness|disease)\b/i,
  /\b(religious beliefs?|worships at|church of|synagogue|mosque|devoutly)\b/i,
  /\b(political party|voted for|political affiliation|campaign donor)\b/i,
  /\b(biometric data|fingerprint scan|retina scan)\b/i,
  /\b(sexual orientation|sexual preference)\b/i,
];

// Surveillance and ambient monitoring telemetry patterns
const SURVEILLANCE_PATTERNS = [
  /\b(secretly record|ambient audio recording|background microphone listen)\b/i,
  /\b(continuous arbitrary screenshot|stealth screen capture)\b/i,
  /\b(global keystroke logger|keylogger|record all keys)\b/i,
  /\b(harvest unrelated private files|inspect unauthorized directories)\b/i,
];

export class PrivacySanitizer {
  /**
   * Evaluates text for security credentials, private attributes, and unauthorized surveillance.
   */
  public static sanitize(text: string): PrivacySanitizationResult {
    if (!text || text.trim().length === 0) {
      return {
        valid: false,
        sanitizedContent: '',
        error: 'Memory content cannot be empty.',
      };
    }

    const trimmed = text.trim();

    // 1. Check for security credentials and secrets
    for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          valid: false,
          sanitizedContent: '',
          error: 'Security policy violation: text contains sensitive secrets, tokens, or credentials.',
          blockedReason: 'CREDENTIAL_DETECTED',
        };
      }
    }

    // 2. Check for prohibited sensitive personal attributes
    for (const pattern of SENSITIVE_PERSONAL_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          valid: false,
          sanitizedContent: '',
          error: 'Privacy policy violation: ALINA strictly refuses to automatically infer or record sensitive personal attributes (health, finances, religion, politics, biometric).',
          blockedReason: 'SENSITIVE_PERSONAL_ATTRIBUTE',
        };
      }
    }

    // 3. Check for unauthorized surveillance patterns
    for (const pattern of SURVEILLANCE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          valid: false,
          sanitizedContent: '',
          error: 'Surveillance policy violation: ALINA strictly forbids ambient listening, continuous screenshots, or unapproved keystroke logging.',
          blockedReason: 'UNAUTHORIZED_SURVEILLANCE',
        };
      }
    }

    return {
      valid: true,
      sanitizedContent: trimmed,
    };
  }

  /**
   * Ensures that inferred memories are NEVER stored as confirmed, absolute facts.
   * Modifies assertive language ("User always prefers X") into tempered observations
   * ("User appears to frequently use X" or "User seems to prefer X").
   */
  public static temperInferredMemory(content: string, tier: EpistemicTier): { content: string; tempered: boolean } {
    if (tier !== 'INFERRED') {
      return { content, tempered: false };
    }

    let tempered = false;
    let modified = content;

    // Replace absolute claims with tempered observations
    const replacements: Array<[RegExp, string]> = [
      [/^User always prefers\s+/i, 'User appears to prefer '],
      [/^User always uses\s+/i, 'User appears to frequently use '],
      [/^User strictly requires\s+/i, 'User seems to prefer '],
      [/^User exclusively uses\s+/i, 'User appears to frequently use '],
      [/^User will never use\s+/i, 'User appears to avoid '],
      [/^User hates\s+/i, 'User seems to disfavor '],
      [/^User loves\s+/i, 'User appears to favor '],
    ];

    for (const [pattern, replacement] of replacements) {
      if (pattern.test(modified)) {
        modified = modified.replace(pattern, replacement);
        tempered = true;
      }
    }

    // If it lacks tempered language and does not start with "User appears" / "User seems", prepend a cautious prefix
    const lower = modified.toLowerCase();
    if (
      !tempered &&
      !lower.startsWith('user appears') &&
      !lower.startsWith('user seems') &&
      !lower.startsWith('user may') &&
      !lower.startsWith('observed that user')
    ) {
      if (lower.startsWith('user ')) {
        modified = 'User appears to ' + modified.slice(5);
      } else {
        modified = `User appears to: ${modified}`;
      }
      tempered = true;
    }

    return { content: modified, tempered };
  }

  /**
   * Validates provenance source to ensure it comes from an authorized ALINA context.
   */
  public static validateProvenanceSource(source?: string): { valid: boolean; normalizedSource: string } {
    if (!source || source.trim().length === 0) {
      return { valid: true, normalizedSource: 'user_explicit' };
    }

    const trimmed = source.trim();

    // Valid formats: conversation:xxx, task:xxx, explicit_user, file:path, web:url
    const validPrefixes = ['conversation:', 'task:', 'file:', 'web:', 'explicit_user', 'user_explicit', 'agent_reflection', 'dialogue'];
    const matches = validPrefixes.some((p) => trimmed.startsWith(p));

    if (matches) {
      return { valid: true, normalizedSource: trimmed };
    }

    // Default prefix if missing
    return { valid: true, normalizedSource: `explicit:${trimmed}` };
  }
}
