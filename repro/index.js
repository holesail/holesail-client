'use strict'
// Minimal repro, now narrowed to the exact suspected line:
// hyperdht/lib/connect.js hardcodes `retries: 3` for the findPeer() lookup
// it does internally before connecting:
//
//   c.query = c.dht.findPeer(c.target, {
//     hash: false, session: c.session, nodes: relayAddresses, retries: 3
//   })
//
// dht-rpc's own default for a non-internal query is retries: 5 (see
// dht-rpc/lib/query.js), and its retry timer is a fixed ~1000ms per cycle
// (dht-rpc/lib/io.js), so retries: 3 buys ~4s of budget vs ~6s for retries:
// 5+. Every DHT bootstrap/query we've seen on this Windows environment
// consistently takes ~5-6s for a first successful exchange (vs sub-100ms on
// Linux/macOS) - not random jitter, a consistent platform cost. If that's
// right, a plain findPeer with retries: 3 should reliably fail here, and the
// exact same query with a higher retries value should reliably succeed.
//
// No holesail code, no full connect()/holepunch - just the one query
// hyperdht issues internally, with the two retry values compared directly.

const HyperDHT = require('hyperdht')
const testnet = require('hyperdht/testnet.js')
const { hash } = require('hyperdht/lib/crypto')
const { COMMANDS } = require('hyperdht/lib/constants')

const ITERATIONS = Number(process.env.REPRO_ITERATIONS) || 5

async function findPeer(client, target, retries) {
  const t0 = Date.now()
  let found = false
  const q = client.findPeer(target, { hash: false, retries })
  for await (const data of q) {
    if (data) found = true
  }
  return { found, ms: Date.now() - t0 }
}

async function attempt(i) {
  const swarm = await testnet(3)
  let server, client

  try {
    server = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
    await server.ready()
    const keyPair = HyperDHT.keyPair()
    await server.createServer(() => {}).listen(keyPair)
    const target = hash(keyPair.publicKey)

    client = new HyperDHT({ bootstrap: swarm.bootstrap })
    await client.ready()

    const withThree = await findPeer(client, target, 3)
    console.log(
      `[${i}] retries:3  -> ${withThree.found ? 'found' : 'NOT FOUND'} (${withThree.ms}ms)`
    )

    const withDefault = await findPeer(client, target, undefined)
    console.log(
      `[${i}] retries:default(5) -> ${withDefault.found ? 'found' : 'NOT FOUND'} (${withDefault.ms}ms)`
    )

    return withThree.found === false && withDefault.found === true
  } finally {
    await Promise.all(
      [server && server.destroy(), client && client.destroy(), swarm.destroy()].filter(Boolean)
    )
  }
}

async function main() {
  console.log(`COMMANDS.FIND_PEER = ${COMMANDS.FIND_PEER} (sanity check, unused otherwise)\n`)

  let confirmed = 0

  for (let i = 1; i <= ITERATIONS; i++) {
    if (await attempt(i)) confirmed++
  }

  console.log(`\n--- summary ---`)
  console.log(
    `${confirmed}/${ITERATIONS} runs confirm: retries:3 fails where retries:default succeeds`
  )
}

main().catch((err) => {
  console.error('script crashed:', err)
  process.exit(1)
})
