/**
 * Environment configuration for Lotus PM CDK stacks.
 * REQ-001: ap-southeast-2 only.
 * REQ-004/005: Keep it simple — right-sized for 500-2000 participants.
 */

export interface EnvironmentConfig {
  environment: 'staging' | 'production'
  domainName: string
  subDomain: string
  /** RDS instance size */
  dbInstanceClass: string
  dbInstanceSize: string
  /** ECS task sizing */
  taskCpu: number
  taskMemoryMiB: number
  /** Desired task count */
  desiredCount: number
  /** Min/max for auto-scaling */
  minCapacity: number
  maxCapacity: number
  /** ElastiCache node type */
  cacheNodeType: string
  /** Deletion protection for production */
  deletionProtection: boolean
  /** Backup retention in days */
  backupRetentionDays: number
}

export const environments: Record<string, EnvironmentConfig> = {
  staging: {
    environment: 'staging',
    domainName: 'lotusassist.com.au',
    subDomain: 'staging.planmanager',
    dbInstanceClass: 't3',
    dbInstanceSize: 'micro',
    taskCpu: 512,
    taskMemoryMiB: 1024,
    desiredCount: 1,
    minCapacity: 1,
    maxCapacity: 2,
    cacheNodeType: 'cache.t3.micro',
    deletionProtection: false,
    backupRetentionDays: 3,
  },
  production: {
    environment: 'production',
    domainName: 'lotusassist.com.au',
    subDomain: 'planmanager',
    dbInstanceClass: 't3',
    dbInstanceSize: 'small',
    taskCpu: 1024,
    taskMemoryMiB: 2048,
    desiredCount: 2,
    minCapacity: 2,
    maxCapacity: 6,
    cacheNodeType: 'cache.t3.small',
    deletionProtection: true,
    backupRetentionDays: 7,
  },
}

export function getConfig(environment: string): EnvironmentConfig {
  const config = environments[environment]
  if (!config) {
    throw new Error(`Unknown environment: ${environment}. Must be "staging" or "production".`)
  }
  return config
}
