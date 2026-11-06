import { useEffect, useState } from 'react'
import { Hub } from 'aws-amplify/utils'
import { confirmResetPassword, confirmSignIn, getCurrentUser, resetPassword, signIn } from 'aws-amplify/auth'
import { Alert, Button, Input, Link } from './dss'
import App from './App'

// Shows the login form until Cognito has a session, then the app.
export function AuthGate() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    getCurrentUser().then(
      () => setSignedIn(true),
      () => setSignedIn(false),
    )
    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') setSignedIn(true)
      if (payload.event === 'signedOut') setSignedIn(false)
    })
  }, [])

  if (signedIn === null) return null
  return signedIn ? <App /> : <Login />
}

type Step = 'signIn' | 'newPassword' | 'forgot' | 'resetCode'

// Users are created by an admin, so there's no sign-up. On first login Cognito asks for a new password.
// "Has oblidat la contrasenya?" emails a code (Cognito) to set a new one.
function Login() {
  const [step, setStep] = useState<Step>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  function go(next: Step) {
    setStep(next)
    setError('')
    setInfo('')
    setNewPassword('')
    setCode('')
  }

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleSignInStep(signInStep: string) {
    if (signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') go('newPassword')
    else if (signInStep !== 'DONE') setError(`Pas d'inici de sessió no suportat: ${signInStep}`)
    // DONE: the auth listener (AuthGate) switches to the app.
  }

  const username = email.trim()
  const actions: Record<Step, () => void> = {
    signIn: () =>
      username &&
      password &&
      run(async () => handleSignInStep((await signIn({ username, password })).nextStep.signInStep)),
    newPassword: () =>
      newPassword &&
      run(async () => handleSignInStep((await confirmSignIn({ challengeResponse: newPassword })).nextStep.signInStep)),
    forgot: () =>
      username &&
      run(async () => {
        await resetPassword({ username })
        go('resetCode')
        setInfo(`T'hem enviat un codi a ${username}.`)
      }),
    resetCode: () =>
      code &&
      newPassword &&
      run(async () => {
        await confirmResetPassword({ username, confirmationCode: code.trim(), newPassword })
        go('signIn')
        setPassword('')
        setInfo('Contrasenya canviada. Ja pots iniciar la sessió.')
      }),
  }
  const submit = actions[step]

  const buttonLabel: Record<Step, string> = {
    signIn: 'Inicia la sessió',
    newPassword: 'Desa la contrasenya',
    forgot: 'Envia el codi',
    resetCode: 'Canvia la contrasenya',
  }

  return (
    <div className="login">
      <div className="login-card dss-elevation--md">
        <p className="dss-headline--sm">Plataforma Oberta</p>

        {step === 'signIn' && (
          <>
            <p className="dss-body--md">Inicia la sessió amb el teu compte.</p>
            <Input label="Correu electrònic" type="email" value={email} onChange={setEmail} onEnter={submit} required />
            <Input label="Contrasenya" type="password" value={password} onChange={setPassword} onEnter={submit} required />
          </>
        )}

        {step === 'newPassword' && (
          <>
            <p className="dss-body--md">És el primer cop que hi entres. Tria una contrasenya nova.</p>
            <Input
              label="Nova contrasenya"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              onEnter={submit}
              required
            />
          </>
        )}

        {step === 'forgot' && (
          <>
            <p className="dss-body--md">Escriu el teu correu i t'enviarem un codi per canviar la contrasenya.</p>
            <Input label="Correu electrònic" type="email" value={email} onChange={setEmail} onEnter={submit} required />
          </>
        )}

        {step === 'resetCode' && (
          <>
            <Input label="Codi de verificació" value={code} onChange={setCode} onEnter={submit} required />
            <Input
              label="Nova contrasenya"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              onEnter={submit}
              required
            />
          </>
        )}

        {info && <Alert status="success" message={info} />}
        {error && <Alert status="error" message={error} />}
        <Button label={buttonLabel[step]} onClick={submit} loading={busy} />

        <div className="login-links">
          {step === 'signIn' && <Link label="Has oblidat la contrasenya?" onClick={() => go('forgot')} />}
          {step === 'resetCode' && <Link label="Torna a enviar el codi" onClick={actions.forgot} />}
          {(step === 'forgot' || step === 'resetCode') && (
            <Link label="Torna a l'inici de sessió" onClick={() => go('signIn')} />
          )}
        </div>
      </div>
    </div>
  )
}
