import { useState } from 'react'
import { client, STATUSES, TYPES, type Habilitator, type Status } from './client'
import { Alert, Button, Chip, Drawer, IconButton, Input, Select, Textarea, type Option } from './dss'

type Props = {
  habilitator: Habilitator
  knownContacts: string[]
  onClose: () => void
  onDelete: () => void
}

// AWSJSON comes back as a string; accept an object too just in case.
function parseAttributes(raw: unknown): [string, string][] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
}

// Remount with key={habilitator.id} so the draft resets when the selection changes.
export default function HabilitatorPanel({ habilitator, knownContacts, onClose, onDelete }: Props) {
  const [name, setName] = useState(habilitator.name)
  const [shortName, setShortName] = useState(habilitator.shortName ?? '')
  const [type, setType] = useState(habilitator.type ?? '')
  const [status, setStatus] = useState<Status | ''>(habilitator.status ?? '')
  const [description, setDescription] = useState(habilitator.description ?? '')
  const [contacts, setContacts] = useState<string[]>(
    (habilitator.contacts ?? []).filter((c): c is string => !!c),
  )
  const [contactInput, setContactInput] = useState('')
  const [attributes, setAttributes] = useState(() => parseAttributes(habilitator.attributes))
  const [message, setMessage] = useState<{ status: 'success' | 'error'; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  // Keep a legacy type selectable so saving doesn't silently change it.
  const typeOptions: Option[] = [
    ...TYPES.map((t) => ({ value: t.id, label: t.label })),
    ...(type && !TYPES.some((t) => t.id === type) ? [{ value: type, label: type }] : []),
  ]

  function addContact(typed = contactInput) {
    const trimmed = typed.trim()
    if (!trimmed) return
    // Reuse an existing spelling when it only differs by case.
    const value = knownContacts.find((c) => c.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
    if (!contacts.some((c) => c.toLowerCase() === value.toLowerCase())) setContacts([...contacts, value])
    setContactInput('')
  }

  // Suggest names already used elsewhere, to avoid spelling variants.
  const query = contactInput.trim().toLowerCase()
  const suggestions = query
    ? knownContacts.filter((c) => c.toLowerCase().includes(query) && !contacts.includes(c)).slice(0, 5)
    : []

  function setAttribute(index: number, key: string, value: string) {
    setAttributes(attributes.map((pair, i) => (i === index ? [key, value] : pair)))
  }

  async function save() {
    if (!name.trim()) return setMessage({ status: 'error', text: 'El nom és obligatori.' })
    setSaving(true)
    const { errors } = await client.models.Habilitator.update({
      id: habilitator.id,
      name: name.trim(),
      shortName: shortName.trim() || null,
      type: type || null,
      status: status || null,
      description: description.trim() || null,
      contacts,
      attributes: JSON.stringify(
        Object.fromEntries(attributes.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])),
      ),
    })
    setSaving(false)
    setMessage(
      errors
        ? { status: 'error', text: errors.map((e) => e.message).join(', ') }
        : { status: 'success', text: 'Canvis desats.' },
    )
  }

  return (
    <Drawer
      open
      title={habilitator.name}
      onClose={onClose}
      footer={
        confirmDelete ? (
          <>
            <Button label="Cancel·la" variant="secondary" onClick={() => setConfirmDelete(false)} />
            <Button label="Elimina definitivament" status="danger" icon="delete" onClick={onDelete} />
          </>
        ) : (
          <>
            <Button label="Elimina" variant="secondary" status="danger" icon="delete" onClick={() => setConfirmDelete(true)} />
            <Button label="Desa" icon="save" onClick={save} loading={saving} />
          </>
        )
      }
    >
      <div className="form">
        {confirmDelete && (
          <Alert status="warning" message={`S'eliminarà «${habilitator.name}» i totes les seves relacions.`} />
        )}
        {message && <Alert status={message.status} message={message.text} />}

        <Input label="Nom complet" value={name} onChange={setName} required />
        <Input
          label="Nom curt (gràfic)"
          placeholder="Opcional; si és buit, s'usa el nom complet"
          value={shortName}
          onChange={setShortName}
        />
        <Select label="Tipus" placeholder="Tria un tipus" value={type} options={typeOptions} onChange={setType} />
        <Select
          label="Estat"
          placeholder="Tria un estat"
          value={status}
          options={STATUSES.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(v) => setStatus(v as Status | '')}
        />
        <Textarea label="Descripció" value={description} onChange={setDescription} />

        <section>
          <p className="dss-subtitle--md">Persones de contacte</p>
          {contacts.length > 0 && (
            <div className="chips">
              {contacts.map((c) => (
                <Chip key={c} label={c} onDelete={() => setContacts(contacts.filter((x) => x !== c))} />
              ))}
            </div>
          )}
          <div className="row">
            <Input
              label="Afegeix contacte"
              hideLabel
              placeholder="Nom de la persona"
              value={contactInput}
              onChange={setContactInput}
              onEnter={() => addContact()}
            />
            <Button label="Afegeix" variant="secondary" icon="person_add" onClick={() => addContact()} />
          </div>
          {suggestions.length > 0 && (
            <div className="chips">
              {suggestions.map((c) => (
                <Button key={c} label={c} variant="subtle" icon="add" onClick={() => addContact(c)} />
              ))}
            </div>
          )}
        </section>

        <section>
          <p className="dss-subtitle--md">Atributs</p>
          {attributes.map(([k, v], i) => (
            <div key={i} className="row">
              <Input label="Clau" hideLabel placeholder="Clau" value={k} onChange={(key) => setAttribute(i, key, v)} />
              <Input label="Valor" hideLabel placeholder="Valor" value={v} onChange={(val) => setAttribute(i, k, val)} />
              <IconButton
                label="Elimina l'atribut"
                icon="delete"
                onClick={() => setAttributes(attributes.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <Button
            label="Afegeix atribut"
            variant="subtle"
            icon="add"
            onClick={() => setAttributes([...attributes, ['', '']])}
          />
        </section>
      </div>
    </Drawer>
  )
}
