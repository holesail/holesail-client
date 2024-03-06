 # Holesail Client

This is a simple Node.js module that provides a complementary client for the Holesail-server and HyperDHT based servers. The module allows you to connect to the DHT network and send/receive data from other peers.

## Installation

To install the Holesail Client module, use npm:

```
npm install holesail-client
```

## Usage

To use the Holesail Client module, first require the module in your code:

```javascript
const holesailClient = require('holesail-client');
```

Then, create a new instance of the `holesailClient` class:

```javascript
const test = new holesailClient("ff14220e8155f8cd2bbeb2f6f2c3b7ed0212023449bc64b9435ec18c46b8de7f");
```

You can connect to the DHT network by calling the `connect` method:

```javascript
test.connect(5000, "127.0.0.1");
```

Once you're done using the client, you can destroy the connection to the DHT network by calling the `destroy` method:

```javascript
test.destroy();
```

## Example

Here's a simple example of how to use the Holesail Client module:

```javascript
const holesailClient = require('holesail-client');
const goodbye = require('graceful-goodbye');

let test = new holesailClient("ff14220e8155f8cd2bbeb2f6f2c3b7ed0212023449bc64b9435ec18c46b8de7f");
test.connect(5000, "127.0.0.1");

goodbye(async () => {
    await test.destroy();
});
```

## API

### `holesailClient(key)`

Create a new instance of the `holesailClient` class. The `key` parameter is a hexadecimal string representing the peer's key.

### `connect(port, address)`

Connect to the DHT network. The `port` parameter is the port number to connect to, and the `address` parameter is the IP address of the target host.

### `destroy()`

Destroy the connection to the DHT network.

## License

This module is released under the GPL-v3 License. See the [LICENSE](https://www.gnu.org/licenses/gpl-3.0.en.html) file for more information.