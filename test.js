const holesailClient = require("./index.js")
const goodbye = require('graceful-goodbye')

let test = new holesailClient("d8afd2605893ba587ffdc60044aa51ede164dbb71219d807ef55d624d8d09241")
test.connect(8000, "127.0.0.1", () => {
        console.log("Connected")
    }
)

// goodbye(async () => {
//     await test.destroy()
// })