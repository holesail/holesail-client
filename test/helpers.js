const HyperDHT = require('hyperdht')
const net = require('net')
const dgram = require('dgram')
const b4a = require('b4a')
const z32 = require('z32')
const hcrypto = require('hypercore-crypto')
const libNet = require('@holesail/hyper-cmd-lib-net')
const proto = require('@holesail/protocol')
const { generate } = require('@holesail/invite')
const HolesailClient = require('../index.js')

const { MODE_TUNNEL, MODE_PROBE } = proto

async function createTestnet(t, size = 3) {
  // hyperdht/testnet.js only passes an explicit (random) port to its first
  // node - every later node is constructed with no port at all, so it falls
  // back to HyperDHT's hardcoded default port (49737). Binding that same
  // fixed port from many nodes in the same process normally fails loudly
  // (EADDRINUSE) and falls back to a random one - except on Windows, where a
  // duplicate UDP bind can succeed silently, leaving multiple DHT nodes
  // sharing one port and each other's traffic. Building the swarm here with
  // an explicit random port on every node avoids relying on that fallback.
  const nodes = []
  const bootstrap = []

  const first = new HyperDHT({
    ephemeral: false,
    firewalled: false,
    bootstrap: [],
    port: 0,
    host: '127.0.0.1'
  })
  await first.ready()
  nodes.push(first)
  bootstrap.push({ host: '127.0.0.1', port: first.address().port })

  while (nodes.length < size) {
    const node = new HyperDHT({
      ephemeral: false,
      firewalled: false,
      bootstrap,
      port: 0,
      host: '127.0.0.1'
    })
    await node.ready()
    nodes.push(node)
  }

  t.teardown(
    async () => {
      for (let i = nodes.length - 1; i >= 0; i--) await nodes[i].destroy()
    },
    { order: Infinity }
  )

  return {
    nodes,
    bootstrap,
    [Symbol.iterator]() {
      return nodes[Symbol.iterator]()
    }
  }
}

async function startClient(t, testnet, remote, opts = {}) {
  const client = new HolesailClient({
    invite: remote.invite,
    bootstrap: testnet.bootstrap,
    port: 0,
    host: '127.0.0.1',
    udp: false,
    ...opts
  })
  t.teardown(async () => await client.close())
  await client.ready()
  return client
}

