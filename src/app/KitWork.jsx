// Dev server only (`/_kit`): the clinic's Work and time view with an invented clinic and the demo work world
// (src/dev/demoWork.js), so the view can be checked at 1440 / 375 px without the mock server or a key.
// Never part of a production build (KitGallery is loaded only on the dev server).
import React, { useMemo, useState } from 'react';
import { useAnalytics, usePeriod } from '../context/AnalyticsContext.jsx';
import { SectionTitle } from '../ui/index.js';
import WorkView from '../pages/clinics/WorkView.jsx';
import ClinicForm from '../pages/clinics/ClinicForm.jsx';
import { normalizeClinics } from '../data/normalize/clinics.js';
import { normalizeWork } from '../data/clinics/work.js';
import { guessRole } from '../data/clinics/staff.js';
import { demoWork } from '../dev/demoWork.js';

const CLINIC_ID = 'c0123456789abcdef';
// Who the invented people are (in the order of the dataset's doctors with a login)
const PEOPLE = [
  { role: 'doctor', profile: { forms: 20, express: 0.35, heavy: true } },
  { role: null, profile: { forms: 12 }, oldApp: true },
  { role: 'doctor', profile: { forms: 9, cardio: true } },
  { role: 'nurse', profile: {} },
  { role: 'nurse', profile: { helper: true } },
  { role: 'admin', profile: {} },
  { role: 'doctor', ex: true, profile: { forms: 16 } },
  { role: 'other', statsOff: true, profile: {} },
];

export default function KitWork() {
  const { dataset: ds } = useAnalytics();
  const { period } = usePeriod();
  const [workers, setWorkers] = useState([]);
  const [marks, setMarks] = useState({}); // pid → the marks changed in the kit

  const doctors = useMemo(() => (ds?.doctorList ?? []).filter((d) => d.exists?.auth).slice(0, PEOPLE.length), [ds]);
  const members = doctors.map((d, i) => {
    const person = PEOPLE[i];
    const own = marks[d.pid] ?? {};
    const role = own.role !== undefined ? own.role : person.role;
    return {
      pid: d.pid,
      role: role ?? guessRole(d.specialization),
      guessed: !role,
      spec: d.specialization ?? 'Kita',
      ex: own.ex ?? person.ex === true,
      statsOff: own.statsOff ?? person.statsOff === true,
    };
  });
  const [clinic] = normalizeClinics({
    clinics: [{ id: CLINIC_ID, name: 'Sample klinika', billing: 'invoice', active: true, monthlyCapPerDoctor: 3000, note: '', credits: { available: 0, used: 0, total: 0 }, createdAt: null, updatedAt: null, members, hourEur: { nurse: 20 }, statsShown: false }],
  });
  const work = useMemo(() => {
    if (!clinic || !period) return null;
    const people = members.map((m, i) => ({ ...m, email: doctors[i]?.email ?? null, member: true, profile: PEOPLE[i].profile, oldApp: PEOPLE[i].oldApp === true }));
    return normalizeWork(demoWork({ clinic: { ...clinic, markupPct: 30 }, people, from: period.from, to: period.effTo, workers, nowMs: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(members), period, workers]);

  if (!clinic || !period) return null;
  return (
    <div id="kit-work" className="mt-8">
      <SectionTitle title="Work and time" description="A clinic's Work and time view with an invented clinic (Clinics page)." />
      <div className="mb-6">
        <ClinicForm clinic={clinic} rates={work?.rates} onSave={async () => {}} onCancel={() => {}} />
      </div>
      <WorkView
        clinic={clinic}
        ds={ds}
        period={period}
        usageReport={null}
        state={{ status: 'ready', work, error: null, reload: () => {} }}
        workers={workers}
        onWorkersChange={setWorkers}
        onEditSettings={() => {}}
        onSetStaff={async (pid, change) => setMarks((all) => ({ ...all, [pid]: { ...(all[pid] ?? {}), ...change } }))}
      />
    </div>
  );
}
