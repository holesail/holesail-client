'use strict'
// Same shape as raw-hyperdht-ping.js, but pings the bootstrap node twice:
// once before calling createServer()/listen() on the node doing the
// pinging, and once after. Isolates whether merely wiring up a Server
// (raw-stream demultiplexing on the same socket) is what breaks the node's
// own subsequent DHT-RPC traffic, or whether it's specifically listen()'s
// announce (Announcer) or connect() that's the trigger.

const HyperDHT = require('hyperdht')

async function ping(node, port, label) {
  console.log(`pinging bootstrap (${label})...`)
  const t0 = Date.now()
  try {
    await node.ping({ host: '127.0.0.1', port })
    console.log(`ok (${Date.now() - t0}ms)`)
    return true
  } catch (err) {
    console.log(`FAILED (${Date.now() - t0}ms): ${err.message}`)
    return false
  }
}

async function main() {
  const bootstrap = new HyperDHT({
    ephemeral: false,
    firewalled: false,
    port: 0,
    host: '127.0.0.1'
  })
  await bootstrap.ready()
  const { port } = bootstrap.address()
  console.log('bootstrap listening on', port)

  const node = new HyperDHT({
    ephemeral: false,
    firewalled: false,
    bootstrap: [{ host: '127.0.0.1', port }],
    port: 0,
    host: '127.0.0.1'
  })
  await node.ready()

  const beforeOk = await ping(node, port, 'before createServer')

  const keyPair = HyperDHT.keyPair()
  const server = node.createServer(() => {})
  console.log('createServer() called (not listening yet)')

  const afterCreateOk = await ping(node, port, 'after createServer, before listen')

  await server.listen(keyPair)
  console.log('listen() resolved')

  const afterListenOk = await ping(node, port, 'after listen')

  console.log('\n--- summary ---')
  console.log('ping before createServer:', beforeOk)
  console.log('ping after createServer (not listening):', afterCreateOk)
  console.log('ping after listen():', afterListenOk)

  await node.destroy()
  await bootstrap.destroy()

  if (!beforeOk || !afterCreateOk || !afterListenOk) process.exit(1)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
