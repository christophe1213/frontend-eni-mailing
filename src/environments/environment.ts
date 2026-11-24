// Production : branché sur l'API Python réelle
export const environment = {
  production: true,
  appName: 'ENI Mail',
  apiUrl: '/api',
  mailDomain: 'eni.mg',
  /** true = backend simulé dans le navigateur (src/app/core/mock) */
  useMockApi: false,
};
