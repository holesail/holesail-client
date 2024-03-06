const holesailClient = require("./index.js")
const goodbye = require('graceful-goodbye')

let test = new holesailClient("ff14220e8155f8cd2bbeb2f6f2c3b7ed0212023449bc64b9435ec18c46b8de7f")
test.connect(5000, "127.0.0.1")

goodbye(async () => {
    await test.destroy()
})