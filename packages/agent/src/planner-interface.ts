import { PlanDAG, PlanStep, RiskLevel } from '@alina/shared';

export interface PlanGenerationRequest {
  taskId: string;
  goal: string;
  availableTools: Array<{ name: string; description: string; defaultRiskLevel: RiskLevel }>;
  projectContext?: {
    rootPath: string;
    description?: string;
  };
}

export class PlanTopologicalSorter {
  public static getTopologicalOrder(dag: PlanDAG): PlanStep[] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();
    const stepMap = new Map<string, PlanStep>();

    for (const step of dag.steps) {
      inDegree.set(step.id, 0);
      graph.set(step.id, []);
      stepMap.set(step.id, step);
    }

    for (const edge of dag.edges) {
      const current = inDegree.get(edge.toStepId) ?? 0;
      inDegree.set(edge.toStepId, current + 1);
      graph.get(edge.fromStepId)?.push(edge.toStepId);
    }

    const queue: string[] = [];
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }

    const result: PlanStep[] = [];
    while (queue.length > 0) {
      const stepId = queue.shift()!;
      const step = stepMap.get(stepId);
      if (step) result.push(step);

      for (const neighbor of graph.get(stepId) ?? []) {
        const nextDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, nextDegree);
        if (nextDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (result.length !== dag.steps.length) {
      return [...dag.steps].sort((a, b) => a.index - b.index);
    }

    return result;
  }
}
