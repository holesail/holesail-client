'use strict'
// Same shape as raw-dht-rpc.js, but through the HyperDHT subclass instead of
// bare dht-rpc - no createServer(), no connect(), just ping(). Isolates
// whether the bug shows up as soon as HyperDHT is used at all, or only once
// createServer()/Server/Announcer/connect() get involved.

const HyperDHT = require('hyperdht')

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
