import { Routes } from '@angular/router';

export const routes: Routes = [
  // No dashboard yet, so the patient list is the start page.
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  {
    path: 'patients',
    title: 'Patients · Artemis',
    loadComponent: () => import('./pages/patient-list/patient-list').then((m) => m.PatientList),
  },
  {
    path: 'patients/:id',
    title: 'Patient · Artemis', // replaced by the patient's name once loaded
    loadComponent: () => import('./pages/patient-page/patient-page').then((m) => m.PatientPage),
  },
];
