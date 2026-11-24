// Mode démonstration (`npm run start:mock`) : backend simulé dans le navigateur
// (src/app/core/mock), aucune API ni base de données nécessaire.
export const environment = {
  production: false,
  appName: 'ENI Mail',
  apiUrl: '/api',
  mailDomain: 'eni.mg',
  useMockApi: true,
};
