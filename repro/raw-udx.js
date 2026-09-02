'use strict'
// Even more minimal: no hyperdht, no dht-rpc, just udx-native (the raw UDP
// transport underneath both). Two sockets on the same host: one bound to an
// explicit, specific port (the way dht-rpc's "server" socket binds so it can
// be reached by others), one bound to port 0 (an OS-chosen ephemeral port,
// the way dht-rpc's "client" socket binds). B pings A; A echoes back to B.
//
// If the explicit-port socket can't receive/reply where the ephemeral-port
// socket can, the bug is in udx-native/libudx itself, independent of any DHT
// logic (routing tables, firewalled flags, request/response tracking).

const UDX = require('udx-native')

async function main() {
  const udx = new UDX()

  const a = udx.createSocket()
  a.bind(41234, '127.0.0.1') // explicit port, like a "server" socket

  const b = udx.createSocket()
  b.bind(0, '127.0.0.1') // port 0, like a "client" socket

  let aGotPing = false
  let bGotPong = false

  a.on('message', (msg, { host, port }) => {
    aGotPing = true
    console.log('A received:', msg.toString())
    a.trySend(Buffer.from('pong'), port, host)
  })

  b.on('message', (msg) => {
    bGotPong = true
    console.log('B received:', msg.toString())
  })

  console.log(`B (port ${b.address().port}) -> A (port ${a.address().port})`)
  b.trySend(Buffer.from('ping'), a.address().port, '127.0.0.1')

  await new Promise((resolve) => setTimeout(resolve, 3000))

  console.log('A got ping:', aGotPing)
  console.log('B got pong:', bGotPong)

  await a.close()
  await b.close()

  if (!aGotPing || !bGotPong) {
    console.error('FAILED: explicit-port socket did not send/receive correctly')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
