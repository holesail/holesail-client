// Importing required modules
const HyperDHT = require('hyperdht')  // HyperDHT module for DHT functionality
const net = require('net')  // Node.js net module for creating network clients and servers
const libNet = require('@holesail/hyper-cmd-lib-net')  // Custom network library
const libKeys = require('hyper-cmd-lib-keys') // To generate a random preSeed for server seed.

class holesailClient {

    constructor(key) {
        this.peerKey = key;
        this.stats = {}
        this.dht = new HyperDHT()
        this.proxy
    }

    connect(options, callback) {
         this.proxy = net.createServer({allowHalfOpen: true}, c => {
            return libNet.connPiper(c, () => {
                const stream = this.dht.connect(Buffer.from(this.peerKey, 'hex'), {reusableSocket: true})
                stream.setKeepAlive(5000)
                return stream
            }, {compress: false},this.stats)
        })

        const targetHost = options.address || '127.0.0.1'
        this.proxy.listen(+options.port, targetHost, () => {
            if (typeof callback === 'function'){
                callback()
            }
            //do anything you want after starting to listen on the peer seed
        })

    } //end connect

    destroy() {
        this.dht.destroy()
        this.proxy.close()
        return 0
    }
} //end client class

module.exports = holesailClient

//TODO: Compresession
//TODO: Secure connection with Pairing key only