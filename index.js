// Importing required modules
const HyperDHT = require('hyperdht') // HyperDHT module for DHT functionality
const libNet = require('/Volumes/superdisk/Developer/hyper-cmd-lib-net') // Custom network library
const b4a = require('b4a')
const z32 = require('z32')
const Protomux = require('protomux')
const ReadyResource = require('ready-resource')
const c = require('compact-encoding')
const { parse } = require('/Volumes/superdisk/Developer/verify/index.js')

const DEFAULT = {
  port: 8989,
  host: '127.0.0.1',
  udp: 'false'
}

class HolesailClient extends ReadyResource {
  constructor(opts = {}) {
    super()
    this.logger = opts.logger || {
      debug: (data) => console.log(data),
      info: (data) => console.log(data),
      warn: () => {},
      error: () => {}
    }
    this.invite = opts.invite
    this.dht = new HyperDHT()
    this.stats = {}
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
    const config = await HolesailClient.probe(this.invite)
    this.port = this._port ?? config.port ?? DEFAULT.port
    this.host = this._host ?? config.host ?? DEFAULT.host
    this.udp = this._udp ?? config.udp ?? DEFAULT.udp
    this.state = 'waiting'
    if (this.udp) {
      this.handleUDP()
    } else {
      this.handleTCP()
    }
  } // end connect

  _authenticate(stream) {
    const mux = new Protomux(stream)
    const channel = mux.createChannel({
      protocol: 'holesail-auth',
      onopen: () => {
        this.logger.debug('Auth channel opened')
      },
      messages: [
        {
          encoding: c.any,
          onmessage: (m) => {
            this.logger.debug('Auth response received')
            channel.close()
            mux.destroy()
          }
        }
      ]
    })
    channel.open()
    channel.messages[0].send({ capability: this.capability })
  }

  handleTCP() {
    this.logger.debug('Handling TCP connection')

    this.proxy = libNet.createTcpProxy(
      { port: this.port, host: this.host },
      () => {
        console.log('i was called')
        const stream = this.dht.connect(this.publicKey, { reusableSocket: true })
        this._authenticate(stream)
        return stream
      },
      { compress: false, logger: this.logger },
      this.stats,
      () => {
        this.state = 'listening'
        this.logger.info(`Proxy listening on ${this.host}:${this.port}`)
      }
    )
  }

  // Handle UDP connections (updated for framed reliable tunneling with multi-client support)
  handleUDP(options, callback) {
    this.logger.debug('Handling UDP connection')
    const { proxySocket, clients } = libNet.createUdpFramedProxy(
      { port: options.port, host: options.host },
      () => {
        const stream = this.dht.connect(this.publicKey)
        this._authenticate(stream)
        return stream
      },
      this.logger,
      () => {
        this.state = 'listening'
        this.logger.info(`Proxy listening on ${options.host}:${options.port} for UDP`)
        callback?.()
      }
    )
    this.proxy = proxySocket
    this.clients = clients
  }

  // resume functionality
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

  // done
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

  // done
  static async probe(invite, dhtInstance = null) {
    const ownDHT = !dhtInstance
    const dht = dhtInstance || new HyperDHT()

    const { publicKey, capability } = parse(invite)

    return new Promise((resolve, reject) => {
      const stream = dht.connect(publicKey, { reusableSocket: true })
      const mux = new Protomux(stream)

      const channel = mux.createChannel({
        protocol: 'holesail-probe',
        messages: [
          {
            encoding: c.any,
            onmessage: async (m) => {
              const { port, host, udp } = m
              try {
                // channel.close?.()
                // stream.destroy()
                // mux.destroy?.()

                if (ownDHT) {
                  // await dht.destroy()
                }
              } catch (e) {}

              resolve({ port, host, udp })
            }
          }
        ]
      })

      channel.open()
      channel.messages[0].send({ capability })

      stream.on('error', async (err) => {
        try {
          stream.destroy()
          if (ownDHT) await dht.destroy()
        } catch {}

        reject(err)
      })
    })
  }
} // end client class

module.exports = HolesailClient
