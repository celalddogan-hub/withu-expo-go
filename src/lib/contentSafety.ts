export type ContentSafetyResult = {
  allowed: boolean;
  reason?: 'threat' | 'harassment' | 'sexual' | 'self_harm';
  message?: string;
};

const NORMALIZE_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  '5': 's',
  '$': 's',
  '7': 't',
};

const THREAT_PATTERNS = [
  /\b(jag\s+ska|ska|kommer\s+att)\s+(döda|slå|skada|knivhugga|mörda|hota)\b/i,
  /\b(döda\s+dig|slå\s+dig|skada\s+dig|knivhugga\s+dig|mörda\s+dig)\b/i,
  /\b(du\s+ska\s+dö|du\s+kommer\s+dö)\b/i,
  /\b(kill\s+you|i\s+will\s+kill|hurt\s+you|beat\s+you|murder\s+you)\b/i,
  /\b(اقتل|سأقتلك|سوف\s+اقتلك|اضربك)\b/i,
  /\b(вб'ю|убью|я\s+тебя\s+убью|поб'ю|побью)\b/i,
];

const HARASSMENT_PATTERNS = [
  /\b(hora|jävla\s+hora|fitta|kukhuvud|idiotjävel|äckel|cp|mongo|retard)\b/i,
  /\b(dra\s+åt\s+helvete|håll\s+käften|ingen\s+vill\s+ha\s+dig)\b/i,
  /\b(bitch|slut|whore|cunt|retard|freak|shut\s+up|go\s+to\s+hell)\b/i,
  /\b(كلب|حقير|غبي|اخرس|شرموطة)\b/i,
  /\b(сука|идиот|дебил|заткнись|шлюха)\b/i,
];

const SEXUAL_PATTERNS = [
  /\b(skicka\s+naken|nakenbild|nakenbilder|dickpic|sex\s+med\s+mig)\b/i,
  /\b(send\s+nudes|nude\s+pic|dick\s+pic|sex\s+with\s+me)\b/i,
];

const SELF_HARM_PATTERNS = [
  /\b(ta\s+livet\s+av\s+dig|gå\s+och\s+dö|kill\s+yourself|kys)\b/i,
];

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'’]+/gu, (char) => NORMALIZE_MAP[char] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function checkContentSafety(text: string): ContentSafetyResult {
  const normalized = normalizeText(text);
  if (!normalized) return { allowed: true };

  if (matchesAny(normalized, THREAT_PATTERNS)) {
    return {
      allowed: false,
      reason: 'threat',
      message: 'Hot eller våld får inte skickas i WithU.',
    };
  }

  if (matchesAny(normalized, SELF_HARM_PATTERNS)) {
    return {
      allowed: false,
      reason: 'self_harm',
      message: 'Meddelanden som uppmanar någon att skada sig själv stoppas.',
    };
  }

  if (matchesAny(normalized, HARASSMENT_PATTERNS)) {
    return {
      allowed: false,
      reason: 'harassment',
      message: 'Mobbning, kränkningar och grova påhopp får inte skickas.',
    };
  }

  if (matchesAny(normalized, SEXUAL_PATTERNS)) {
    return {
      allowed: false,
      reason: 'sexual',
      message: 'Sexuella krav eller press får inte skickas.',
    };
  }

  return { allowed: true };
}

export function getContentSafetyAlert(result: ContentSafetyResult) {
  return {
    title: 'Meddelandet stoppades',
    body:
      result.message ||
      'Texten bryter mot WithU:s trygghetsregler. Skriv om den på ett respektfullt sätt.',
  };
}
