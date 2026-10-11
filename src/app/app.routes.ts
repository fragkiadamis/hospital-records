import { Routes } from '@angular/router';

export const routes: Routes = [
  // No dashboard yet, so the patient list is the start page.
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  {
    path: 'patients',
    title: 'Patients · Artemis',
    loadComponent: () => import('./pages/patient-list/patient-list').then((m) => m.PatientList),
  },
];
