'use strict'
// One layer below hyperdht: bare dht-rpc, no hyperdht at all. Isolates
// whether the bug is in dht-rpc's own request/response protocol, or
// something hyperdht layers on top (raw stream multiplexing, holepunching,
// the Server/Announcer classes, etc).
//
// A "bootstrap" node listens on an explicit port. A second, firewalled:false
// node (dht-rpc's own request/response protocol, nothing more) pings it.

const DHT = require('dht-rpc')

async function main() {
  const bootstrap = new DHT({ ephemeral: false, firewalled: false, port: 0, host: '127.0.0.1' })
  await bootstrap.ready()
  const { port } = bootstrap.address()
  console.log('bootstrap listening on', port)

  const node = new DHT({
    ephemeral: false,
    firewalled: false,
    bootstrap: [{ host: '127.0.0.1', port }],
    port: 0,
    host: '127.0.0.1'
  })
  await node.ready()

  console.log('pinging bootstrap...')
  const t0 = Date.now()
  await node.ping({ host: '127.0.0.1', port })
  console.log(`ok (${Date.now() - t0}ms)`)

  await node.destroy()
  await bootstrap.destroy()
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
