#!/usr/bin/env node
import esbuild from 'esbuild'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import vm from 'node:vm'

import httpPlugin from './esbuildHttpPlugin.js'
import { createContext, Location, toHTML } from './minidom.js'

const input = process.argv[2]
const output = process.argv[3]

if (!input || !output) {
  console.error('please supply one input file and one output path')
  process.exit(1)
}

/** @type {Array<Function>} */
const listeners = []

/** @type {esbuild.Plugin} */
const SSEPlugin = {
  name: 'example',
  setup (build) {
    build.onEnd(result => {
      console.log(`build ended with ${result.errors.length} errors`)
      listeners.forEach(l => l())
    })
  }
}

; (async () => {
  const ctx = await esbuild.context({
    bundle: true,
    minify: true,
    format: 'esm',
    sourcemap: 'inline',
    entryPoints: [input],
    jsx: 'automatic',
    jsxImportSource: '@skruv/jsx',
    banner: {
      js: ' (() => new EventSource("/_skruv_sse_reload").addEventListener("reload", () => { location.reload() }))();'
    },
    plugins: [
      httpPlugin,
      SSEPlugin
    ],
    outfile: output
  })
  await ctx.watch()
})()

const _fetch = fetch

createServer(async (req, res) => {
  if (req.url === '/_skruv_sse_reload') {
    res.statusCode = 200
    res.setHeader('content-type', 'text/event-stream; charset=utf-8')
    const listener = () => {
      try {
        res.write(
          'retry: 1000\nevent: reload\ndata: reload\n\n\n'
        )
      } catch (e) {
        listeners.splice(listeners.indexOf(listener), 1)
      }
    }
    listeners.push(listener)
    setTimeout(() => {
      try {
        res.write(
          'retry: 1000\nevent: ping\n\n\n'
        )
      } catch (e) {
        listeners.splice(listeners.indexOf(listener), 1)
      }
    }, 1000)
  } else {
    const reqUrl = new Location(new URL(req.url || '', `http://${req.headers.host}`))
    const skruvSSRScript = await readFile(resolve(process.cwd(), input), 'utf8')

    const context = {
      ...createContext(),
      skruvSSRScript,
      location: reqUrl,
      console,
      fetch: async (/** @type {string | URL} */ url, opt = {}) => _fetch(new URL(url, reqUrl), opt)
    }

    const contextifiedObject = vm.createContext(context)
    const runningVm = new vm.SourceTextModule(skruvSSRScript, { context: contextifiedObject })
    await runningVm.link(async function linker (specifier, referencingModule) { throw new Error(`Unable to resolve dependency: ${specifier}`) })
    await runningVm.evaluate()
    await contextifiedObject.finish()

    /** @type {Record<string, string>} */
    const headers = {}
    const body = toHTML(contextifiedObject.document.documentElement, '', headers)
    res.statusCode = parseInt(headers.status || '200')
    delete headers.status
    for (const key in headers) { res.setHeader(key, headers[key]) }
    res.end(body)
  }
}).listen(process.env.PORT || 8000)

console.log(`listening on http://127.0.0.1:${process.env.PORT || 8000}. Change port with the environment variable PORT`)
