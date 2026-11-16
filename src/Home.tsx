// Landing page after login: pick one of the tools.
import { Button, Card, DecorativeIcon } from './dss'

export type Section = { id: string; title: string; icon: string; description: string; action?: string }

export default function Home({ sections, onOpen }: { sections: Section[]; onOpen: (id: string) => void }) {
  return (
    <div className="home">
      <div className="home-intro">
        <h1 className="dss-headline--sm">Informàtica Clínica</h1>
        <p className="dss-body--lg">Tria per on vols començar.</p>
      </div>
      <div className="home-cards">
        {sections.map((s) => (
          <Card
            key={s.id}
            onClick={() => onOpen(s.id)}
            header={
              <div className="home-card-header">
                <DecorativeIcon icon={s.icon} />
                <h2 className="dss-subtitle--xl">{s.title}</h2>
              </div>
            }
            footer={<Button label={s.action ?? 'Entra'} icon="arrow_forward" onClick={() => {}} />}
          >
            <p className="dss-body--md">{s.description}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
