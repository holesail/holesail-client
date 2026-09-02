'use strict'
// Minimal repro: a HyperDHT node constructed with `firewalled: false` (the
// usual way to mark a directly-reachable server) times out pinging a live,
// reachable peer on some Windows environments. No holesail code involved.

const HyperDHT = require('hyperdht')
const testnet = require('hyperdht/testnet.js')

async function main() {
  const swarm = await testnet(1)
  const { port } = swarm.nodes[0].address()

  const dht = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
  await dht.ready()

  console.log(`pinging 127.0.0.1:${port}...`)
  const t0 = Date.now()
  await dht.ping({ host: '127.0.0.1', port })
  console.log(`ok (${Date.now() - t0}ms)`)

  await dht.destroy()
  await swarm.destroy()
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
