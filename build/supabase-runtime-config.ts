export type SupabaseWorkerRuntimeVars = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type SupabaseConfigInput = {
  url: string | undefined;
  publishableKey: string | undefined;
};

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0 && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

function isLegacyAnonJwt(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return false;
  }

  try {
    const encodedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = encodedPayload.padEnd(encodedPayload.length + ((4 - (encodedPayload.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(paddedPayload)) as { role?: unknown };
    return payload.role === "anon";
  } catch {
    return false;
  }
}

function isPublishableKey(value: string): boolean {
  if (/^sb_secret_/i.test(value) || /service[_-]?role/i.test(value)) {
    return false;
  }

  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value) || isLegacyAnonJwt(value);
}

export function resolveSupabaseWorkerRuntimeVars({ url, publishableKey }: SupabaseConfigInput): SupabaseWorkerRuntimeVars {
  const normalizedUrl = url?.trim() ?? "";
  const normalizedKey = publishableKey?.trim() ?? "";

  if (!isHttpsUrl(normalizedUrl)) {
    throw new Error("A valid HTTPS Supabase URL is required for the production Worker build.");
  }

  if (!isPublishableKey(normalizedKey)) {
    throw new Error("A Supabase publishable key or legacy anon key is required; secret/service-role keys are not allowed.");
  }

  return {
    SUPABASE_URL: normalizedUrl,
    SUPABASE_PUBLISHABLE_KEY: normalizedKey,
  };
}
