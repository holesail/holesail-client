const holesailClient = require("./index.js")

// let test = new holesailClient("af0449c11fa4b3c7d5f1c058bdaaa5a27bdd38c3ea807c05109fc4ba735b9186","secure")
// test.connect({port:8000, address:"127.0.0.1"}, () => {
//         console.log("Connected Privately")
//     }
// )
// setTimeout(() => {
//     console.log(test.destroy())
// }, 5000);

let test2 = new holesailClient("75ad4bc329c1e2bbe4c342617d91589f5ce88ead347e483e5e07e2b2d0d5626d")
test2.connect({port:9000, address:"127.0.0.1"}, () => {
        console.log("Connected Publicly")
    }
)