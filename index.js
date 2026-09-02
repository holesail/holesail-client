const HyperDHT = require('hyperdht')
const libNet = require('@holesail/hyper-cmd-lib-net')
const b4a = require('b4a')
const ReadyResource = require('ready-resource')
const { parse } = require('@holesail/invite')
const proto = require('@holesail/protocol')

const { MODE_TUNNEL, MODE_PROBE } = proto

const DEFAULT = {
  port: 8989,
  host: '127.0.0.1',
  udp: false
}

class HolesailClient extends ReadyResource {
  constructor(opts = {}) {
    super()
    this.logger = opts.logger || {
      debug: noop,
      info: noop,
      warn: noop,
      error: noop
    }
    this.invite = opts.invite
    this.port = opts.port === undefined || opts.port === null ? null : +opts.port
    this.host = opts.host || null
    this.udp = opts.udp ?? null
    this.bootstrap = opts.bootstrap || null

    this.state = null
  }

  async _open() {
    if (!this.invite) throw new Error('Invite can not be null or undefined')
    const { publicKey, capability } = parse(this.invite)
    this.publicKey = publicKey
    this.capability = capability
    this.dht = new HyperDHT({ bootstrap: this.bootstrap })
    // A freshly constructed DHT node's routing table starts empty - findPeer
    // would otherwise report PEER_NOT_FOUND before bootstrap has a chance to
    // populate it (this can take several seconds on slower networks).
    await this.dht.ready()
    await this._start()
  }

  async _start() {
    this.state = 'starting'
    const needProbe = this.port === null || this.host === null || this.udp === null
    let config
    if (needProbe) {
      config = await HolesailClient.probe(this.invite, this.dht)
    }

    this.port = this.port ?? config.port ?? DEFAULT.port
    this.host = this.host ?? config.host ?? DEFAULT.host
    this.udp = this.udp ?? config.udp ?? DEFAULT.udp
    if (this.udp) await this.handleUDP()
    else await this.handleTCP()
  }

  _openTunnel() {
    const stream = this.dht.connect(this.publicKey, { reusableSocket: true })
    stream.write(proto.encodeHeader(this.capability, MODE_TUNNEL))
    this.emit('connect')
    return stream
  }

  handleTCP() {
    this.logger.debug('Handling TCP connection')
    const opts = { port: this.port, host: this.host, logger: this.logger }
    const createTunnel = () => this._openTunnel()

    return new Promise((resolve) => {
      this.proxy = libNet.createTcpProxy(createTunnel, opts, () => {
        this.state = 'listening'
        this.emit('listening')
        this.logger.info(`Proxy listening on ${this.host}:${this.port}`)
        resolve()
      })
    })
  }

  handleUDP() {
    this.logger.debug('Handling UDP connection')
    const opts = { port: this.port, host: this.host, logger: this.logger }
    const createTunnel = () => this._openTunnel()

    return new Promise((resolve) => {
      const { proxySocket, clients } = libNet.createUdpFramedProxy(createTunnel, opts, () => {
        this.state = 'listening'
        this.emit('listening')
        this.logger.info(`Proxy listening on ${this.host}:${this.port} for UDP`)
        resolve()
      })

      this.proxy = proxySocket
      this.clients = clients
    })
  }

  async resume() {
    this.logger.info('Resuming client')
    this.state = 'listening'
    await this.dht.resume()
    this.logger.info('Client resumed')
  }

  async pause() {
    this.logger.info('Pausing client')
    this.state = 'paused'
    await this.dht.suspend()
    this.logger.info('Client paused')
  }

  async _close() {
    this.logger.info('Destroying client')
    this.state = 'destroyed'
    if (this.proxy) this.proxy.close()
    if (this.clients) {
      for (const client of this.clients.values()) {
        client.stream.destroy()
      }
      this.clients.clear()
    }
    await this.dht.destroy()
    this.proxy = null
    this.clients = null
    this.logger.info('Client destroyed')
  }

  get info() {
    return {
      state: this.state,
      port: this.port,
      host: this.host,
      udp: this.udp,
      invite: this.invite
    }
  }

  static async probe(invite, dhtInstance = null) {
    const ownDHT = !!dhtInstance
    const dht = dhtInstance || new HyperDHT()
    const { publicKey, capability } = parse(invite)

    await dht.ready()

    try {
      let lastErr
      for (let attempt = 1; attempt <= PROBE_MAX_ATTEMPTS; attempt++) {
        try {
          return await HolesailClient._probeOnce(dht, publicKey, capability)
        } catch (err) {
          lastErr = err
          // DHT lookups can transiently fail to locate a peer on slow/lossy
          // transports even though the peer is up - retry a few times before
          // giving up.
          if (attempt === PROBE_MAX_ATTEMPTS || !RETRIABLE_DHT_ERRORS.has(err.code)) throw err
          await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY * attempt))
        }
      }
      throw lastErr
    } finally {
      if (!ownDHT) {
        try {
          await dht.destroy()
        } catch {}
      }
    }
  }

  static _probeOnce(dht, publicKey, capability) {
    return new Promise((resolve, reject) => {
      const stream = dht.connect(publicKey, { reusableSocket: true })
      stream.write(proto.encodeHeader(capability, MODE_PROBE))

      let buffer = b4a.alloc(0)
      let settled = false

      const finish = (err, result) => {
        if (settled) return
        settled = true
        try {
          stream.destroy()
        } catch {}
        if (err) reject(err)
        else resolve(result)
      }

      stream.on('data', (chunk) => {
        if (settled) return
        buffer = b4a.concat([buffer, chunk])
        const decoded = proto.decodeProbeResponse(buffer)
        if (!decoded) return
        finish(null, { port: decoded.port, host: decoded.host, udp: decoded.udp })
      })

      stream.on('error', (err) => finish(err))
      stream.on('close', () => finish(new Error('Stream closed before probe response')))
    })
  }
}

const PROBE_MAX_ATTEMPTS = 3
const PROBE_RETRY_DELAY = 250
const RETRIABLE_DHT_ERRORS = new Set(['PEER_NOT_FOUND', 'PEER_CONNECTION_FAILED'])

const noop = () => {}

module.exports = HolesailClient
