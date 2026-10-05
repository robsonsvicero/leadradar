export const prospectingConfig = {
  minCompaniesPerJob: 1,
  maxCompaniesPerJob: 100,
  maxKeywordsPerJob: 10,
  maxKeywordLength: 80,
  maxActiveJobsPerOrganization: 1,
  maxPagesPerQuery: 3,
  pollingIntervalMs: 3000,
  transientRetryAttempts: 2,
  websiteTimeoutMs: 10000,
  pageSpeedTimeoutMs: 10000,
} as const
