import { Users, Euro, CalendarCheck, TrendingUp } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { KPICard } from '@/components/KPICard';
import { AgentChat } from '@/components/AgentChat';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const DEMO_ACTIVITIES = [
  { id: 1, agent: 'Clara', action: 'Rechnung #2026-0032 erstellt', time: 'vor 5 Min.' },
  { id: 2, agent: 'Marie', action: 'E-Mail-Entwurf an Gast Müller vorbereitet', time: 'vor 12 Min.' },
  { id: 3, agent: 'Tom', action: 'Monatsbericht Februar exportiert', time: 'vor 1 Std.' },
  { id: 4, agent: 'Marco', action: 'Social-Media-Post für Wochenmenü erstellt', time: 'vor 2 Std.' },
  { id: 5, agent: 'Nico', action: 'Neues Widget "Tagesreservierungen" gebaut', time: 'vor 3 Std.' },
];

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="ml-64 flex-1 p-6">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Willkommen zurück!</h1>
              <p className="text-sm text-muted mt-1">
                Gasthof Sonnenhof — Dienstag, 4. März 2026
              </p>
            </div>
            <Button variant="outline" className="gap-2">
              <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse" />
              Build Mode
            </Button>
          </div>
        </header>

        {/* KPI Grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <KPICard
            title="Umsatz (März)"
            value="€12.450"
            change={8.3}
            changeLabel="vs. Feb"
            icon={Euro}
          />
          <KPICard
            title="Gäste heute"
            value="47"
            change={12}
            changeLabel="vs. letzte Woche"
            icon={Users}
          />
          <KPICard
            title="Reservierungen"
            value="23"
            change={-3}
            changeLabel="vs. gestern"
            icon={CalendarCheck}
          />
          <KPICard
            title="Auslastung"
            value="78%"
            change={5}
            changeLabel="vs. Vorwoche"
            icon={TrendingUp}
          />
        </section>

        {/* Main Content Grid */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Agent Chat — takes 2 columns */}
          <div className="lg:col-span-2">
            <AgentChat />
          </div>

          {/* Activity Feed */}
          <Card className="h-[400px] flex flex-col">
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="text-sm">Letzte Agenten-Aktivitäten</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0">
              <div className="divide-y divide-border">
                {DEMO_ACTIVITIES.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
                      {activity.agent[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium text-accent">{activity.agent}</span>{' '}
                        {activity.action}
                      </p>
                      <p className="text-xs text-muted mt-0.5">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
