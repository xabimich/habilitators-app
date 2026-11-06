import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Optional: AMPLIFY_OUTPUTS=<path> builds against another backend's amplify_outputs.json;
// by default the app uses ./amplify_outputs.json.
const outputs = process.env.AMPLIFY_OUTPUTS

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: outputs ? [{ find: /^.*\/amplify_outputs\.json$/, replacement: resolve(outputs) }] : [],
  },
})
