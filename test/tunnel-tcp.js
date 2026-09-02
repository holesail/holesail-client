const test = require('brittle')
const b4a = require('b4a')
const {
  createTestnet,
  startClient,
  tcpEchoServer,
  rawServer,
  connectLocal,
  readOnce
} = require('./helpers.js')

test('tunnels TCP data end-to-end through a real local proxy and real backend echo server', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })
  const client = await startClient(t, testnet, remote)

  const local = client.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  socket.write('ping-through-client-proxy')
  const reply = await readOnce(socket)
  t.is(reply.toString(), 'ping-through-client-proxy')
})

test('carries several sequential writes on one local connection without corrupting bytes', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })
  const client = await startClient(t, testnet, remote)

  const local = client.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  const chunks = ['alpha', 'beta', 'gamma']
  const received = []
  const done = new Promise((resolve) => {
    socket.on('data', (d) => {
      received.push(d.toString())
      if (received.join('') === chunks.join('')) resolve()
    })
  })

  for (const chunk of chunks) socket.write(chunk)
  await done

  t.is(received.join(''), chunks.join(''))
})

test('each new local connection opens its own tunnel and is tracked by the remote', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })
  const client = await startClient(t, testnet, remote)

  const local = client.proxy.address()

  const socketA = await connectLocal(local.port, local.address)
  socketA.write('a')
  await readOnce(socketA)

  const socketB = await connectLocal(local.port, local.address)
  socketB.write('b')
  await readOnce(socketB)

  t.is(remote.stats.tunnels, 2)

  socketA.destroy()
  socketB.destroy()
})

test('destroying the local connection closes its tunnel', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })
  const client = await startClient(t, testnet, remote)

  const local = client.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  socket.write('hello')
  await readOnce(socket)

  const closed = new Promise((resolve) => socket.once('close', resolve))
  socket.destroy()
  await closed

  t.pass('local socket closed cleanly')
})

test('client.close() stops accepting new local connections', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })
  const client = await startClient(t, testnet, remote)

  const local = client.proxy.address()
  await client.close()

  await t.exception(async () => connectLocal(local.port, local.address))
})

test('binary payloads survive the tunnel intact', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })
  const client = await startClient(t, testnet, remote)

  const local = client.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  const payload = b4a.from(Array.from({ length: 256 }, (_, i) => i))
  socket.write(payload)
  const reply = await readOnce(socket)
  t.alike(b4a.from(reply), payload)
})
