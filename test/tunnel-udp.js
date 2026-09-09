const test = require('brittle')
const b4a = require('b4a')
const {
  createTestnet,
  startClient,
  udpEchoServer,
  rawServer,
  bindUdpClient,
  udpSend,
  udpReceiveOnce
} = require('./helpers.js')

test('tunnels UDP datagrams end-to-end through a real local proxy and real backend echo server', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)
  const remote = await rawServer(t, testnet, {
    port: echo.address().port,
    host: '127.0.0.1',
    udp: true
  })
  const client = await startClient(t, testnet, remote, { udp: true })

  const local = client.proxy.address()
  const udpClient = await bindUdpClient(t)

  await udpSend(udpClient, local.port, local.address, b4a.from('udp-ping'))
  const reply = await udpReceiveOnce(udpClient)

  t.is(b4a.toString(reply), 'udp-ping')
})

test('carries several distinct UDP datagrams from the same local client', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)
  const remote = await rawServer(t, testnet, {
    port: echo.address().port,
    host: '127.0.0.1',
    udp: true
  })
  const client = await startClient(t, testnet, remote, { udp: true })

  const local = client.proxy.address()
  const udpClient = await bindUdpClient(t)

  const messages = ['one', 'two', 'three']
  const received = []
  udpClient.on('message', (msg) => received.push(b4a.toString(msg)))

  for (const msg of messages) {
    await udpSend(udpClient, local.port, local.address, b4a.from(msg))
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  await new Promise((resolve) => setTimeout(resolve, 100))

  t.alike(received.sort(), messages.sort())
})

test('info.udp is true when the client is configured for udp', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)
  const remote = await rawServer(t, testnet, {
    port: echo.address().port,
    host: '127.0.0.1',
    udp: true
  })
  const client = await startClient(t, testnet, remote, { udp: true })

  t.is(client.info.udp, true)
})
