import { describe, expect, it } from "vitest";
import { resolveSupabaseWorkerRuntimeVars } from "../build/supabase-runtime-config";

const validLegacyAnonKey = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoiYW5vbiJ9.signature";

describe("production Worker Supabase configuration", () => {
  it("maps the frontend VITE values to Worker runtime variable names", () => {
    expect(resolveSupabaseWorkerRuntimeVars({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_example-key",
    })).toEqual({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example-key",
    });
  });

  it("accepts a legacy anon JWT", () => {
    expect(resolveSupabaseWorkerRuntimeVars({
      url: "https://project.supabase.co",
      publishableKey: validLegacyAnonKey,
    }).SUPABASE_PUBLISHABLE_KEY).toBe(validLegacyAnonKey);
  });

  it.each([
    { url: undefined, publishableKey: "sb_publishable_example-key" },
    { url: "https://project.supabase.co", publishableKey: undefined },
    { url: "http://project.supabase.co", publishableKey: "sb_publishable_example-key" },
    { url: "https://project.supabase.co", publishableKey: "sb_secret_example-key" },
    { url: "https://project.supabase.co", publishableKey: "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature" },
  ])("rejects unsafe or malformed production configuration", (input) => {
    expect(() => resolveSupabaseWorkerRuntimeVars(input)).toThrow();
  });
});
