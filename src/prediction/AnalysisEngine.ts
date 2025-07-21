import * as vscode from 'vscode';
import { QualityTracker } from '../tracking/QualityTracker';
import { LinearRegressionModel } from './models/LinearRegressionModel';
import { TimeSeriesModel } from './models/TimeSeriesModel';
import { ProjectAnalyzer } from './models/ProjectAnalyzer';
import { DataStorage } from '../storage/DataStorage';

export interface AnalysisResult {
    overallQuality: number;
    bugRisk: number;
    maintainabilityScore: number;
    performanceScore: number;
    confidence: number;
    recommendations: string[];
}

export interface QualityPattern {
    timestamp: number;
    qualityScore: number;
    sessionDuration: number;
    linesAnalyzed: number;
    filesModified: number;
    issuesFound: number;
    projectType: string;
    complexity: number;
}

export class AnalysisEngine {
    private regressionModel: LinearRegressionModel;
    private timeSeriesModel: TimeSeriesModel;
    public projectAnalyzer: ProjectAnalyzer;
    public storage: DataStorage;
    private qualityHistory: QualityPattern[] = [];
    private isLearning: boolean = true;

    constructor(
        private context: vscode.ExtensionContext,
        private qualityTracker: QualityTracker
    ) {
        this.storage = new DataStorage(context);
        this.regressionModel = new LinearRegressionModel();
        this.timeSeriesModel = new TimeSeriesModel();
        this.projectAnalyzer = new ProjectAnalyzer();
        
        this.loadHistoricalData();
        this.startLearning();
    }

    /**
     * Main analysis method - generates comprehensive quality analysis
     */
    async generateAnalysis(): Promise<AnalysisResult> {
        const recentQuality = this.getRecentQuality();
        const projectMetrics = await this.projectAnalyzer.analyzeCurrentProject();
        
        // Calculate base quality score
        const overallQuality = this.calculateQualityScore(recentQuality);
        
        // Enhanced analysis using ML models
        const regressionAnalysis = this.regressionModel.predict(recentQuality, projectMetrics);
        const trendAnalysis = this.timeSeriesModel.predict(this.qualityHistory);
        
        // Calculate bug risk
        const bugRisk = this.calculateBugRisk(
            regressionAnalysis.riskFactors,
            projectMetrics.complexity
        );
        
        // Calculate maintainability score
        const maintainabilityScore = this.calculateMaintainability(
            projectMetrics,
            recentQuality
        );
        
        // Calculate performance score
        const performanceScore = this.calculatePerformance(
            projectMetrics,
            recentQuality
        );

        // Generate confidence score
        const confidence = this.calculateConfidence(recentQuality.length);

        // Generate improvement recommendations
        const recommendations = this.generateQualityRecommendations(
            recentQuality,
            projectMetrics,
            bugRisk
        );

        return {
            overallQuality,
            bugRisk,
            maintainabilityScore,
            performanceScore,
            confidence,
            recommendations
        };
    }

    /**
     * Record new quality data for learning
     */
    recordQuality(pattern: QualityPattern): void {
        this.qualityHistory.push(pattern);
        
        // Keep only last 1000 entries for performance
        if (this.qualityHistory.length > 1000) {
            this.qualityHistory = this.qualityHistory.slice(-1000);
        }

        // Store to persistent storage
        this.storage.saveQualityHistory(this.qualityHistory);

        // Update models with new data
        this.updateModels();
    }

    /**
     * Detect if quality issues are likely
     */
    async detectQualityIssues(): Promise<{
        probability: number;
        severity: string;
        reason: string;
    }> {
        const projectMetrics = await this.projectAnalyzer.analyzeCurrentProject();
        const recentActivity = this.qualityTracker.getRecentActivity();

        let probability = 0;
        let severity = 'low';
        let reason = '';

        // Check for indicators of quality issues
        if (recentActivity.complexityIncreases > 3) {
            probability += 0.3;
            reason += 'Code complexity increasing. ';
        }

        if (recentActivity.duplicateCodeDetected > 0) {
            probability += 0.4;
            severity = 'medium';
            reason += 'Code duplication detected. ';
        }

        if (recentActivity.longFunctionsAdded) {
            probability += 0.5;
            severity = 'high';
            reason += 'Long functions added. ';
        }

        if (projectMetrics.complexity > 0.7) {
            probability += 0.3;
            reason += 'High project complexity. ';
        }

        // Clamp probability to 0-1 range
        probability = Math.min(1, Math.max(0, probability));

        return {
            probability,
            severity,
            reason: reason.trim() || 'No specific quality issues detected'
        };
    }

