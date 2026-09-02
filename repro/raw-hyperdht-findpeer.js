'use strict'
// Every reachability test so far passes on Windows (transport, dht-rpc
// ping, HyperDHT ping, server pinging out after listen(), even an
// independent third node pinging the server directly). Yet the full
// connect() scenario in index.js still fails with PEER_NOT_FOUND. This
// isolates the actual discovery step: after the server announces, does a
// raw findPeer query for its public key ever come back with a stored
// value anywhere - independent of holepunching/connect().

const HyperDHT = require('hyperdht')
const { hash } = require('hyperdht/lib/crypto')
const { COMMANDS } = require('hyperdht/lib/constants')

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
  console.log('server announced, public key', keyPair.publicKey.toString('hex').slice(0, 16))

  const client = new HyperDHT({
    ephemeral: false,
    bootstrap: [bootstrapAddr],
    port: 0,
    host: '127.0.0.1'
  })
  await client.ready()

  const target = hash(keyPair.publicKey)
  let n = 0
  let hasValueCount = 0

  console.log('raw findPeer query for the server public key...')
  const t0 = Date.now()
  const q = client.query(
    { target, command: COMMANDS.FIND_PEER, value: null },
    {
      map: (node) => ({
        from: node.from,
        error: node.error,
        hasValue: !!node.value,
        valueLen: node.value ? node.value.length : 0
      })
    }
  )
  for await (const data of q) {
    n++
    if (data.hasValue) hasValueCount++
    console.log(`reply #${n}`, JSON.stringify(data))
  }
  console.log(
    `findPeer finished in ${Date.now() - t0}ms, ${n} replies, ${hasValueCount} with value`
  )

  await Promise.all([client.destroy(), server.destroy(), bootstrap.destroy()])

  if (hasValueCount === 0) {
    console.error('FAILED: announced record was never found anywhere')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
