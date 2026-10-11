import { Routes } from '@angular/router';

export const routes: Routes = [
  // No dashboard yet, so the patient list is the start page.
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  {
    path: 'patients',
    title: 'Patients · Hospital Records',
    loadComponent: () => import('./pages/patient-list/patient-list').then((m) => m.PatientList),
  },
  {
    path: 'patients/new', // before patients/:id, which would otherwise take "new" as an id
    title: 'New patient · Hospital Records',
    loadComponent: () => import('./pages/patient-new/patient-new').then((m) => m.PatientNew),
  },
  {
    path: 'patients/:id',
    title: 'Patient · Hospital Records', // replaced by the patient's name once loaded
    loadComponent: () => import('./pages/patient-page/patient-page').then((m) => m.PatientPage),
  },
  {
    path: 'patients/:id/edit',
    title: 'Edit patient · Hospital Records',
    loadComponent: () => import('./pages/patient-edit/patient-edit').then((m) => m.PatientEdit),
  },
  {
    path: 'patients/:id/conditions/new', // before :conditionId, which would take "new" as an id
    title: 'New condition · Hospital Records',
    loadComponent: () => import('./pages/condition-new/condition-new').then((m) => m.ConditionNew),
  },
  {
    path: 'patients/:id/conditions/:conditionId',
    title: 'Condition · Hospital Records', // replaced by the condition's name once loaded
    loadComponent: () =>
      import('./pages/condition-page/condition-page').then((m) => m.ConditionPage),
  },
  {
    path: 'patients/:id/conditions/:conditionId/edit',
    title: 'Edit condition · Hospital Records',
    loadComponent: () =>
      import('./pages/condition-edit/condition-edit').then((m) => m.ConditionEdit),
  },
  {
    path: 'patients/:id/studies/:studyId',
    title: 'Imaging study · Hospital Records', // replaced by the study's name once loaded
    loadComponent: () => import('./pages/study-page/study-page').then((m) => m.StudyPage),
  },
];
