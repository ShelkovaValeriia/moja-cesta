/* global fetch, AbortSignal, console, URL */
import { mkdir, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
const output = new URL('../tmp/map-research/', import.meta.url)
await mkdir(output, { recursive: true })
for (const [name, url, options] of [
  ['072828.pdf', 'https://sadpp.sk/wp-content/uploads/2026/09/072828.pdf', {}],
  ['clinic.html', 'https://poi.oma.sk/w58781062', {}],
]) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(90000) })
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  await writeFile(new URL(name, output), Buffer.from(await response.arrayBuffer()))
  console.log(`Saved ${name}`)
}
