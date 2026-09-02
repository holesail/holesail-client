'use strict'
// Minimal repro: a client connecting to a HyperDHT server that announced
// itself with `firewalled: false` (the usual way to mark a directly-
// reachable server) intermittently gets PEER_NOT_FOUND on Windows, even
// though every individual piece (transport, dht-rpc protocol, HyperDHT ping
// in both directions, announce+findPeer discovery) works fine in isolation.
// It only shows up in the full connect() path, and not on every run - so
// this repeats the scenario a number of times and reports a failure rate.
// No holesail code involved.

const HyperDHT = require('hyperdht')
const testnet = require('hyperdht/testnet.js')

const ITERATIONS = Number(process.env.REPRO_ITERATIONS) || 20

async function attempt(i) {
  const swarm = await testnet(3)
  let server, client

  try {
    server = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
    await server.ready()
    const keyPair = HyperDHT.keyPair()
    await server.createServer(() => {}).listen(keyPair)

    client = new HyperDHT({ bootstrap: swarm.bootstrap })
    await client.ready()

    const t0 = Date.now()
    const socket = client.connect(keyPair.publicKey)
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    console.log(`[${i}] ok (${Date.now() - t0}ms)`)
    return true
  } catch (err) {
    console.log(`[${i}] FAILED: ${err.message}`)
    return false
  } finally {
    await Promise.all(
      [server && server.destroy(), client && client.destroy(), swarm.destroy()].filter(Boolean)
    )
  }
}

async function main() {
  let ok = 0

  for (let i = 1; i <= ITERATIONS; i++) {
    if (await attempt(i)) ok++
  }

  const fail = ITERATIONS - ok
  console.log(`\n--- summary ---`)
  console.log(`${ok}/${ITERATIONS} succeeded, ${fail}/${ITERATIONS} failed`)

  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error('script crashed:', err)
  process.exit(1)
})
