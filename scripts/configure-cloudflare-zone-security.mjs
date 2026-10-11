#!/usr/bin/env node
/**
 * Clears Cloudflare Security Insights for security.txt + AI Labyrinth on kluddkrig.com.
 *
 * Needs CLOUDFLARE_API_TOKEN with Zone Settings Edit (+ Bot Management Write if available):
 *   CLOUDFLARE_API_TOKEN=… npm run cf:security
 */

const zoneName = process.argv[2] || 'kluddkrig.com'
const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || process.env.CF_API_TOKEN?.trim()
if (!token) {
  console.error('Set CLOUDFLARE_API_TOKEN (Zone Settings Edit).')
  process.exit(1)
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const body = await res.json()
  if (!body.success) {
    throw new Error(`${init.method || 'GET'} ${path}: ${JSON.stringify(body.errors || body)}`)
  }
  return body
}

const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

const { result: zones } = await api(`/zones?name=${encodeURIComponent(zoneName)}`)
const zone = zones?.[0]
if (!zone?.id) {
  console.error(`Zone not found: ${zoneName}`)
  process.exit(1)
}

console.log(`Zone ${zoneName} (${zone.id})`)

await api(`/zones/${zone.id}/security-center/securitytxt`, {
  method: 'PUT',
  body: JSON.stringify({
    enabled: true,
    contact: ['mailto:linus.stenvi@gmail.com'],
    canonical: [`https://${zoneName}/.well-known/security.txt`],
    preferred_languages: 'sv, en',
    expires,
  }),
})
console.log('✓ Security.txt enabled in Security Center')

const botGet = await api(`/zones/${zone.id}/bot_management`)
const current = botGet.result || {}
await api(`/zones/${zone.id}/bot_management`, {
  method: 'PUT',
  body: JSON.stringify({
    ...current,
    crawler_protection: 'enabled',
    ai_bots_protection: current.ai_bots_protection === 'disabled' ? 'block' : current.ai_bots_protection,
  }),
})
console.log('✓ AI Labyrinth (crawler_protection) enabled')

console.log('Done. Re-scan in Cloudflare Security Insights in a few minutes.')
