export function getAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const value = configured || (vercelHost ? \`https://\${vercelHost}\` : "http://localhost:3000");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("APP_BASE_URL must use HTTPS outside localhost");
  }
  return parsed.origin;
}

export function isAllowedBrowserOrigin(origin: string | string[] | undefined): boolean {
  if (typeof origin !== "string") return false;
  try {
    const expected = new Set<string>();
    if (process.env.APP_BASE_URL) expected.add(new URL(process.env.APP_BASE_URL).origin);
    if (process.env.VERCEL_URL) expected.add(new URL(\`https://\${process.env.VERCEL_URL}\`).origin);
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      expected.add(new URL(\`https://\${process.env.VERCEL_PROJECT_PRODUCTION_URL}\`).origin);
    }
    if (expected.size === 0 && process.env.NODE_ENV !== "production") {
      expected.add("http://localhost:3000");
      expected.add("http://127.0.0.1:3000");
    }
    return expected.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
