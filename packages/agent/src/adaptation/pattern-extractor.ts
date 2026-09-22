import {
  InteractionEvent,
} from '@alina/shared';

export interface ExtractedPattern {
  dimension: 'communication_style' | 'work_patterns' | 'interaction_preferences' | 'project_context';
  patternKey: string;
  statement: string;
  inferredValue: unknown;
  evidenceCount: number;
  lastObservedAt: string;
}

/**
 * PatternExtractor
 * 
 * Inspects recent InteractionEvents and aggregates recurring non-sensitive operational patterns
 * across the four supported dimensions:
 * 1. Communication style (conciseness, formality, preferred structure)
 * 2. Work patterns (frequently used projects, tools, recurring sequences)
 * 3. Interaction preferences (voice vs text, UI mode, confirmation behavior)
 * 4. Project context (project names, technologies, recurring goals)
 */
export class PatternExtractor {
  /**
   * Extracts raw frequency patterns from recent interaction events.
   */
  public static extract(events: InteractionEvent[]): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];

    if (!events || events.length === 0) {
      return patterns;
    }

    // 1. Tool Usage Patterns
    const toolCounts: Record<string, { count: number; lastTime: string }> = {};
    // 2. Project Access Patterns
    const projectCounts: Record<string, { count: number; path?: string; technologies: Set<string>; lastTime: string }> = {};
    // 3. Modality Patterns (voice vs text)
    let voiceCount = 0;
    let textCount = 0;
    // 4. Communication Style Indicators
    let conciseInquiries = 0;
    let detailedInquiries = 0;
    // 5. Sequential tool chains
    const sequences: Record<string, { sequence: string[]; count: number; lastTime: string }> = {};

    let lastTool: string | null = null;

    for (const ev of events) {
      const time = ev.timestamp || new Date().toISOString();
      const goal = ev.goal || (ev.payload?.goal as string) || '';
      const goalLower = goal.toLowerCase();

      // 1. Tool Extraction
      const rawTools: string[] = [];
      if (Array.isArray(ev.toolsUsed)) {
        rawTools.push(...ev.toolsUsed);
      }
      if (Array.isArray(ev.payload?.toolsUsed)) {
        rawTools.push(...(ev.payload.toolsUsed as string[]));
      }
      const singleTool = (ev.payload?.toolName as string) || (ev.payload?.tool as string);
      if (singleTool && !rawTools.includes(singleTool)) {
        rawTools.push(singleTool);
      }

      // Check aliases in goal
      const toolAliases = [
        { name: 'VS Code', key: 'vscode', aliases: ['vscode', 'vs code', 'code .', 'visual studio code'] },
        { name: 'Git', key: 'git', aliases: ['git status', 'git checkout', 'git commit', 'git diff', 'git'] },
        { name: 'pnpm', key: 'pnpm', aliases: ['pnpm', 'pnpm test', 'pnpm build'] },
        { name: 'Terminal', key: 'terminal', aliases: ['powershell', 'bash', 'terminal', 'shell'] },
      ];

      for (const t of toolAliases) {
        if (t.aliases.some((alias) => goalLower.includes(alias))) {
          if (!rawTools.some((rt) => rt.toLowerCase() === t.key || rt.toLowerCase() === t.name.toLowerCase())) {
            rawTools.push(t.name);
          }
        }
      }

      for (const raw of rawTools) {
        const lower = raw.toLowerCase();
        const isVsCode = lower === 'vscode' || lower === 'vs code' || lower === 'code .';
        const displayName = isVsCode ? 'VS Code' : raw;
        const toolKey = isVsCode ? 'vscode' : lower;

        if (!toolCounts[toolKey]) {
          toolCounts[toolKey] = { count: 0, lastTime: time };
        }
        toolCounts[toolKey].count++;
        toolCounts[toolKey].lastTime = time;
      }

      // Sequence extraction
      if (rawTools.length >= 2) {
        for (let i = 0; i < rawTools.length - 1; i++) {
          const a = rawTools[i];
          const b = rawTools[i + 1];
          const seqKey = `${a} -> ${b}`;
          if (!sequences[seqKey]) {
            sequences[seqKey] = { sequence: [a, b], count: 0, lastTime: time };
          }
          sequences[seqKey].count++;
          sequences[seqKey].lastTime = time;
        }
      } else if (rawTools.length === 1) {
        const currentTool = rawTools[0];
        if (lastTool && lastTool !== currentTool) {
          const seqKey = `${lastTool} -> ${currentTool}`;
          if (!sequences[seqKey]) {
            sequences[seqKey] = { sequence: [lastTool, currentTool], count: 0, lastTime: time };
          }
          sequences[seqKey].count++;
          sequences[seqKey].lastTime = time;
        }
        lastTool = currentTool;
      }

      // 2. Project identification
      const projId = ev.projectId || (ev.metadata?.projectId as string) || (ev.payload?.projectId as string) || (ev.payload?.projectName as string);
      const projPath = (ev.metadata?.workspaceId as string) || (ev.payload?.jailRoot as string) || (ev.payload?.path as string);

      if (projId || projPath) {
        const key = projId || projPath || 'default_project';
        if (!projectCounts[key]) {
          projectCounts[key] = { count: 0, path: projPath, technologies: new Set<string>(), lastTime: time };
        }
        projectCounts[key].count++;
        projectCounts[key].lastTime = time;

        const techs = ev.technologies || (ev.payload?.technologies as string[]);
        if (Array.isArray(techs)) {
          for (const tch of techs) projectCounts[key].technologies.add(tch);
        }
        if (goalLower.includes('typescript') || goalLower.includes('ts')) projectCounts[key].technologies.add('TypeScript');
        if (goalLower.includes('next.js') || goalLower.includes('react')) projectCounts[key].technologies.add('Next.js');
        if (goalLower.includes('surrealdb')) projectCounts[key].technologies.add('SurrealDB');
        if (goalLower.includes('rust') || goalLower.includes('tauri')) projectCounts[key].technologies.add('Tauri');
      }

      // 3. Modality tracking
      const mod = ev.modality || (ev.payload?.modality as string);
      if (mod === 'voice' || ev.type === 'voice_turn') {
        voiceCount++;
      } else {
        textCount++;
      }

      // 4. Communication style tracking
      const styleObserved = ev.communicationStyleObserved || (ev.payload?.communicationStyleObserved as any);
      if (styleObserved) {
        if (styleObserved.conciseness === 'concise') {
          conciseInquiries++;
        } else if (styleObserved.conciseness === 'detailed') {
          detailedInquiries++;
        }
      } else if (goal.length > 0 && goal.length < 50) {
        conciseInquiries++;
      } else if (goal.length >= 100) {
        detailedInquiries++;
      }
    }

    // Formulate Work Pattern Patterns
    for (const [toolKey, stat] of Object.entries(toolCounts)) {
      const displayName = toolKey === 'vscode' ? 'VS Code' : toolKey.charAt(0).toUpperCase() + toolKey.slice(1);
      patterns.push({
        dimension: 'work_patterns',
        patternKey: `tool:${toolKey}`,
        statement: `User frequently uses ${displayName} for development`,
        inferredValue: { toolName: toolKey, displayName, frequency: stat.count },
        evidenceCount: stat.count,
        lastObservedAt: stat.lastTime,
      });
    }

    for (const [proj, stat] of Object.entries(projectCounts)) {
      patterns.push({
        dimension: 'project_context',
        patternKey: `project:${proj.toLowerCase()}`,
        statement: `User actively works on project ${proj}`,
        inferredValue: {
          projectId: proj,
          name: proj,
          path: stat.path,
          technologies: Array.from(stat.technologies),
          frequency: stat.count,
        },
        evidenceCount: stat.count,
        lastObservedAt: stat.lastTime,
      });
    }

    for (const [seqKey, stat] of Object.entries(sequences)) {
      patterns.push({
        dimension: 'work_patterns',
        patternKey: `sequence:${seqKey}`,
        statement: `User frequently executes workflow sequence ${seqKey}`,
        inferredValue: { sequence: stat.sequence, frequency: stat.count },
        evidenceCount: stat.count,
        lastObservedAt: stat.lastTime,
      });
    }

    // Communication Style Patterns
    if (conciseInquiries >= 1) {
      patterns.push({
        dimension: 'communication_style',
        patternKey: 'comm:concise',
        statement: 'User prefers concise responses and bullet_points structure',
        inferredValue: {
          conciseness: 'concise',
          formality: 'formal',
          preferredStructure: 'bullet_points',
          preferredResponseStructure: 'bullet_points',
        },
        evidenceCount: conciseInquiries,
        lastObservedAt: new Date().toISOString(),
      });
    } else if (detailedInquiries >= 1) {
      patterns.push({
        dimension: 'communication_style',
        patternKey: 'comm:detailed',
        statement: 'User prefers detailed, comprehensive explanations',
        inferredValue: {
          conciseness: 'detailed',
          formality: 'casual',
          preferredStructure: 'step_by_step',
          preferredResponseStructure: 'step_by_step',
        },
        evidenceCount: detailedInquiries,
        lastObservedAt: new Date().toISOString(),
      });
    }

    // Interaction Preference Patterns
    if (voiceCount >= 1 && voiceCount >= textCount) {
      patterns.push({
        dimension: 'interaction_preferences',
        patternKey: 'modality:voice',
        statement: 'User prefers hands-free voice conversation for interaction',
        inferredValue: { preferredInputModality: 'voice', preferredModality: 'voice' },
        evidenceCount: voiceCount,
        lastObservedAt: new Date().toISOString(),
      });
    } else if (textCount >= 1) {
      patterns.push({
        dimension: 'interaction_preferences',
        patternKey: 'modality:text',
        statement: 'User prefers text-based terminal interaction',
        inferredValue: { preferredInputModality: 'text', preferredModality: 'text' },
        evidenceCount: textCount,
        lastObservedAt: new Date().toISOString(),
      });
    }

    return patterns;
  }
}
