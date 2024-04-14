#!/usr/bin/env node
import vm from "node:vm";
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from "node:path";

import { createContext, Location } from "skruv/utils/minidom.js";

const location = process.argv[2]
const input = process.argv[3]
const output = process.argv[4]

if (!location || !input || !output) {
  console.error('please supply a location url, one input file and one output path')
  process.exit(1)
}

const skruvSSRScript = await readFile(resolve(process.cwd(), '/', input), "utf8");

const _fetch = fetch;

const context = {
  ...createContext(),
  skruvSSRScript,
  location: new Location(location),
  console,
  fetch: async (url, opt = {}) => _fetch(new URL(url, location), opt)
}

const contextifiedObject = vm.createContext(context);
const runningVm = new vm.SourceTextModule(skruvSSRScript, { context: contextifiedObject })
await runningVm.link(async function linker(specifier, referencingModule) { throw new Error(`Unable to resolve dependency: ${specifier}`) })
await runningVm.evaluate()
await contextifiedObject.finish();
await writeFile(output, contextifiedObject.document.documentElement.innerHTML)
