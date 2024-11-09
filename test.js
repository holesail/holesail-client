const holesailClient = require('./index.js')

const test1 = new holesailClient('d8afd2605893ba587ffdc60044aa51ede164dbb71219d807ef55d624d8d09241', 'secure')
test1.connect({ port: 10000, address: '127.0.0.1', udp: true }, () => {
  console.log('Connected UDP')
  console.log('Running on 127.0.0.1:10000')
}
)

const test2 = new holesailClient('2ecf6f05f929725dace73f99d230caa07235bc140fd0c875b0a92c6b2fbddbee')
test2.connect({ port: 5000, address: '127.0.0.1', udp: false }, () => {
  console.log('Connected TCP')
  console.log('Running on http://127.0.0.1:5000')
}
)