    /**
     * Get recent quality patterns for analysis
     */
    private getRecentQuality(): QualityPattern[] {
        const now = Date.now();
        const dayAgo = now - (24 * 60 * 60 * 1000);
        
        return this.qualityHistory.filter(pattern => pattern.timestamp > dayAgo);
    }

    /**
     * Calculate overall quality score
     */
    private calculateQualityScore(recentQuality: QualityPattern[]): number {
        if (recentQuality.length === 0) {
            return 75; // Default quality score
        }

        const avgQuality = recentQuality.reduce((sum, pattern) => sum + pattern.qualityScore, 0) / recentQuality.length;
        return Math.round(avgQuality);
    }

    /**
     * Calculate bug risk percentage
     */
    private calculateBugRisk(riskFactors: any, complexity: number): number {
        const baseRisk = complexity * 30; // Higher complexity = higher risk
        const factorRisk = riskFactors?.bugProbability || 0;
        
        return Math.min(100, Math.max(0, baseRisk + factorRisk));
    }

    /**
     * Calculate maintainability score
     */
    private calculateMaintainability(projectMetrics: any, recentQuality: QualityPattern[]): number {
        const complexityFactor = (1 - projectMetrics.complexity) * 10;
        const qualityFactor = this.calculateQualityScore(recentQuality) / 10;
        
        return Math.round(Math.min(10, Math.max(1, (complexityFactor + qualityFactor) / 2)));
    }

    /**
     * Calculate performance score
     */
    private calculatePerformance(projectMetrics: any, recentQuality: QualityPattern[]): number {
        const baseScore = 8; // Default good performance
        const complexityPenalty = projectMetrics.complexity * 3;
        
        return Math.round(Math.min(10, Math.max(1, baseScore - complexityPenalty)));
    }

    /**
     * Calculate confidence in analysis
     */
    private calculateConfidence(dataPoints: number): number {
        if (dataPoints === 0) return 0.5;
        if (dataPoints < 10) return 0.6;
        if (dataPoints < 50) return 0.8;
        return 0.95;
    }

    /**
     * Generate quality improvement recommendations
     */
    private generateQualityRecommendations(
        recentQuality: QualityPattern[],
        projectMetrics: any,
        bugRisk: number
    ): string[] {
        const recommendations = [];

        if (bugRisk > 50) {
            recommendations.push('High bug risk detected - consider refactoring complex functions');
        }

        if (projectMetrics.complexity > 0.7) {
            recommendations.push('Project complexity is high - break down large components');
        }

        if (recentQuality.some(q => q.issuesFound > 5)) {
            recommendations.push('Multiple issues found - implement stricter code review process');
        }

        recommendations.push('Maintain consistent coding standards');
        recommendations.push('Add comprehensive unit tests');

        return recommendations;
    }

    /**
     * Export analytics data
     */
    exportAnalytics(): any {
        return {
            totalAnalyses: this.qualityHistory.length,
            averageQuality: this.calculateQualityScore(this.qualityHistory),
            trend: this.qualityHistory.length > 1 ? 'improving' : 'stable',
            lastAnalysis: this.qualityHistory[this.qualityHistory.length - 1]?.timestamp || 0
        };
    }

    /**
     * Generate test data for development
     */
    generateTestData(): void {
        const testPattern: QualityPattern = {
            timestamp: Date.now(),
            qualityScore: Math.floor(Math.random() * 40) + 60,
            sessionDuration: Math.floor(Math.random() * 120) + 30,
            linesAnalyzed: Math.floor(Math.random() * 500) + 100,
            filesModified: Math.floor(Math.random() * 5) + 1,
            issuesFound: Math.floor(Math.random() * 3),
            projectType: 'TypeScript',
            complexity: Math.random() * 0.5 + 0.3
        };

        this.recordQuality(testPattern);
        vscode.window.showInformationMessage('Test quality data generated');
    }

    /**
     * Get optimization tips
     */
    getOptimizationTips(): string[] {
        return [
            'Use consistent naming conventions',
            'Keep functions small and focused',
            'Add proper error handling',
            'Write comprehensive tests',
            'Document complex logic',
            'Refactor duplicate code'
        ];
    }

    /**
     * Load historical data from storage
     */
    private async loadHistoricalData(): Promise<void> {
        try {
            const history = await this.storage.loadQualityHistory();
            if (history && Array.isArray(history)) {
                this.qualityHistory = history;
            }
        } catch (error) {
            console.warn('Could not load quality history:', error);
        }
    }

    /**
     * Start the learning process
     */
    private startLearning(): void {
        // Initialize with some base learning
        this.isLearning = true;
    }

    /**
     * Update ML models with new data
     */
    private updateModels(): void {
        if (this.qualityHistory.length > 10) {
            this.regressionModel.train(this.qualityHistory);
            this.timeSeriesModel.train(this.qualityHistory);
        }
    }
}