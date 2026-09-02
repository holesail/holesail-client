'use strict'
// The one direction not yet tested directly: after a firewalled:false node
// listens, can a completely independent third node ping it directly (by its
// known address, no findPeer/connect discovery involved)? The previous repro
// showed the server itself can still ping OUT to the bootstrap fine after
// listen() - this checks the inbound direction, which is what index.js's
// client ultimately needs to work.

const HyperDHT = require('hyperdht')

async function main() {
  const bootstrap = new HyperDHT({
    ephemeral: false,
    firewalled: false,
    port: 0,
    host: '127.0.0.1'
  })
  await bootstrap.ready()
  const bootstrapAddr = { host: '127.0.0.1', port: bootstrap.address().port }
  console.log('bootstrap listening on', bootstrapAddr.port)

  const server = new HyperDHT({
    ephemeral: false,
    firewalled: false,
    bootstrap: [bootstrapAddr],
    port: 0,
    host: '127.0.0.1'
  })
  await server.ready()

  const keyPair = HyperDHT.keyPair()
  await server.createServer(() => {}).listen(keyPair)
  const serverAddr = { host: '127.0.0.1', port: server.address().port }
  console.log('server listening on', serverAddr.port)

  const client = new HyperDHT({
    ephemeral: false,
    bootstrap: [bootstrapAddr],
    port: 0,
    host: '127.0.0.1'
  })
  await client.ready()

  console.log('client pinging server directly (no findPeer/connect)...')
  const t0 = Date.now()
  try {
    await client.ping(serverAddr)
    console.log(`ok (${Date.now() - t0}ms)`)
  } catch (err) {
    console.log(`FAILED (${Date.now() - t0}ms): ${err.message}`)
    await Promise.all([client.destroy(), server.destroy(), bootstrap.destroy()])
    process.exit(1)
    return
  }

  await Promise.all([client.destroy(), server.destroy(), bootstrap.destroy()])
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
