import * as vscode from 'vscode';

export interface QualityActivity {
    complexityIncreases: number;
    duplicateCodeDetected: number;
    longFunctionsAdded: boolean;
    filesAnalyzed: number;
    issuesFound: number;
}

export class QualityTracker {
    private isTracking: boolean = false;
    private sessionStart: number = 0;
    private recentActivity: QualityActivity = {
        complexityIncreases: 0,
        duplicateCodeDetected: 0,
        longFunctionsAdded: false,
        filesAnalyzed: 0,
        issuesFound: 0
    };

    constructor(private context: vscode.ExtensionContext) {
        this.sessionStart = Date.now();
    }

    /**
     * Start tracking quality metrics
     */
    startTracking(): void {
        this.isTracking = true;
        this.sessionStart = Date.now();
        console.log('Quality tracking started');
    }

    /**
     * Stop tracking quality metrics
     */
    stopTracking(): void {
        this.isTracking = false;
        console.log('Quality tracking stopped');
    }

    /**
     * Get recent quality activity
     */
    getRecentActivity(): QualityActivity {
        return { ...this.recentActivity };
    }

    /**
     * Record quality analysis result
     */
    recordQualityAnalysis(qualityScore: number, issuesFound: number): void {
        if (!this.isTracking) return;

        this.recentActivity.filesAnalyzed++;
        this.recentActivity.issuesFound += issuesFound;

        if (qualityScore < 50) {
            this.recentActivity.complexityIncreases++;
        }

        console.log('Quality analysis recorded:', { qualityScore, issuesFound });
    }

    /**
     * Record duplicate code detection
     */
    recordDuplicateCode(count: number): void {
        if (!this.isTracking) return;
        
        this.recentActivity.duplicateCodeDetected += count;
        console.log('Duplicate code detected:', count);
    }

    /**
     * Record long function detection
     */
    recordLongFunction(): void {
        if (!this.isTracking) return;
        
        this.recentActivity.longFunctionsAdded = true;
        console.log('Long function detected');
    }

    /**
     * Reset session data
     */
    resetSession(): void {
        this.recentActivity = {
            complexityIncreases: 0,
            duplicateCodeDetected: 0,
            longFunctionsAdded: false,
            filesAnalyzed: 0,
            issuesFound: 0
        };
        this.sessionStart = Date.now();
    }

    /**
     * Get session duration in minutes
     */
    getSessionDuration(): number {
        return Math.floor((Date.now() - this.sessionStart) / (1000 * 60));
    }

    /**
     * Generate quality pattern for analysis
     */
    generateQualityPattern(projectType: string, complexity: number): any {
        const sessionDuration = this.getSessionDuration();
        
        return {
            timestamp: Date.now(),
            qualityScore: Math.max(0, 100 - (this.recentActivity.issuesFound * 10)),
            sessionDuration,
            linesAnalyzed: this.recentActivity.filesAnalyzed * 50, // Estimate
            filesModified: this.recentActivity.filesAnalyzed,
            issuesFound: this.recentActivity.issuesFound,
            projectType,
            complexity
        };
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopTracking();
    }
}