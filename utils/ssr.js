import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import vm from 'node:vm'

import { createContext, Location, toHTML } from './minidom.js'

const input = process.argv[2]

;(async () => {
  const skruvSSRScript = await readFile(resolve(process.cwd(), input), 'utf8')
  const module = new vm.SourceTextModule(skruvSSRScript)
  // @ts-expect-error
  const cachedData = module.createCachedData()

  const _fetch = fetch

  createServer(async (req, res) => {
    const reqUrl = new Location(new URL(req.url || '', `http://${req.headers.host}`))

    const context = {
      ...createContext(),
      skruvSSRScript,
      location: reqUrl,
      console,
      fetch: async (/** @type {string | URL} */ url, opt = {}) => _fetch(new URL(url, reqUrl), opt)
    }

    const contextifiedObject = vm.createContext(context)
    const runningVm = new vm.SourceTextModule(skruvSSRScript, { context: contextifiedObject, cachedData })
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
  }).listen(process.env.PORT || 8000)

  console.log(`listening on http://127.0.0.1:${process.env.PORT || 8000}. Change port with the environment variable PORT`)
})()
