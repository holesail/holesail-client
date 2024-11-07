const holesailClient = require('./index.js')

const test1 = new holesailClient('56ccc1e74c1581eb5caecb23aed852089700f43f33820c32de5e48255d7bc7e1')
test1.connect({ port: 6000, address: '127.0.0.1', udp: true }, () => {
  console.log('Connected UDP')
  console.log('Running on 127.0.0.1:6000')
}
)

const test2 = new holesailClient('2ecf6f05f929725dace73f99d230caa07235bc140fd0c875b0a92c6b2fbddbee')
test2.connect({ port: 5000, address: '127.0.0.1', udp: false }, () => {
  console.log('Connected TCP')
  console.log('Running on 127.0.0.1:5000')
}
)
