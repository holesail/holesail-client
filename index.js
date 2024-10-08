// Importing required modules
const HyperDHT = require('hyperdht')  // HyperDHT module for DHT functionality
let net = require('net'); // Node.js net module for creating network clients and servers

const libNet = require('@holesail/hyper-cmd-lib-net')  // Custom network library
const libKeys = require('hyper-cmd-lib-keys') // To generate a random preSeed for server seed.
const b4a = require('b4a')

class holesailClient {

    constructor(key, secure) {
        //check if secure flag is enabled
        if (secure === "secure") {
            this.secure = true;
            this.peerKey = HyperDHT.keyPair(b4a.from(key, 'hex'));
            this.dht = new HyperDHT({keyPair: this.peerKey})
        } else {
            this.peerKey = key;
            this.dht = new HyperDHT()

        }

        this.stats = {}
        this.proxy
    }

    connect(options, callback) {
        this.proxy = net.createServer({allowHalfOpen: true}, c => {
            return libNet.connPiper(c, () => {
                let stream;
                if (this.secure) {
                     stream = this.dht.connect(Buffer.from(this.peerKey.publicKey, 'hex'), {reusableSocket: true})
                } else {
                     stream = this.dht.connect(Buffer.from(this.peerKey, 'hex'), {reusableSocket: true})
                }
                stream.setKeepAlive(5000)
                return stream
            }, {compress: false}, this.stats)
        })

        const targetHost = options.address || '127.0.0.1'
        this.proxy.listen(options.port, targetHost, () => {
            if (typeof callback === 'function') {
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

//TODO: Compression