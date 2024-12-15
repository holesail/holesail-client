const Holesailclient = require('./index.js')

const test1 = new Holesailclient(
  'd8afd2605893ba587ffdc60044aa51ede164dbb71219d807ef55d624d8d09241',
  'secure'
)
test1.connect({ port: 10000, address: '0.0.0.0', udp: true }, () => {
  console.log('Connected UDP')
  console.log('Running on 0.0.0.0:10000')
})

const test2 = new Holesailclient(
  'b670936147a75633bd786d6c4e45c3e0965ce780b201b746adb9fc840b8d5a24'
)
test2.connect({ port: 8989, address: '127.0.0.1', udp: false }, () => {
  console.log('Connected TCP')
  console.log('Running on 127.0.0.1:8989')
})
