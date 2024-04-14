import { createContext } from '../utils/minidom.js'

const context = createContext()
// @ts-expect-error
for (const key in context) { globalThis[key] = context[key] }
