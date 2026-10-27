import { randomBytes } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { resolveSupabaseWorkerRuntimeVars } from './build/supabase-runtime-config'
import { isSafeSupabasePublicKey, localAuthBridgePlugin } from './dev/local-auth-bridge'

export default defineConfig(({ command, mode }) => {
  const isLocalDev = command === 'serve' && mode === 'development'
  const localAuthSecret = isLocalDev ? randomBytes(32).toString('base64url') : ''
  const frontendEnv = loadEnv(mode, process.cwd(), 'VITE_')
  if (frontendEnv.VITE_SUPABASE_PUBLISHABLE_KEY
    && !isSafeSupabasePublicKey(frontendEnv.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key or legacy anon key, never a secret/service-role key.')
  }

  return {
    plugins: [
      react(),
      ...(isLocalDev ? [localAuthBridgePlugin(localAuthSecret, {
        url: frontendEnv.VITE_SUPABASE_URL ?? '',
        publishableKey: frontendEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      })] : []),
      cloudflare({
        ...(command === 'build' || isLocalDev
          ? {
              config: (current) => ({
                ...current,
                ...(command === 'build' ? { secrets: { required: [] } } : {}),
                vars: {
                  ...current.vars,
                  ...(command === 'build'
                    ? resolveSupabaseWorkerRuntimeVars({
                        url: frontendEnv.VITE_SUPABASE_URL,
                        publishableKey: frontendEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
                      })
                    : {}),
                  ...(isLocalDev ? { LOCAL_AUTH_BRIDGE_SECRET: localAuthSecret } : {}),
                },
              }),
            }
          : {}),
      }),
    ],
  }
})
