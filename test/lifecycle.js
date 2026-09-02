const test = require('brittle')
const HolesailClient = require('../index.js')
const { randomSeed } = require('@holesail/invite')
const {
  createTestnet,
  tcpEchoServer,
  rawServer,
  getFreePort,
  connectLocal,
  createLogger
} = require('./helpers.js')

test('constructor - throws on ready() when no invite is given', async (t) => {
  const client = new HolesailClient()
  await t.exception(() => client.ready(), /Invite can not be null or undefined/)
})

test('constructor - defaults to a silent noop logger', async (t) => {
  const client = new HolesailClient({ invite: 'hs_bogus' })
  t.execution(() => client.logger.debug('x'))
  t.execution(() => client.logger.info('x'))
  t.execution(() => client.logger.warn('x'))
  t.execution(() => client.logger.error('x'))
})

test('ready() - connects to a real server and listens locally with explicit port/host/udp', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false
  })
  t.teardown(() => client.close())

  await client.ready()

  t.is(client.state, 'listening')
  t.ok(client.proxy, 'local proxy is bound')
  t.is(remote.stats.probes, 0, 'explicit port/host/udp skips probing entirely')
})

test('ready() - probes the server when port/host/udp are not supplied', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  // Advertise a distinct, genuinely free port for the client to bind its
  // local proxy to - it must differ from the real echo port because both
  // the client's local proxy and the backend live on the same 127.0.0.1 in
  // this test, and the client's default local port mirrors the probed port.
  const advertisedPort = await getFreePort()
  const remote = await rawServer(t, testnet, {
    port: echo.address().port,
    host: '127.0.0.1',
    advertisedPort
  })

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap
  })
  t.teardown(() => client.close())

  await client.ready()

  t.is(remote.stats.probes, 1)
  t.is(client.port, advertisedPort)
  t.is(client.host, '127.0.0.1')
  t.is(client.udp, false)
})

test('ready() - explicit port/host are kept even when udp still needs probing', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, {
    port: echo.address().port,
    host: '127.0.0.1',
    udp: false
  })

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1'
  })
  t.teardown(() => client.close())

  await client.ready()

  t.is(remote.stats.probes, 1, 'udp being unset still triggers a probe')
  t.is(client.port, 0, 'explicit port was not overwritten by the probe result')
  t.is(client.udp, false, 'udp was filled in from the probe response')
})

test('custom logger receives info calls during startup', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })
  const { logger, calls } = createLogger()

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false,
    logger
  })
  t.teardown(() => client.close())

  await client.ready()

  t.ok(calls.info.length > 0)
})

test('info - reflects live client state', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false
  })
  t.teardown(() => client.close())
  await client.ready()

  const info = client.info
  t.is(info.state, 'listening')
  t.is(info.host, '127.0.0.1')
  t.is(info.udp, false)
  t.is(info.invite, remote.invite)
})

test('pause()/resume() - transitions state and the proxy still tunnels after resume', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false
  })
  t.teardown(() => client.close())
  await client.ready()

  await client.pause()
  t.is(client.state, 'paused')

  await client.resume()
  t.is(client.state, 'listening')
})

test('close() - tears down the proxy and dht', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false
  })
  await client.ready()

  await client.close()

  t.is(client.state, 'destroyed')
  t.is(client.proxy, null)
  t.ok(client.closed, 'ReadyResource marks the instance closed')
})

test('seed determinism - same seed on the raw server always exercises the same invite', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const seed = randomSeed()

  const remoteA = await rawServer(t, testnet, {
    port: echo.address().port,
    host: '127.0.0.1',
    seed
  })
  const remoteB = await rawServer(t, testnet, {
    port: echo.address().port,
    host: '127.0.0.1',
    seed
  })

  t.is(remoteA.invite, remoteB.invite)
})

test('connect event fires once per outbound tunnel dial', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const remote = await rawServer(t, testnet, { port: echo.address().port, host: '127.0.0.1' })

  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false
  })
  t.teardown(() => client.close())
  await client.ready()

  let connects = 0
  client.on('connect', () => connects++)

  const local = client.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  await new Promise((resolve) => setTimeout(resolve, 50))

  t.is(connects, 1)
  socket.destroy()
})
