// Working groups: shows only the signed-in user's group and its members.
// Data comes from src/groups.local.json (git-ignored, built by scripts/groups.py from a spreadsheet)
// and is bundled at build time. Users not in any group (or without that file) see no groups at all.
// Emails are stored as SHA-256 hashes, so the user's email is hashed to find their group.
import { useEffect, useState } from 'react'
import { Alert, Link, Modal } from './dss'

type Member = { name: string; emailHash: string }
type Group = { name: string; link?: string | null; members: Member[] }

const files = import.meta.glob<{ groups: Group[] }>('./groups.local.json', { eager: true, import: 'default' })
const GROUPS: Group[] = Object.values(files)[0]?.groups ?? []

async function sha256(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim().toLowerCase()))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function Members({ group, me }: { group: Group; me?: string }) {
  return (
    <ul className="group-members dss-body--md">
      {group.members.map((m) => (
        <li key={m.emailHash}>{m.emailHash === me ? <strong>{m.name} (tu)</strong> : m.name}</li>
      ))}
    </ul>
  )
}

function GroupLink({ group }: { group: Group }) {
  return group.link ? <Link label="Obre l'espai del grup" onClick={() => window.open(group.link!, '_blank')} /> : null
}

export default function GroupsModal({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  const [me, setMe] = useState<string>()
  useEffect(() => {
    if (email) sha256(email).then(setMe)
  }, [email])

  const mine = GROUPS.find((g) => g.members.some((m) => m.emailHash === me))

  return (
    <Modal open={open} title="Grups de treball" onClose={onClose}>
      <div className="form">
        {!mine ? (
          <Alert status="info" message="No formes part de cap grup." />
        ) : (
          <section className="group group--mine">
            <p className="dss-subtitle--md">El teu grup: {mine.name}</p>
            <Members group={mine} me={me} />
            <GroupLink group={mine} />
          </section>
        )}
      </div>
    </Modal>
  )
}
