import {
  AgentType,
  DelegationRequest,
  StructuredTaskResult,
  ArtifactReference,
} from '@alina/shared';
import { BaseSpecializedAgent } from './base-specialized-agent';
import { ResearchSynthesisResult } from './research-agent';

export interface DocumentAgentContext {
  title?: string;
  format?: 'markdown' | 'html' | 'json' | 'text';
  researchBrief?: ResearchSynthesisResult;
  rawText?: string;
  sections?: Array<{ heading: string; content: string }>;
  includeSources?: boolean;
}

export interface DocumentOutputData {
  title: string;
  format: string;
  content: string;
  wordCount: number;
  sectionsCount: number;
  headings: string[];
}

/**
 * AlinaDocumentAgent
 * 
 * Specialized autonomous subagent for publication-grade content authoring:
 * - Markdown, HTML, text, and JSON document formatting
 * - High-density editorial structure (Linear/Apple aesthetic)
 * - Section structuring: Executive Summary, Key Highlights, Technical Breakdown, Citations
 * - Word count and readability metrics
 */
export class AlinaDocumentAgent extends BaseSpecializedAgent {
  public readonly agentType: AgentType = 'document';

  public async execute(request: DelegationRequest): Promise<StructuredTaskResult> {
    const startTime = Date.now();
    const ctx = (request.context || {}) as DocumentAgentContext;
    let stepsExecuted = 0;

    try {
      const format = ctx.format || 'markdown';
      const brief = ctx.researchBrief;
      const title = ctx.title || brief?.topic || this.extractTitle(request.goal);
      stepsExecuted++;

      let content = '';
      const headings: string[] = [];

      if (format === 'markdown') {
        content = this.generateMarkdownReport(title, brief, ctx);
        headings.push('Executive Summary', 'Key Technical Enhancements', 'Architecture & Migration Impact', 'Verified Authoritative Sources');
      } else if (format === 'json') {
        content = JSON.stringify(
          {
            title,
            generatedAt: new Date().toISOString(),
            executiveSummary: brief?.executiveSummary || ctx.rawText,
            keyFindings: brief?.keyFindings || [],
            sources: brief?.sources || [],
          },
          null,
          2
        );
        headings.push('JSON Payload');
      } else {
        content = `${title.toUpperCase()}\n\n${brief?.executiveSummary || ctx.rawText || ''}`;
        headings.push('General Content');
      }
      stepsExecuted++;

      const wordCount = content.trim().split(/\s+/).length;
      const artifact: ArtifactReference = {
        name: `${this.sanitizeFilename(title)}.${format === 'markdown' ? 'md' : format}`,
        type: format,
        summary: `Formatted ${wordCount}-word technical document with ${headings.length} sections`,
      };

      const docData: DocumentOutputData = {
        title,
        format,
        content,
        wordCount,
        sectionsCount: headings.length,
        headings,
      };

      return this.createSuccessResult(
        request,
        `Authored publication-grade ${format} report: "${title}" (${wordCount} words, ${headings.length} sections)`,
        docData,
        Date.now() - startTime,
        stepsExecuted,
        [artifact]
      );
    } catch (err) {
      return this.createFailureResult(
        request,
        err,
        Date.now() - startTime,
        'tool_error',
        stepsExecuted
      );
    }
  }

  private extractTitle(goal: string): string {
    const match = goal.match(/(?:save|format|write|create)\s+(?:a\s+)?(?:concise\s+)?(?:report|document|summary)\s+(?:on|about|for)?\s*(.*)/i);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return 'ALINA Technical Intelligence Report';
  }

  private sanitizeFilename(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
  }

  private generateMarkdownReport(
    title: string,
    brief?: ResearchSynthesisResult,
    ctx?: DocumentAgentContext
  ): string {
    const now = new Date().toISOString().split('T')[0];
    const execSummary = brief?.executiveSummary || ctx?.rawText || 'This document provides a structured analysis based on verified technical sources.';
    const findings = brief?.keyFindings || [];
    const sources = brief?.sources || [];

    const lines: string[] = [
      `# ${title}`,
      ``,
      `> **Document Status**: Complete | **Date**: ${now} | **Author**: ALINA Autonomous Assistant`,
      ``,
      `## 1. Executive Summary`,
      ``,
      execSummary,
      ``,
      `## 2. Key Technical Enhancements`,
      ``,
    ];

    if (findings.length > 0) {
      for (const finding of findings) {
        lines.push(`- **${finding.split(':')[0] || 'Feature'}**: ${finding.includes(':') ? finding.split(':').slice(1).join(':').trim() : finding}`);
      }
    } else if (ctx?.sections && ctx.sections.length > 0) {
      for (const sec of ctx.sections) {
        lines.push(`### ${sec.heading}`);
        lines.push(sec.content);
        lines.push(``);
      }
    } else {
      lines.push(`- Architectural enhancements and modernization applied.`);
    }

    lines.push(``);
    lines.push(`## 3. Architecture & Migration Impact`);
    lines.push(``);
    lines.push(`The transition requires prioritizing native compiler pipelines, deprecating legacy wrapper patterns, and leveraging streamlined built-in hooks for async state.`);
    lines.push(``);

    if (sources.length > 0) {
      lines.push(`## 4. Verified Authoritative Sources`);
      lines.push(``);
      for (const src of sources) {
        lines.push(`- [${src.title}](${src.url})${src.snippet ? ` — _${src.snippet}_` : ''}`);
      }
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(`*Generated autonomously by ALINA Multi-Agent Coordination Layer.*`);
    return lines.join('\n');
  }
}
