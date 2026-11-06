// Thin React wrappers over the Salut design system web components (dss-*).
// React 19 sets matching props as element properties; events are attached here through refs
// because React can't express custom event names such as `value-changed`.
import { useEffect, useRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import '@salut/design-system-salut'
import '@salut/design-system-salut/css/main.css'

type DssProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> } & { [prop: string]: unknown }

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'dss-alert': DssProps
      'dss-avatar': DssProps
      'dss-button': DssProps
      'dss-chip': DssProps
      'dss-drawer': DssProps
      'dss-header': DssProps
      'dss-header-menu-professional': DssProps
      'dss-icon': DssProps
      'dss-icon-button': DssProps
      'dss-input': DssProps
      'dss-link': DssProps
      'dss-modal': DssProps
      'dss-select': DssProps
      'dss-spinner': DssProps
      'dss-textarea': DssProps
      'dss-toast': DssProps
    }
  }
}

function useListener<E extends Event = Event>(name: string, handler: ((e: E) => void) | undefined) {
  const ref = useRef<HTMLElement>(null)
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fn = (e: Event) => latest.current?.(e as E)
    el.addEventListener(name, fn)
    return () => el.removeEventListener(name, fn)
  }, [name])
  return ref
}

const valueOf = (e: Event) => (e.currentTarget as HTMLElement & { value: string }).value ?? ''

type FieldProps = {
  label: string
  size?: 'sm' | 'md' | 'lg'
  value: string
  onChange: (value: string) => void
  hideLabel?: boolean
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

export function Input({
  onChange,
  onEnter,
  type = 'text',
  size = 'md',
  ...rest
}: FieldProps & { type?: string; onEnter?: () => void }) {
  const ref = useListener('input', (e) => onChange(valueOf(e)))
  const keyRef = useListener<KeyboardEvent>('keydown', (e) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault()
      onEnter()
    }
  })
  return (
    <dss-input
      ref={(el: HTMLElement | null) => {
        ref.current = el
        keyRef.current = el
      }}
      type={type}
      size={size}
      {...rest}
    />
  )
}

// Grows to fit its content (DSS autoHeight). The component only resizes on typing and first render,
// so also resize when the value is set from outside or the element becomes visible (e.g. drawer opening).
export function Textarea({ onChange, rows = 3, size = 'md', ...rest }: FieldProps & { rows?: number }) {
  const ref = useListener('input', (e) => onChange(valueOf(e)))
  useEffect(() => {
    const el = ref.current as (HTMLElement & { updateComplete?: Promise<unknown>; _updateHeight?: () => void }) | null
    if (!el) return
    const resize = () => el.updateComplete?.then(() => el._updateHeight?.())
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, rest.value])
  return <dss-textarea ref={ref} rows={rows} size={size} autoHeight {...rest} />
}

export type Option = { label: string; value: string }

// Single select. value '' means nothing selected (use placeholder for "all").
export function Select({ onChange, options, size = 'md', ...rest }: FieldProps & { options: Option[] }) {
  const ref = useListener<CustomEvent<{ inputValue: string }>>('value-changed', (e) => {
    if (e.detail.inputValue !== rest.value) onChange(e.detail.inputValue ?? '')
  })
  return <dss-select ref={ref} elements={options} deselectable size={size} {...rest} />
}

export function Button({
  label,
  onClick,
  variant = 'primary',
  status,
  icon,
  size = 'sm',
  disabled,
  loading,
}: {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'subtle'
  status?: 'danger'
  icon?: string
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
}) {
  const ref = useListener('click', () => {
    if (!disabled && !loading) onClick()
  })
  return (
    <dss-button
      ref={ref}
      label={label}
      variant={variant}
      status={status ?? 'default'}
      icon={icon}
      size={size}
      disabled={disabled}
      loading={loading}
    />
  )
}

// A dss-link used as an action (it renders <a href="#">, so the navigation is cancelled).
export function Link({ label, onClick }: { label: string; onClick: () => void }) {
  const ref = useListener('click', (e) => {
    e.preventDefault()
    onClick()
  })
  return <dss-link ref={ref} label={label} href="#" size="sm" />
}

export function IconButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  const ref = useListener('onClick', onClick)
  return <dss-icon-button ref={ref} label={label} icon={icon} variant="default" size="sm" />
}

export function Chip({ label, onDelete }: { label: string; onDelete?: () => void }) {
  const ref = useListener('delete', onDelete)
  return <dss-chip ref={ref} label={label} hasDelete={!!onDelete} disableSelect size="sm" />
}

export function Alert({ status, message }: { status: 'info' | 'success' | 'warning' | 'error'; message: string }) {
  return <dss-alert status={status} message={message} fullWidth />
}

type OverlayProps = { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }

export function Modal({ open, title, onClose, children, footer }: OverlayProps) {
  const ref = useListener('close', onClose)
  return (
    <dss-modal ref={ref} open={open} modalTitle={title}>
      <div slot="body">{children}</div>
      {footer && (
        <div slot="footer" className="actions">
          {footer}
        </div>
      )}
    </dss-modal>
  )
}

export function Drawer({ open, title, onClose, children, footer }: OverlayProps) {
  const ref = useListener('close', onClose)
  return (
    <dss-drawer ref={ref} open={open} title={title}>
      <div slot="drawer-body">{children}</div>
      {footer && (
        <div slot="drawer-footer" className="actions">
          {footer}
        </div>
      )}
    </dss-drawer>
  )
}

// App header with the Salut logo (built into dss-header) and the signed-in user on the right.
export function Header({
  title,
  name,
  email,
  onSignOut,
}: {
  title: string
  name: string
  email: string
  onSignOut: () => void
}) {
  const ref = useListener('primary-action', onSignOut)
  // dss-avatar builds its initials from name + surname.
  const [first = '', ...rest] = (name || email).split(' ')
  return (
    <dss-header titleText={title}>
      <dss-header-menu-professional
        ref={ref}
        slot="professional-menu"
        name={name || email}
        center={name ? email : undefined}
        primaryActionLabel="Tanca la sessió"
        hideViewDetails
        hideDropdownPreferences
      >
        <dss-avatar slot="avatar" name={first} surname={rest.join(' ')} size="sm" />
      </dss-header-menu-professional>
    </dss-header>
  )
}

