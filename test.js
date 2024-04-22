const holesailClient = require("./index.js")

let test = new holesailClient("d8afd2605893ba587ffdc60044aa51ede164dbb71219d807ef55d624d8d09241")
test.connect({port:8000, address:"127.0.0.1"}, () => {
        console.log("Connected")
    }
)
setTimeout(() => {
    console.log(test.destroy())
}, 5000);

