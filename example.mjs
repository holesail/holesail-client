import HolesailClient  from './index.js'

const test1 = new HolesailClient({
  key: '88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031588', secure: true
})

await test1.connect({ port: 9999, host: '0.0.0.0' }, () => {
  console.log('Running on http://0.0.0.0:9999')
  console.log(test1.info)
})

// 6584005b110d283ea8d060440fcd0b1fc3e8cf9f1818eb2a60238df3be6f6139

