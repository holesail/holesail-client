import HolesailClient from './index.js'

const client = new HolesailClient({
  invite:
    'hs_yf8xtcpyffw3zzhj1k4hgbt98gi97bdagf8w7rnp7smzh34sptuiwawfrrbo5famjfnrhkbc6f331y6q8wkzn8truogq6ej9rressmqg5nzzw1y',
  port: 7777,
  udp: false
})

await client.ready()
