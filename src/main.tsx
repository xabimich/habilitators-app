import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
import './dss'
import './index.css'
import { AuthGate } from './Login.tsx'

Amplify.configure(outputs)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)
