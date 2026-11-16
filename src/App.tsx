import { useEffect, useMemo, useState } from 'react'
import { fetchUserAttributes, signOut } from 'aws-amplify/auth'
import { client, kindLabel, RELATION_KINDS, STATUSES, TYPES, type Habilitator, type Relation } from './client'
import { Button, Header, Input, Link, Modal, Select, type Option } from './dss'
import { showToast } from './toast'
import HabilitatorPanel from './HabilitatorPanel'
import Canvas from './Canvas'
import ProcessView from './Process'
import Home, { type Section } from './Home'
import GroupsModal from './Groups'

// Sections offered on the home page; each one lives at its own URL hash.
const SECTIONS: (Section & { hash: string })[] = [
  {
    id: 'platform',
    hash: '#plataforma',
    title: 'Plataforma Oberta',
    icon: 'hub',
    description:
      'Mapa dels components tècnics de la plataforma (aplicacions, habilitadors, components de dades i eines) ' +
      "i de les relacions entre ells. Consulta'n l'estat i les persones de contacte, i edita'n la fitxa.",
  },
  {
    id: 'process',
    hash: '#proces',
    title: 'Procés de treball',
    icon: 'route',
    description:
      "Procés estàndard per construir un actiu digital, de la descoberta a l'adopció: fases, passos, " +
      "portes d'entrada i sortida (DoR/DoD), retorns i cicles de sprints. Consulta l'objectiu de cada pas.",
  },
]
// Home card that opens a modal instead of a section.
const GROUPS_CARD: Section = {
  id: 'groups',
  title: 'Grups de treball',
  icon: 'groups',
  action: 'Mostra',
  description: 'Consulta en quin grup de treball ets i qui en forma part.',
}
const sectionFromHash = () => SECTIONS.find((s) => s.hash === location.hash)?.id ?? 'home'

const errorText = (errors: { message: string }[]) => errors.map((e) => e.message).join(', ')

export default function App() {
  const [user, setUser] = useState({ name: '', email: '' })
  const [habilitators, setHabilitators] = useState<Habilitator[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState(sectionFromHash)
  const [groupsOpen, setGroupsOpen] = useState(false)

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
    const onHash = () => setView(sectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      habSub.unsubscribe()
      relSub.unsubscribe()
    }
  }, [])

  const byId = useMemo(() => new Map(habilitators.map((h) => [h.id, h])), [habilitators])
  const selected = selectedId ? byId.get(selectedId) : undefined
  const editor = user.name || user.email
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

  // Each section has its own history entry, so the browser's back button returns to the home page.
  function open(id: string) {
    if (id === GROUPS_CARD.id) return setGroupsOpen(true)
    const hash = SECTIONS.find((s) => s.id === id)?.hash
    history.pushState(null, '', hash ?? location.pathname + location.search)
    setView(hash ? id : 'home')
    setSelectedId(null)
  }
  const section = SECTIONS.find((s) => s.id === view)

  function closeModals() {
    setHabModal(false)
    setRelModal(false)
    setRelToDelete(null)
  }

  async function createHabilitator() {
    if (!newName.trim() || !newType) return showToast('Cal indicar el nom i el tipus.', 'error')
    const { data, errors } = await client.models.Habilitator.create({
      name: newName.trim(),
      shortName: newShortName.trim() || null,
      type: newType,
      updatedBy: editor,
    })
    if (errors) return showToast(errorText(errors), 'error')
    setNewName('')
    setNewShortName('')
    setNewType('')
    closeModals()
    if (data) setSelectedId(data.id)
  }

  async function createRelation() {
    if (!sourceId || !targetId || !kind) return showToast("Cal indicar l'origen, el tipus i el destí.", 'error')
    if (sourceId === targetId) return showToast("L'origen i el destí han de ser diferents.", 'error')
    const { errors } = await client.models.Relation.create({ sourceId, targetId, kind })
    if (errors) return showToast(errorText(errors), 'error')
    setSourceId('')
    setTargetId('')
    closeModals()
  }

  async function deleteRelation() {
    if (!relToDelete) return
    const { errors } = await client.models.Relation.delete({ id: relToDelete.id })
    if (errors) return showToast(errorText(errors), 'error')
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
      <Header title="Informàtica Clínica" name={user.name} email={user.email} onSignOut={() => signOut()} />

      {!section ? (
        <Home sections={[...SECTIONS, GROUPS_CARD]} onOpen={open} />
      ) : (
        <div className="content">
          <nav className="breadcrumb dss-body--md" aria-label="Ruta">
            <Link label="Inici" onClick={() => open('home')} />
            <span aria-hidden="true">/</span>
            <span className="dss-subtitle--md">{section.title}</span>
          </nav>

          {view === 'process' ? (
            <div className="canvas canvas--process">
              <ProcessView />
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

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
        </div>
      </Modal>

      <GroupsModal open={groupsOpen} email={user.email} onClose={() => setGroupsOpen(false)} />

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
      </Modal>

      {view === 'platform' && selected && (
        <HabilitatorPanel
          key={selected.id}
          habilitator={selected}
          knownContacts={knownContacts}
          editor={editor}
          onClose={() => setSelectedId(null)}
          onDelete={() => deleteHabilitator(selected.id)}
        />
      )}
    </div>
  )
}
