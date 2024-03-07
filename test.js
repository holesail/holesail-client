const holesailClient = require("./index.js")
const goodbye = require('graceful-goodbye')

let test = new holesailClient("0a4dc87104bd424cdfbd1e36586b3a73b970347c241bcdbfa7a581bd1fb7e72b")
test.connect(8000, "127.0.0.1", () => {
        console.log("Connect to this shite lol")
    }
)

goodbye(async () => {
    await test.destroy()
})