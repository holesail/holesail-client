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
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    }
    this.invite = opts.invite
    this.dht = new HyperDHT({ bootstrap: opts.bootstrap })
    this._port = opts.port
    this._host = opts.host
    this._udp = opts.udp
    this.port = null
    this.host = null
    this.udp = null
  }

  async _open() {
    const { publicKey, capability } = parse(this.invite)
    this.publicKey = publicKey
    this.capability = capability
    await this._start()
  }

  async _start() {
    const needProbe = this._port == null || this._host == null || this._udp == null
    let config
    if (needProbe) {
      config = await HolesailClient.probe(this.invite, this.dht)
    }

    this.port = this._port ?? config.port ?? DEFAULT.port
    this.host = this._host ?? config.host ?? DEFAULT.host
    this.udp = this._udp ?? config.udp ?? DEFAULT.udp
    this.state = 'waiting'
    if (this.udp) this.handleUDP()
    else this.handleTCP()
  }

  _openTunnel() {
    const stream = this.dht.connect(this.publicKey, { reusableSocket: true })
    stream.write(proto.encodeHeader(this.capability, MODE_TUNNEL))
    return stream
  }

  handleTCP() {
    this.logger.debug('Handling TCP connection')
    const opts = { port: this.port, host: this.host, logger: this.logger }
    const createTunnel = () => this._openTunnel()

    this.proxy = libNet.createTcpProxy(createTunnel, opts, () => {
      this.state = 'listening'
      this.logger.info(`Proxy listening on ${this.host}:${this.port}`)
    })
  }

  handleUDP() {
    this.logger.debug('Handling UDP connection')
    const opts = { port: this.port, host: this.host, logger: this.logger }
    const createTunnel = () => this._openTunnel()
    const { proxySocket, clients } = libNet.createUdpFramedProxy(createTunnel, opts, () => {
      this.state = 'listening'
      this.logger.info(`Proxy listening on ${this.host}:${this.port} for UDP`)
    })

    this.proxy = proxySocket
    this.clients = clients
  }

  async resume() {
    this.logger.info('Resuming client')
    await this.dht.resume()
    this.state = 'listening'
    this.logger.info('Client resumed')
  }

  async pause() {
    this.logger.info('Pausing client')
    await this.dht.suspend()
    this.state = 'paused'
    this.logger.info('Client paused')
  }

  async destroy() {
    this.logger.info('Destroying client')
    await this.dht.destroy()
    if (this.proxy) this.proxy.close()
    if (this.clients) {
      for (const client of this.clients.values()) {
        client.remoteStream.destroy()
      }
      this.clients.clear()
    }
    this.proxy = null
    this.clients = null
    this.state = 'destroyed'
    this.logger.info('Client destroyed')
  }

  get info() {
    return {
      type: 'client',
      state: this.state,
      port: this.port,
      host: this.host,
      protocol: this.udp ? 'udp' : 'tcp',
      invite: this.invite
    }
  }

  static async probe(invite, dhtInstance = null) {
    const ownDHT = !dhtInstance
    const dht = dhtInstance || new HyperDHT()
    const { publicKey, capability } = parse(invite)

    return new Promise((resolve, reject) => {
      const stream = dht.connect(publicKey, { reusableSocket: true })
      stream.write(proto.encodeHeader(capability, MODE_PROBE))

      let buffer = b4a.alloc(0)
      let settled = false

      const finish = async (err, result) => {
        if (settled) return
        settled = true
        try {
          stream.destroy()
        } catch {}
        if (ownDHT) {
          try {
            await dht.destroy()
          } catch {}
        }
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

module.exports = HolesailClient
