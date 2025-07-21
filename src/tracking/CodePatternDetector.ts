import * as vscode from 'vscode';
import { QualityTracker } from './QualityTracker';

export class CodePatternDetector {
    private disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private qualityTracker: QualityTracker
    ) {
        this.setupFileWatchers();
    }

    /**
     * Setup file watchers for pattern detection
     */
    private setupFileWatchers(): void {
        // Watch for file changes
        const watcher = vscode.workspace.onDidChangeTextDocument((event) => {
            this.analyzeFileChanges(event);
        });

        this.disposables.push(watcher);
    }

    /**
     * Analyze file changes for patterns
     */
    private analyzeFileChanges(event: vscode.TextDocumentChangeEvent): void {
        const document = event.document;
        const changes = event.contentChanges;

        if (changes.length === 0) return;

        // Analyze the document for quality patterns
        this.detectPatterns(document);
    }

    /**
     * Detect code patterns in document
     */
    private detectPatterns(document: vscode.TextDocument): void {
        const text = document.getText();
        let issuesFound = 0;

        // Check for long functions
        if (this.hasLongFunctions(text)) {
            this.qualityTracker.recordLongFunction();
            issuesFound++;
        }

        // Check for duplicate code patterns
        const duplicateCount = this.findDuplicatePatterns(text);
        if (duplicateCount > 0) {
            this.qualityTracker.recordDuplicateCode(duplicateCount);
            issuesFound += duplicateCount;
        }

        // Calculate basic quality score
        const qualityScore = this.calculateQualityScore(text);
        
        // Record the analysis
        this.qualityTracker.recordQualityAnalysis(qualityScore, issuesFound);
    }

    /**
     * Check for long functions
     */
    private hasLongFunctions(text: string): boolean {
        const functionPattern = /function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g;
        const functions = text.match(functionPattern) || [];
        
        return functions.some(func => func.split('\n').length > 20);
    }

    /**
     * Find duplicate code patterns
     */
    private findDuplicatePatterns(text: string): number {
        const lines = text.split('\n');
        const lineMap = new Map<string, number>();
        let duplicates = 0;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.length > 10) {
                const count = lineMap.get(trimmed) || 0;
                lineMap.set(trimmed, count + 1);
                if (count === 1) duplicates++;
            }
        });

        return duplicates;
    }

    /**
     * Calculate basic quality score
     */
    private calculateQualityScore(text: string): number {
        const lines = text.split('\n');
        const linesOfCode = lines.filter(line => line.trim().length > 0).length;
        
        // Basic scoring based on various factors
        let score = 100;
        
        // Penalize very long files
        if (linesOfCode > 500) score -= 10;
        if (linesOfCode > 1000) score -= 20;
        
        // Check for complexity indicators
        const complexityIndicators = (text.match(/if\s*\(|for\s*\(|while\s*\(/g) || []).length;
        score -= Math.min(30, complexityIndicators * 2);
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Generate usage report
     */
    generateUsageReport(): any {
        return {
            totalAnalyses: 0,
            patternsDetected: [],
            recommendations: [
                'Keep functions under 20 lines',
                'Avoid code duplication',
                'Use consistent naming conventions'
            ]
        };
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}