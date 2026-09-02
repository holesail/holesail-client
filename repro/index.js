'use strict'
// Minimal repro: a client connecting to a HyperDHT server that announced
// itself with `firewalled: false` (the usual way to mark a directly-
// reachable server) gets PEER_NOT_FOUND on some Windows environments, even
// though the server is up and the client can talk to the swarm fine. No
// holesail code involved.

const HyperDHT = require('hyperdht')
const testnet = require('hyperdht/testnet.js')

async function main() {
  const swarm = await testnet(30)

  const server = new HyperDHT({ bootstrap: swarm.bootstrap, firewalled: false })
  await server.ready()
  const keyPair = HyperDHT.keyPair()
  await server.createServer(() => {}).listen(keyPair)

  const client = new HyperDHT({ bootstrap: swarm.bootstrap })
  await client.ready()

  console.log('connecting...')
  try {
    const socket = client.connect(keyPair.publicKey)
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    console.log('connected')
  } finally {
    // Kernel-level packet counters from udx-native, straight from the OS
    // socket - do outbound sends ever actually leave the machine, and does
    // anything ever come back, regardless of what dht-rpc makes of it.
    logSocketStats('server.serverSocket', server.io.serverSocket)
    logSocketStats('server.clientSocket', server.io.clientSocket)
    logSocketStats('client.serverSocket', client.io.serverSocket)
    logSocketStats('client.clientSocket', client.io.clientSocket)
  }

  await server.destroy()
  await client.destroy()
  await swarm.destroy()
}

function logSocketStats(label, socket) {
  console.log(
    `[stats] ${label} tx=${socket.packetsTransmitted} rx=${socket.packetsReceived} droppedByKernel=${socket.packetsDroppedByKernel}`
  )
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
