import { appEnv } from './env'

export const featureFlags = appEnv.features

export type FeatureFlagName = keyof typeof featureFlags
