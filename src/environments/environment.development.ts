// Développement (`npm start`) : branché sur l'API FastAPI du dossier backend/.
// Les appels /api sont redirigés vers http://localhost:8000 par proxy.conf.json.
// Sans backend démarré, utilisez `npm run start:mock` (environment.mock.ts).
export const environment = {
  production: false,
  appName: 'ENI Mail',
  apiUrl: '/api',
  mailDomain: 'eni.mg',
  useMockApi: false,
};
