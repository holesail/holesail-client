// Importing required modules
const HyperDHT = require('hyperdht') // HyperDHT module for DHT functionality
const net = require('net') // Net module for creating network clients and servers

const UDX = require('udx-native') // required for UDP
const udp = new UDX()

const libNet = require('@holesail/hyper-cmd-lib-net') // Custom network library
const libKeys = require('hyper-cmd-lib-keys') // To generate a random preSeed for server seed.
const b4a = require('b4a')

class holesailClient {
  constructor (key, secure) {
    // check if secure flag is enabled
    if (secure === 'secure') {
      this.secure = true
      this.peerKey = HyperDHT.keyPair(b4a.from(key, 'hex')).publicKey
      this.dht = new HyperDHT({ keyPair: this.peerKey })
    } else {
      this.peerKey = key
      this.dht = new HyperDHT()
    }

    this.stats = {}
    this.proxy
  }

  connect (options, callback) {
    if (!options.udp) {
      this.handleTCP(options, callback)
    } else {
      this.handleUDP(options, callback)
    }
  } // end connect

  // Handle TCP connections
  handleTCP (options, callback) {
    this.proxy = net.createServer({ allowHalfOpen: true }, c => {
      return libNet.connPiper(c, () => {
        const stream = this.dht.connect(Buffer.from(this.peerKey, 'hex'), { reusableSocket: true })
        // stream.setKeepAlive(5000)
        return stream
      }, { compress: false }, this.stats)
    })

    const targetHost = options.address || '127.0.0.1'
    this.proxy.listen(options.port, targetHost, () => {
      if (typeof callback === 'function') {
        callback()
      }
      // do anything you want after starting to listen on the peer seed
    })
  }

  // Handle UDP connections
  async handleUDP (options, callback) {
    const conn = await this.dht.connect(this.peerKey)
    const server = udp.createSocket('udp4')

    conn.once('open', function () {
      conn.on('message', (buf) => {
        server.send(buf, options.port)
      })

      if (typeof callback === 'function') {
        callback()
      }
    })
  }

  destroy () {
    this.dht.destroy()
    this.proxy.close()
    return 0
  }
} // end client class

module.exports = holesailClient
