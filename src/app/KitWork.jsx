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
import { profileRole, roleOf } from '../data/clinics/staff.js';
import { demoWork } from '../dev/demoWork.js';
// Who the invented people are (in the order of the dataset's doctors with a login): the mock's invoice clinic,
// so every source of a role shows — the profile, the owner, a guess without a specialty
import { INVOICE_PEOPLE as PEOPLE } from '../dev/demoClinics.js';

const CLINIC_ID = 'c0123456789abcdef';

/** A person's entry as the backend stores it ({ role?, profileRole?, ex? }). */
const entryOf = (person) => {
  const entry = {};
  if (person.role) entry.role = person.role;
  if (person.role && Object.hasOwn(person, 'profileRole')) entry.profileRole = person.profileRole;
  if (person.ex) entry.ex = true;
  return entry;
};

export default function KitWork() {
  const { dataset: ds } = useAnalytics();
  const { period } = usePeriod();
  const [workers, setWorkers] = useState([]);
  const [changes, setChanges] = useState({}); // pid → { entry?, statsOff? } changed in the kit

  const doctors = useMemo(() => (ds?.doctorList ?? []).filter((d) => d.exists?.auth).slice(0, PEOPLE.length), [ds]);
  // The doctor list as the mock and the server send it: each person's specialty is the one in their profile
  // (PEOPLE, null = none), not the demo dataset's, so the staff list, the people picker and "By person" agree
  const kitDs = useMemo(() => {
    if (!ds) return ds;
    const specOf = new Map(doctors.map((d, i) => [d.pid, PEOPLE[i].spec ?? null]));
    const doctorList = ds.doctorList.map((d) => (specOf.has(d.pid) ? { ...d, specialization: specOf.get(d.pid) } : d));
    return { ...ds, doctorList, doctors: new Map(doctorList.map((d) => [d.pid, d])) };
  }, [ds, doctors]);
  const members = doctors.map((d, i) => {
    const person = PEOPLE[i];
    const own = changes[d.pid] ?? {};
    const entry = own.entry ?? entryOf(person);
    // The role as the server works it out: the owner's while it applies, else the profile's, else a guess
    return { pid: d.pid, ...roleOf(entry, person.spec), spec: person.spec, ex: entry.ex === true, statsOff: own.statsOff ?? person.statsOff === true };
  });
  const [clinic] = normalizeClinics({
    clinics: [{ id: CLINIC_ID, name: 'Sample klinika', billing: 'invoice', active: true, monthlyCapPerDoctor: 3000, note: '', credits: { available: 0, used: 0, total: 0 }, createdAt: null, updatedAt: null, members, hourEur: { nurse: 20 }, statsShown: false }],
  });
  const work = useMemo(() => {
    if (!clinic || !period) return null;
    // `profile` of a work person is how they work (the demo work profile), not the role their profile gives
    const people = members.map((m, i) => ({ ...m, spec: m.spec ?? 'Nenurodyta', email: doctors[i]?.email ?? null, member: true, profile: PEOPLE[i].profile, oldApp: PEOPLE[i].oldApp === true }));
    return normalizeWork(demoWork({ clinic: { ...clinic, markupPct: 30 }, people, from: period.from, to: period.effTo, workers, nowMs: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(members), period, workers]);

  /** The owner's change, kept like the backend's setStaff: a role set keeps the role the profile gives now. */
  const setStaff = async (pid, change) => {
    const person = PEOPLE[doctors.findIndex((d) => d.pid === pid)];
    if (!person) return;
    setChanges((all) => {
      const own = all[pid] ?? {};
      const entry = { ...(own.entry ?? entryOf(person)) };
      if (Object.hasOwn(change, 'role')) {
        if (change.role) {
          entry.role = change.role;
          entry.profileRole = profileRole(person.spec);
        } else {
          delete entry.role;
          delete entry.profileRole;
        }
      }
      if (Object.hasOwn(change, 'ex')) {
        if (change.ex) entry.ex = true;
        else delete entry.ex;
      }
      return { ...all, [pid]: { ...own, entry, ...(Object.hasOwn(change, 'statsOff') ? { statsOff: change.statsOff } : {}) } };
    });
  };

  if (!clinic || !period) return null;
  return (
    <div id="kit-work" className="mt-8">
      <SectionTitle title="Work and time" description="A clinic's Work and time view with an invented clinic (Clinics page)." />
      <div className="mb-6">
        <ClinicForm clinic={clinic} rates={work?.rates} onSave={async () => {}} onCancel={() => {}} />
      </div>
      <WorkView
        clinic={clinic}
        ds={kitDs}
        period={period}
        usageReport={null}
        state={{ status: 'ready', work, error: null, reload: () => {} }}
        workers={workers}
        onWorkersChange={setWorkers}
        onEditSettings={() => {}}
        onSetStaff={setStaff}
      />
    </div>
  );
}