function tcpEchoServer(t) {
  return new Promise((resolve, reject) => {
    const sockets = new Set()
    const server = net.createServer({ allowHalfOpen: true }, (sock) => {
      sockets.add(sock)
      sock.on('close', () => sockets.delete(sock))
      sock.on('data', (d) => sock.write(d))
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      // server.close() alone only stops accepting new connections - it
      // does not close already-accepted sockets, which would otherwise
      // linger half-open (allowHalfOpen) for the lifetime of the process.
      t.teardown(() => {
        for (const sock of sockets) sock.destroy()
        server.close()
      })
      resolve(server)
    })
  })
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function udpEchoServer(t) {
  return new Promise((resolve, reject) => {
    const server = dgram.createSocket('udp4')
    server.on('message', (msg, rinfo) => {
      server.send(msg, 0, msg.length, rinfo.port, rinfo.address)
    })
    server.on('error', reject)
    server.bind(0, '127.0.0.1', () => {
      t.teardown(() => server.close())
      resolve(server)
    })
  })
}

async function rawServer(t, testnet, opts = {}) {
  const { capability, keyPair, invite } = generate(opts.seed)
  const dht = new HyperDHT({
    bootstrap: testnet.bootstrap,
    firewalled: false,
    port: 0,
    // Bootstrap only ever contains the swarm's entry node - everything else
    // this dht knows is normally discovered via its own self-lookup query
    // during bootstrap, which on some platforms can finish having found (and
    // so stored) nothing, leaving the announce with no one to tell. Seeding
    // every testnet node directly into the routing table up front means the
    // announce always has somewhere to go regardless of whether that
    // self-lookup actually worked.
    nodes: testnet.nodes.map((node) => ({ host: '127.0.0.1', port: node.address().port }))
  })
  await dht.ready()

  const stats = { probes: 0, tunnels: 0, rejected: 0 }

  // pipeTcpServer/pipeUdpFramedServer open their own local socket per
  // tunnel (a real TCP connection or, for UDP, a dedicated dgram socket).
  // Those only close once the DHT stream itself closes, so track every
  // stream and force-close it before tearing down the dht - otherwise the
  // per-tunnel local sockets can outlive the test.
  const openStreams = new Set()
  t.teardown(() => {
    for (const stream of openStreams) stream.destroy()
  })
  t.teardown(() => dht.destroy())

  const server = dht.createServer({ reusableSocket: true }, (stream) => {
    openStreams.add(stream)
    stream.on('close', () => openStreams.delete(stream))
    onConnection(stream)
  })

  function onConnection(stream) {
    stream.on('error', () => {})

    let buffer = b4a.alloc(0)
    const onData = (chunk) => {
      buffer = b4a.concat([buffer, chunk])
      const decoded = proto.decodeHeader(buffer)
      if (!decoded) return
      stream.removeListener('data', onData)

      const { capability: gotCapability, mode, leftover } = decoded

      if (!b4a.equals(gotCapability, capability)) {
        stats.rejected++
        stream.destroy()
        return
      }

      if (mode === MODE_PROBE) {
        stats.probes++
        stream.end(
          proto.encodeProbeResponse({
            port: opts.advertisedPort ?? opts.port,
            host: opts.advertisedHost ?? opts.host,
            udp: !!opts.udp
          })
        )
        return
      }

      if (mode === MODE_TUNNEL) {
        stats.tunnels++
        const pipeOpts = { port: opts.port, host: opts.host }
        if (opts.udp) libNet.pipeUdpFramedServer(stream, leftover, pipeOpts)
        else libNet.pipeTcpServer(stream, leftover, pipeOpts)
        return
      }

      stream.destroy()
    }
    stream.on('data', onData)
  }

  await server.listen(keyPair)

  if (process.env.HOLESAIL_DEBUG_PROBE) {
    const { COMMANDS } = require('hyperdht/lib/constants')
    console.error(
      '[debug:server]',
      'table size =',
      dht.table.toArray().length,
      'relayAddresses =',
      JSON.stringify(server.relayAddresses)
    )
    let n = 0
    const q = dht.query(
      { target: server.target, command: COMMANDS.FIND_PEER, value: null },
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
      console.error('[debug:server] self-query reply #' + n, JSON.stringify(data))
    }
    console.error('[debug:server] self-query finished, total replies =', n)
  }

  return { dht, server, keyPair, capability, invite, stats }
}

function waitForEvent(emitter, event) {
  return new Promise((resolve) => emitter.once(event, (...args) => resolve(args[0])))
}

function readOnce(stream) {
  return new Promise((resolve, reject) => {
    stream.once('data', (d) => resolve(d))
    stream.once('error', reject)
  })
}

function connectLocal(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

function bindUdpClient(t) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.on('error', reject)
    socket.bind(0, '127.0.0.1', () => {
      t.teardown(() => socket.close())
      resolve(socket)
    })
  })
}

function udpSend(socket, port, host, payload) {
  return new Promise((resolve, reject) => {
    socket.send(payload, 0, payload.length, port, host, (err) => (err ? reject(err) : resolve()))
  })
}

function udpReceiveOnce(socket) {
  return new Promise((resolve, reject) => {
    socket.once('message', (msg) => resolve(msg))
    socket.once('error', reject)
  })
}

function createLogger() {
  const calls = { debug: [], info: [], warn: [], error: [] }
  const logger = {
    debug: (...a) => calls.debug.push(a),
    info: (...a) => calls.info.push(a),
    warn: (...a) => calls.warn.push(a),
    error: (...a) => calls.error.push(a)
  }
  return { logger, calls }
}

function createInvite(publicKey, capability = hcrypto.randomBytes(32)) {
  const VERSION = b4a.from([1])
  const base = b4a.concat([VERSION, publicKey, capability])
  const checksum = hcrypto.hash(base).subarray(0, 4)
  return 'hs_' + z32.encode(b4a.concat([base, checksum]))
}

module.exports = {
  createTestnet,
  startClient,
  tcpEchoServer,
  udpEchoServer,
  getFreePort,
  rawServer,
  waitForEvent,
  readOnce,
  connectLocal,
  bindUdpClient,
  udpSend,
  udpReceiveOnce,
  createLogger,
  createInvite
}
