// Importing required modules
const HyperDHT = require('hyperdht') // HyperDHT module for DHT functionality
const net = require('net') // Net module for creating network clients and servers

const libNet = require('@holesail/hyper-cmd-lib-net') // Custom network library
const b4a = require('b4a')

class HolesailClient {
  constructor (opts) {
    // check if secure flag is enabled
    this.seed = opts.key
    let key
    if (opts.secure) {
      this.secure = true
      this.keyPair = HyperDHT.keyPair(b4a.from(this.seed, 'hex'))
      key = this.keyPair
      this.publicKey = this.keyPair.publicKey
    } else {
      this.secure = false
    }
    console.log(this.publicKey)
    this.dht = new HyperDHT({ keyPair: key })
    this.stats = {}
  }

  async connect (options, callback) {
    this.args = options
    let key

    if (this.secure) {
      key = Buffer.from(this.publicKey, 'hex')
    } else {
      key = Buffer.from(this.seed, 'hex')
    }

    const { value } = await this.get({ latest: true })

    const protocol = JSON.parse(value).protocol

    if (protocol === 'tcp' || options.udp) {
      this.handleTCP(options, callback)
    } else {
      console.log("I executed")
      console.log(protocol)
      console.log(options.udp)
      this.handleUDP(options, callback)
    }

  } // end connect

  // Handle TCP connections
  handleTCP (options, callback) {
    this.proxy = net.createServer({ allowHalfOpen: true }, (c) => {
      return libNet.connPiper(
        c,
        () => {
          let key

          if (this.secure) {
            key = Buffer.from(this.publicKey, 'hex')
          } else {
            key = Buffer.from(this.seed, 'hex')
          }
          return this.dht.connect(key, { reusableSocket: true })
        },
        { compress: false },
        this.stats
      )
    })

    const targetHost = options.host || '127.0.0.1'
    this.proxy.listen(options.port, targetHost, () => {
      if (typeof callback === 'function') {
        callback()
        this.state = 'listening'
      }
    })
  }

  // Handle UDP connections
  handleUDP (options, callback) {
    let stream;

    if (this.secure) {
      stream = this.dht.connect(Buffer.from(this.publicKey, "hex"));
    } else {
      stream = this.dht.connect(Buffer.from(this.seed, "hex"));
    }

    stream.once('open', function () {
      const handleUDP = libNet.udpPiper(stream, () => {
        return libNet.udpConnect({
          port: options.port || 8989,
          host: options.host || '127.0.0.1',
          bind: true
        })
      })

      if (typeof callback === 'function') {
        callback()
        this.state = 'listening'
      }
    })
  }

  // resume functionality
  async resume () {
    await this.dht.resume()
    this.state = 'listening'
  }

  async pause () {
    await this.dht.suspend()
    this.state = 'paused'
  }

  async destroy () {
    await this.dht.destroy()
    this.proxy.close()
    this.proxy = null
    this.state = 'destroyed'
  }

  // get mutable record(s) stored on the dht
  async get (opts = {}) {
    const record = await this.dht.mutableGet(this.publicKey, opts)
    if (record) {
      return { seq: record.seq, value: b4a.toString(record.value) }
    }
    return null
  }

  get info () {
    return {
      state: this.state,
      secure: this.secure,
      port: this.args.port,
      host: this.args.host,
      protocol: this.args.udp ? 'udp' : 'tcp',
      key: this.seed,
      publicKey: b4a.toString(this.publicKey, 'hex')
    }
  }
} // end client class

module.exports = HolesailClient
