'use strict'
// Previous version compared retries:3 vs dht-rpc's default (5) back to back
// on the SAME client - both came back "NOT FOUND" in <2ms every time, which
// falsifies the retries-budget theory (a real network round-trip consuming
// retry budget wouldn't resolve in 1ms) and also means the two queries
// weren't properly isolated (state from the first could affect the second).
//
// This uses two entirely separate, freshly bootstrapped clients - one per
// retries value - and queries with a raw (non-filtering) map so every reply
// is visible, not just ones with a value. That distinguishes "zero replies
// at all" (nothing to query, or requests never got answered) from "got
// replies, none had the value" (found candidates, record just isn't there).

const HyperDHT = require('hyperdht')
const testnet = require('hyperdht/testnet.js')
const { hash } = require('hyperdht/lib/crypto')
const { COMMANDS } = require('hyperdht/lib/constants')

const ITERATIONS = Number(process.env.REPRO_ITERATIONS) || 5

async function rawFindPeer(bootstrap, target, retries) {
  const client = new HyperDHT({ bootstrap, port: 0, host: '127.0.0.1' })
  await client.ready()

  const t0 = Date.now()
  let replies = 0
  let withValue = 0

  const q = client.query(
    { target, command: COMMANDS.FIND_PEER, value: null },
    {
      retries,
      map: (node) => {
        replies++
        if (node.value) withValue++
        return node
      }
    }
  )
  for await (const _ of q) {
    // draining is enough - counting happens in map()
  }

  await client.destroy()
  return { replies, withValue, ms: Date.now() - t0 }
}

async function attempt(i) {
  const swarm = await testnet(3)
  let server

  try {
    server = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
    await server.ready()
    const keyPair = HyperDHT.keyPair()
    await server.createServer(() => {}).listen(keyPair)
    const target = hash(keyPair.publicKey)

    const three = await rawFindPeer(swarm.bootstrap, target, 3)
    console.log(
      `[${i}] retries:3       -> ${three.replies} replies, ${three.withValue} with value (${three.ms}ms)`
    )

    const dflt = await rawFindPeer(swarm.bootstrap, target, undefined)
    console.log(
      `[${i}] retries:default -> ${dflt.replies} replies, ${dflt.withValue} with value (${dflt.ms}ms)`
    )
  } finally {
    await Promise.all([server && server.destroy(), swarm.destroy()].filter(Boolean))
  }
}

async function main() {
  console.log(`COMMANDS.FIND_PEER = ${COMMANDS.FIND_PEER} (sanity check, unused otherwise)\n`)

  for (let i = 1; i <= ITERATIONS; i++) {
    await attempt(i)
  }
}

main().catch((err) => {
  console.error('script crashed:', err)
  process.exit(1)
})
