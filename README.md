
# Holesail Client

[Join our Discord Support Server](https://discord.gg/TQVacE7Vnj)

The Holesail Client is a Node.js and Bare module for connecting to Holesail Servers with secure and efficient data relaying.

----------

## Installation

Install the Holesail Client module via npm:

```bash
npm install holesail-client
```

----------

## Usage

### Importing the Module

To use the module, require it in your project:

```javascript
const HolesailClient = require('holesail-client');
```

### Creating an Instance

Create a new instance of the `HolesailClient` class by passing your peer key:

```javascript
const client = new HolesailClient(key);
```

#### Secure Mode

To establish a private connection, pass the optional "secure" flag. Ensure the server is also configured for secure mode:

```javascript
const client = new HolesailClient(key, "secure");
```

### Connecting to the Server

Use the `connect` method to establish a connection to the Holesail Server:

```javascript
client.connect({ port: 5000, address: "127.0.0.1" }, () => {
    console.log("Connected to 127.0.0.1:5000");
});
```

### Destroying the Connection

To terminate the connection and clean up resources, call the `destroy` method:

```javascript
client.destroy();
```

----------

## Example

Here is a complete example demonstrating how to use the Holesail Client:

```javascript
const HolesailClient = require('holesail-client');

// Replace with your peer key
const key = "ff14220e8155f8cd2bbeb2f6f2c3b7ed0212023449bc64b9435ec18c46b8de7f";

const client = new HolesailClient(key);

client.connect({ port: 8000, address: "127.0.0.1" }, () => {
    console.log("Connected to the server");
});

setTimeout(() => {
    console.log("Closing connection...");
    client.destroy();
}, 5000);

```

----------

## API Reference

### `new HolesailClient(key, [secure])`

Creates a new instance of the `HolesailClient` class.

#### Parameters:

-   `key` (string): A hexadecimal string representing your peer key.
-   `secure` (optional, string): Pass "secure" to enable private connections. The server must also be running in secure mode. [See private vs public mode](https://docs.holesail.io/terminology/private-vs-public-connection-string)

----------

### `connect(options, callback)`

Establishes a connection to a Holesail Server.

#### Parameters:

-   `options` (object): Connection options:
    -   `port` (number): Port number of the server.
    -   `address` (string): IP address of the server (default: "127.0.0.1").
    -   `udp` (boolean, optional): Set to `true` for UDP connections.
-   `callback` (function): A function called once the connection is successfully established.

----------

### `destroy()`

Terminates the connection and releases associated resources.

----------

## License

Holesail Client is released under the [GPL-v3 License](https://www.gnu.org/licenses/gpl-3.0.en.html).

For more details, see the [LICENSE](https://www.gnu.org/licenses/gpl-3.0.en.html) file.

----------

## Community and Support

Join our [Discord Support Server](https://discord.gg/TQVacE7Vnj) for help, discussions, and updates.
