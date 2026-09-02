'use strict'
// Minimal, holesail-independent repro of a Windows-only HyperDHT issue found
// while chasing a PEER_NOT_FOUND failure in holesail-client's test suite.
//
// Observed: a HyperDHT node constructed with `firewalled: false` (the usual
// way to mark a directly-reachable server) appears unable to send/receive
// DHT RPC traffic at all on some Windows environments - pings to known-good,
// responsive peers time out completely, and a real announce+connect never
// completes. A default (firewalled: true) node reaches the exact same peers
// instantly and reliably in the same run.
//
// This script only depends on `hyperdht` itself:
//   1. Spins up a small local HyperDHT swarm (testnet) on 127.0.0.1.
//   2. Has a default client node ping every swarm node directly.
//   3. Has a firewalled:false node ping every swarm node directly.
//   4. Has that firewalled:false node run a real server (createServer +
//      listen) and has the client connect to it end to end.
//
// Exits 0 if everything works, 1 if the firewalled:false node fails where
// the client succeeded (the failure mode observed on Windows CI/VMs).

const HyperDHT = require('hyperdht')
const testnet = require('hyperdht/testnet.js')

async function pingAll(dht, nodes, label) {
  let ok = 0
  for (const node of nodes) {
    const { port } = node.address()
    const t0 = Date.now()
    try {
      await dht.ping({ host: '127.0.0.1', port })
      console.log(`[${label}] ping 127.0.0.1:${port} ok (${Date.now() - t0}ms)`)
      ok++
    } catch (err) {
      console.log(`[${label}] ping 127.0.0.1:${port} FAILED (${Date.now() - t0}ms): ${err.message}`)
    }
  }
  return ok === nodes.length
}

async function connectRepro(swarm) {
  const server = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
  await server.ready()

  const keyPair = HyperDHT.keyPair()
  const dhtServer = server.createServer((socket) => socket.end())
  await dhtServer.listen(keyPair)

  const client = new HyperDHT({ bootstrap: swarm.bootstrap })
  await client.ready()

  const t0 = Date.now()
  let ok
  try {
    const socket = client.connect(keyPair.publicKey)
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
      socket.once('close', () => reject(new Error('closed before connecting')))
    })
    socket.destroy()
    console.log(`[connect] client -> server connect ok (${Date.now() - t0}ms)`)
    ok = true
  } catch (err) {
    console.log(`[connect] client -> server connect FAILED (${Date.now() - t0}ms): ${err.message}`)
    ok = false
  }

  await Promise.all([server.destroy(), client.destroy()])
  return ok
}

async function main() {
  console.log(process.version, process.platform, process.arch)

  const swarm = await testnet(3)
  console.log(`testnet ready: ${swarm.bootstrap.length} bootstrap node(s)`)

  const client = new HyperDHT({ bootstrap: swarm.bootstrap })
  await client.ready()
  const clientPingOk = await pingAll(client, swarm.nodes, 'client firewalled:true (default)')
  await client.destroy()

  const server = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
  await server.ready()
  const serverPingOk = await pingAll(server, swarm.nodes, 'server firewalled:false')
  await server.destroy()

  const connectOk = await connectRepro(swarm)

  await swarm.destroy()

  console.log('\n--- summary ---')
  console.log('client (firewalled:true) reached every peer:', clientPingOk)
  console.log('server (firewalled:false) reached every peer:', serverPingOk)
  console.log('client -> firewalled:false server connect ok:', connectOk)

  if (!clientPingOk) {
    console.error(
      '\nUNEXPECTED: even the default (firewalled:true) client could not ' +
        'reach its peers - this is not the failure this repro targets, ' +
        'something else is broken in this environment.'
    )
    process.exitCode = 1
    return
  }

  if (!serverPingOk || !connectOk) {
    console.error(
      '\nREPRO CONFIRMED: a firewalled:false node failed to send/receive ' +
        'DHT traffic where a firewalled:true node succeeded, on the same ' +
        'host, in the same run.'
    )
    process.exitCode = 1
    return
  }

  console.log('\nNo repro: both node types worked fine on this platform.')
}

main().catch((err) => {
  console.error('repro script crashed:', err)
  process.exitCode = 1
})
