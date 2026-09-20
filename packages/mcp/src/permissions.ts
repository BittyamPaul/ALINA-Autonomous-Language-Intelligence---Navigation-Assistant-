import { z } from 'zod';
import { RiskLevel } from '@alina/shared';

export const McpPermissionClassificationSchema = z.enum([
  'SAFE',
  'REQUIRES_APPROVAL',
  'HIGH_RISK',
]);
export type McpPermissionClassification = z.infer<typeof McpPermissionClassificationSchema>;

/**
 * Maps MCP 3-tier permission classifications to ALINA system RiskLevels.
 */
export function permissionToRiskLevel(perm: McpPermissionClassification): RiskLevel {
  switch (perm) {
    case 'SAFE':
      return 'READ_ONLY';
    case 'REQUIRES_APPROVAL':
      return 'MEDIUM';
    case 'HIGH_RISK':
      return 'HIGH_DESTRUCTIVE';
    default:
      return 'HIGH_DESTRUCTIVE';
  }
}

/**
 * Maps an ALINA system RiskLevel to an MCP permission classification.
 */
export function riskLevelToPermission(risk: RiskLevel): McpPermissionClassification {
  switch (risk) {
    case 'READ_ONLY':
      return 'SAFE';
    case 'LOW':
    case 'MEDIUM':
      return 'REQUIRES_APPROVAL';
    case 'HIGH_DESTRUCTIVE':
      return 'HIGH_RISK';
    default:
      return 'HIGH_RISK';
  }
}
