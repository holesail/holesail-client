import HolesailClient from './index.js'

// const client = new HolesailClient({
//   key: 'fwkkgncpatjpt5j6n53beqjoz7wtxtbse8d7u9z1y17esbz5dhpo',
//   secure: true
// })

// await client.connect({ udp: false }, () => {
//   const info = client.info
//   console.log(`Running a ${info.protocol} client on ${info.host}:${info.port}`)
//   console.log(info)
// })

const client = new HolesailClient({
  invite:
    'hs_yf8xtcpyffw3zzhj1k4hgbt98gi97bdagf8w7rnp7smzh34sptuiwawfrrbo5famjfnrhkbc6f331y6q8wkzn8truogq6ej9rressmqg5nzzw1y',
  port: 4444
})

await client.ready()

// const c = await HolesailClient.probe(
//   'hs_yf8xtcpyffw3zzhj1k4hgbt98gi97bdagf8w7rnp7smzh34sptuiwawfrrbo5famjfnrhkbc6f331y6q8wkzn8truogq6ej9rressmqg5nzzw1y'
// )
