import { useEffect, useMemo, useState } from 'react'
import { fetchUserAttributes, signOut } from 'aws-amplify/auth'
import { client, kindLabel, RELATION_KINDS, STATUSES, TYPES, type Habilitator, type Relation } from './client'
import { Alert, Button, Header, Input, Modal, Select, type Option } from './dss'
import HabilitatorPanel from './HabilitatorPanel'
import Canvas from './Canvas'

const errorText = (errors: { message: string }[]) => errors.map((e) => e.message).join(', ')

export default function App() {
  const [user, setUser] = useState({ name: '', email: '' })
  const [habilitators, setHabilitators] = useState<Habilitator[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [contactFilter, setContactFilter] = useState('')

  const [habModal, setHabModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newShortName, setNewShortName] = useState('')
  const [newType, setNewType] = useState('')

  const [relModal, setRelModal] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [kind, setKind] = useState(RELATION_KINDS[0])

  const [relToDelete, setRelToDelete] = useState<Relation | null>(null)
  const [modalError, setModalError] = useState('')

  useEffect(() => {
    // `name` is a standard Cognito attribute set by the admin; fall back to given + family name.
    fetchUserAttributes().then(
      (a) =>
        setUser({
          name: a.name ?? [a.given_name, a.family_name].filter(Boolean).join(' '),
          email: a.email ?? '',
        }),
      () => {},
    )
    const habSub = client.models.Habilitator.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        setHabilitators([...items])
        if (isSynced) setLoaded(true)
      },
    })
    const relSub = client.models.Relation.observeQuery().subscribe({
      next: ({ items }) => setRelations([...items]),
    })
    return () => {
      habSub.unsubscribe()
      relSub.unsubscribe()
    }
  }, [])

  const byId = useMemo(() => new Map(habilitators.map((h) => [h.id, h])), [habilitators])
  const selected = selectedId ? byId.get(selectedId) : undefined
  const nameOf = (id: string) => byId.get(id)?.name ?? '(desconegut)'

  const knownContacts = useMemo(
    () =>
      [...new Set(habilitators.flatMap((h) => h.contacts ?? []).filter((c): c is string => !!c))].sort(),
    [habilitators],
  )
  const habOptions: Option[] = useMemo(
    () =>
      [...habilitators]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((h) => ({ value: h.id, label: h.name })),
    [habilitators],
  )
  const typeOptions: Option[] = TYPES.map((t) => ({ value: t.id, label: t.label }))
  const statusOptions: Option[] = STATUSES.map((s) => ({ value: s.id, label: s.label }))
  const contactOptions: Option[] = knownContacts.map((c) => ({ value: c, label: c }))
  const kindOptions: Option[] = RELATION_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))

  // Contact filter matches when the person is any of the component's contacts.
  const visibleHabilitators = useMemo(
    () =>
      habilitators.filter(
        (h) =>
          (!typeFilter || h.type === typeFilter) &&
          (!statusFilter || h.status === statusFilter) &&
          (!contactFilter || (h.contacts ?? []).includes(contactFilter)),
      ),
    [habilitators, typeFilter, statusFilter, contactFilter],
  )

  function closeModals() {
    setHabModal(false)
    setRelModal(false)
    setRelToDelete(null)
    setModalError('')
  }

  async function createHabilitator() {
    if (!newName.trim() || !newType) return setModalError('Cal indicar el nom i el tipus.')
    const { data, errors } = await client.models.Habilitator.create({
      name: newName.trim(),
      shortName: newShortName.trim() || null,
      type: newType,
    })
    if (errors) return setModalError(errorText(errors))
    setNewName('')
    setNewShortName('')
    setNewType('')
    closeModals()
    if (data) setSelectedId(data.id)
  }

  async function createRelation() {
    if (!sourceId || !targetId || !kind) return setModalError("Cal indicar l'origen, el tipus i el destí.")
    if (sourceId === targetId) return setModalError("L'origen i el destí han de ser diferents.")
    const { errors } = await client.models.Relation.create({ sourceId, targetId, kind })
    if (errors) return setModalError(errorText(errors))
    setSourceId('')
    setTargetId('')
    closeModals()
  }

  async function deleteRelation() {
    if (!relToDelete) return
    const { errors } = await client.models.Relation.delete({ id: relToDelete.id })
    if (errors) return setModalError(errorText(errors))
    closeModals()
  }

  async function deleteHabilitator(id: string) {
    // Remove relations first so no edge points at a missing habilitator.
    await Promise.all(
      relations
        .filter((r) => r.sourceId === id || r.targetId === id)
        .map((r) => client.models.Relation.delete({ id: r.id })),
    )
    await client.models.Habilitator.delete({ id })
    setSelectedId(null)
  }

  return (
    <div className="app">
      <Header title="Plataforma Oberta" name={user.name} email={user.email} onSignOut={() => signOut()} />

      <div className="content">
        <div className="toolbar">
          <div className="filters">
            <Select
              label="Tipus"
              size="sm"
              placeholder="Tots els tipus"
              value={typeFilter}
              options={typeOptions}
              onChange={setTypeFilter}
            />
            <Select
              label="Estat"
              size="sm"
              placeholder="Tots els estats"
              value={statusFilter}
              options={statusOptions}
              onChange={setStatusFilter}
            />
            <Select
              label="Contacte"
              size="sm"
              placeholder="Tots els contactes"
              value={contactFilter}
              options={contactOptions}
              onChange={setContactFilter}
            />
          </div>
          <div className="actions">
            <Button label="Afegeix component" icon="add" onClick={() => setHabModal(true)} />
            <Button
              label="Afegeix relació"
              icon="add_link"
              variant="secondary"
              onClick={() => setRelModal(true)}
              disabled={habilitators.length < 2}
            />
          </div>
        </div>

        <div className="canvas">
          {!loaded ? (
            <div className="empty">
              <dss-spinner />
            </div>
          ) : habilitators.length === 0 ? (
            <div className="empty">
              <p className="dss-subtitle--lg">Encara no hi ha cap component</p>
              <p className="dss-body--md">Comença afegint-ne un amb el botó «Afegeix component».</p>
            </div>
          ) : (
            <Canvas
              // Remount on filter change so the viewport refits.
              key={`${typeFilter}|${statusFilter}|${contactFilter}`}
              habilitators={visibleHabilitators}
              relations={relations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDeleteRelation={setRelToDelete}
            />
          )}
        </div>
      </div>

      <Modal
        open={habModal}
        title="Nou component"
        onClose={closeModals}
        footer={
          <>
            <Button label="Cancel·la" variant="secondary" onClick={closeModals} />
            <Button label="Afegeix" onClick={createHabilitator} />
          </>
        }
      >
        <div className="form">
          <Input label="Nom complet" value={newName} onChange={setNewName} onEnter={createHabilitator} required />
          <Input
            label="Nom curt (gràfic)"
            placeholder="Opcional; si és buit, s'usa el nom complet"
            value={newShortName}
            onChange={setNewShortName}
            onEnter={createHabilitator}
          />
          <Select label="Tipus" placeholder="Tria un tipus" value={newType} options={typeOptions} onChange={setNewType} required />
          {modalError && <Alert status="error" message={modalError} />}
        </div>
      </Modal>

      <Modal
        open={relModal}
        title="Nova relació"
        onClose={closeModals}
        footer={
          <>
            <Button label="Cancel·la" variant="secondary" onClick={closeModals} />
            <Button label="Afegeix" onClick={createRelation} />
          </>
        }
      >
        <div className="form">
          <Select label="Origen" placeholder="Tria l'origen" value={sourceId} options={habOptions} onChange={setSourceId} required />
          <Select label="Tipus de relació" value={kind} options={kindOptions} onChange={setKind} required />
          <Select label="Destí" placeholder="Tria el destí" value={targetId} options={habOptions} onChange={setTargetId} required />
          {modalError && <Alert status="error" message={modalError} />}
        </div>
      </Modal>

      <Modal
        open={!!relToDelete}
        title="Elimina la relació"
        onClose={closeModals}
        footer={
          <>
            <Button label="Cancel·la" variant="secondary" onClick={closeModals} />
            <Button label="Elimina" status="danger" onClick={deleteRelation} />
          </>
        }
      >
        {relToDelete && (
          <p className="dss-body--md">
            Segur que vols eliminar la relació <strong>{nameOf(relToDelete.sourceId)}</strong>{' '}
            {kindLabel(relToDelete.kind)} <strong>{nameOf(relToDelete.targetId)}</strong>?
          </p>
        )}
        {modalError && <Alert status="error" message={modalError} />}
      </Modal>

      {selected && (
        <HabilitatorPanel
          key={selected.id}
          habilitator={selected}
          knownContacts={knownContacts}
          onClose={() => setSelectedId(null)}
          onDelete={() => deleteHabilitator(selected.id)}
        />
      )}
    </div>
  )
}
