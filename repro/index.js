'use strict'
// Both retries:3 and retries:default(5) gave IDENTICAL results across 5 runs
// on Windows: 2 replies, 0 with value, resolving in ~1-2ms (not a slow
// timeout) - so this isn't a retries/timing issue at all. The client's
// discovery is instant and reliable; the record is just never actually
// stored anywhere. That points squarely at the server's own announce
// (Announcer._update()/_commit() in hyperdht/lib/announcer.js), which
// silently swallows any failure:
//
//   const res = await this.dht.request({...COMMANDS.ANNOUNCE...}, msg.from)
//   if (res.error !== 0) return
//   ...
//   for (const msg of replies) ann.push(this._commit(msg, relays, relayAddresses))
//   await Promise.allSettled(ann)   <- absorbs any thrown error silently too
//
// This monkey-patches Announcer's prototype (no node_modules edits) to log
// exactly what happens inside a real announce: how many candidates its own
// exploratory query finds, and for each commit attempt, whether the
// dht.request() throws, times out, or comes back with a non-zero error.

const HyperDHT = require('hyperdht')
const testnet = require('hyperdht/testnet.js')
const Announcer = require('hyperdht/lib/announcer.js')

const origUpdate = Announcer.prototype._update
Announcer.prototype._update = async function (...args) {
  const t0 = Date.now()
  await origUpdate.apply(this, args)
  console.log(
    `  [announcer] _update done (${Date.now() - t0}ms), closestNodes=${this._closestNodes.length}, relays=${this.relays.length}`
  )
}

const origCommit = Announcer.prototype._commit
Announcer.prototype._commit = async function (msg, relays, relayAddresses) {
  const t0 = Date.now()
  try {
    await origCommit.call(this, msg, relays, relayAddresses)
    console.log(
      `  [announcer] _commit to ${msg.from.host}:${msg.from.port} ok (${Date.now() - t0}ms), relays now=${relays.length}`
    )
  } catch (err) {
    console.log(
      `  [announcer] _commit to ${msg.from.host}:${msg.from.port} THREW (${Date.now() - t0}ms): ${err.message}`
    )
    throw err
  }
}

async function attempt(i) {
  console.log(`\n[${i}] announcing...`)
  const swarm = await testnet(3)
  let server

  try {
    server = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
    await server.ready()
    const keyPair = HyperDHT.keyPair()
    await server.createServer(() => {}).listen(keyPair)
    console.log(`[${i}] listen() resolved`)
  } finally {
    await Promise.all([server && server.destroy(), swarm.destroy()].filter(Boolean))
  }
}

async function main() {
  const iterations = Number(process.env.REPRO_ITERATIONS) || 3
  for (let i = 1; i <= iterations; i++) {
    await attempt(i)
  }
}

main().catch((err) => {
  console.error('script crashed:', err)
  process.exit(1)
})
