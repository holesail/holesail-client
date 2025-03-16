import HolesailClient from './index.js'

const client = new HolesailClient({
  key: '88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589', secure: true
})

await client.connect({ udp: false }, () => {
  const info = client.info
  console.log(`Running a ${info.protocol} client on ${info.host}:${info.port}`)
  console.log(info)
})
