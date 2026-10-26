import { aiProposalSchema, type AiProposal } from '../../shared/ai-proposal'

export { aiProposalSchema }
export type { AiProposal } from '../../shared/ai-proposal'
export type AiAdapter = {
  parse(text: string, accessToken: string): Promise<AiProposal>
}

export function validateAiProposal(value: unknown): AiProposal {
  return aiProposalSchema.parse(value)
}

export function createAiAdapter(fetcher: typeof fetch = fetch): AiAdapter {
  return {
    async parse(text, accessToken) {
      if (!accessToken.trim()) {
        throw new Error('Your sign-in session is missing. Refresh the page and sign in again before using AI entry.')
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
      if (import.meta.env.DEV) {
        const bridgeResponse = await fetcher('/__local/ai-authorization', {
          method: 'POST',
          headers,
          body: '{}',
        })
        const bridgePayload: unknown = await bridgeResponse.json().catch(() => null)
        if (!bridgeResponse.ok) {
          throw new Error(getAiErrorMessage(bridgePayload, bridgeResponse.status))
        }
        if (typeof bridgePayload !== 'object' || bridgePayload === null
          || !('receipt' in bridgePayload) || typeof bridgePayload.receipt !== 'string') {
          throw new Error('Local AI sign-in verification returned an invalid response.')
        }
        headers['X-Local-AI-Authorization'] = bridgePayload.receipt
      }
      const response = await fetcher('/api/ai/parse', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, locale: 'en-IN' }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(getAiErrorMessage(payload, response.status))
      }
      if (typeof payload !== 'object' || payload === null || !('proposal' in payload)) {
        throw new Error('The AI service returned an invalid response.')
      }
      return validateAiProposal(payload.proposal)
    },
  }
}

function getAiErrorMessage(payload: unknown, status: number): string {
  return typeof payload === 'object' && payload !== null && 'error' in payload
    && typeof payload.error === 'object' && payload.error !== null && 'message' in payload.error
    && typeof payload.error.message === 'string'
    ? payload.error.message
    : `AI parsing failed (${status}).`
}

export function createMockAiAdapter(proposal: unknown): AiAdapter {
  return { async parse() { return validateAiProposal(proposal) } }
}
