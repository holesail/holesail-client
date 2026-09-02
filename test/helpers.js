const testnet = require('hyperdht/testnet.js')
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
  return testnet(size, { teardown: t.teardown })
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
  const dht = new HyperDHT({ bootstrap: testnet.bootstrap, firewalled: false })
  // Announcing before bootstrap finishes populating the routing table means
  // the announce's own node-discovery lookup finds nothing to store the
  // record with - it "succeeds" having told no one. On fast networks
  // bootstrap resolves before anyone notices; on slower ones this silently
  // makes the server unreachable via probe/connect.
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
