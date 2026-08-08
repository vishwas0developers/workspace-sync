const SECRET_PATTERNS = [
  // Key-value pairs matching credentials, tokens, keys
  /(PASSWORD|SECRET|API_KEY|TOKEN|PASS|KEY|AUTH|CREDENTIALS|PRIVATE_KEY)\s*[:=]\s*("[^"]+"?'?[^']+'?|[^\s]+)/gi,
  // PEM / OpenSSH private key blocks
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[A-Za-z0-9+/=\s\n\r]+-----END [A-Z ]+ PRIVATE KEY-----/g,
  // Database connection URLs with passwords e.g. postgres://user:pass@host
  /([a-z0-9]+:\/\/)([^:\s]+):([^@\s]+)@([^\s]+)/gi
];

export function redactSecrets(content: string): string {
  let redacted = content;
  
  // Apply PEM key first as it can be multi-line
  redacted = redacted.replace(SECRET_PATTERNS[1], "[REDACTED PRIVATE KEY]");

  // Apply Key-value pattern
  redacted = redacted.replace(SECRET_PATTERNS[0], (match, key, value) => {
    return `${key}=[REDACTED]`;
  });

  // Apply connection string pattern
  redacted = redacted.replace(SECRET_PATTERNS[2], (match, protocol, user, pass, rest) => {
    return `${protocol}${user}:[REDACTED]@${rest}`;
  });

  return redacted;
}
