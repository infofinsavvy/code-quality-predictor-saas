import { QualityPattern } from '../AnalysisEngine';

export interface PredictionOutput {
    daily: number;
    weekly: number;
    confidence: number;
    riskFactors: {
        bugProbability: number;
    };
}

export class LinearRegressionModel {
    private weights: number[] = [];
    private bias: number = 0;
    private isTrained: boolean = false;

    /**
     * Train the model with quality history data
     */
    train(qualityHistory: QualityPattern[]): void {
        if (qualityHistory.length < 5) {
            console.log('Insufficient data for linear regression training');
            return;
        }

        const features = this.extractFeatures(qualityHistory);
        const targets = qualityHistory.map(quality => quality.qualityScore);

        // Simple linear regression using least squares
        this.trainLinearRegression(features, targets);
        this.isTrained = true;
    }

    /**
     * Predict quality trends based on current patterns
     */
    predict(recentQuality: QualityPattern[], projectMetrics: any): PredictionOutput {
        if (!this.isTrained || recentQuality.length === 0) {
            // Fallback to simple average-based prediction
            return this.fallbackPrediction(recentQuality);
        }

        const features = this.extractFeaturesFromCurrent(recentQuality, projectMetrics);
        const prediction = this.predictValue(features);

        // Calculate bug probability based on quality trends
        const bugProbability = Math.max(0, Math.min(100, (100 - prediction) * 0.8));

        // Scale predictions for daily and weekly trends
        const dailyTrend = prediction;
        const weeklyTrend = prediction;
        const confidence = this.calculatePredictionConfidence(recentQuality.length);

        return {
            daily: Math.max(0, Math.round(dailyTrend)),
            weekly: Math.max(0, Math.round(weeklyTrend)),
            confidence,
            riskFactors: {
                bugProbability
            }
        };
    }

    /**
     * Extract numerical features from quality patterns for ML training
     */
    private extractFeatures(qualityHistory: QualityPattern[]): number[][] {
        return qualityHistory.map(quality => [
            quality.sessionDuration, // Session duration in minutes
            quality.linesAnalyzed,
            quality.filesModified,
            quality.issuesFound,
            quality.complexity,
            this.encodeProjectType(quality.projectType),
            this.getTimeOfDay(quality.timestamp),
            this.getDayOfWeek(quality.timestamp)
        ]);
    }

    /**
     * Extract features from current quality patterns
     */
    private extractFeaturesFromCurrent(recentQuality: QualityPattern[], projectMetrics: any): number[] {
        if (recentQuality.length === 0) {
            return [0, 0, 0, 0, projectMetrics.complexity || 0.5, 0, 0, 0];
        }

        // Average recent quality patterns
        const avgDuration = recentQuality.reduce((sum, quality) => 
            sum + quality.sessionDuration, 0) / recentQuality.length;
        
        const avgLines = recentQuality.reduce((sum, quality) => 
            sum + quality.linesAnalyzed, 0) / recentQuality.length;
        
        const avgFiles = recentQuality.reduce((sum, quality) => 
            sum + quality.filesModified, 0) / recentQuality.length;
        
        const avgIssues = recentQuality.reduce((sum, quality) => 
            sum + quality.issuesFound, 0) / recentQuality.length;
        
        const avgComplexity = recentQuality.reduce((sum, quality) => 
            sum + quality.complexity, 0) / recentQuality.length;

        const latestProjectType = recentQuality[recentQuality.length - 1]?.projectType || 'Unknown';
        const now = Date.now();

        return [
            avgDuration,
            avgLines,
            avgFiles,
            avgIssues,
            avgComplexity,
            this.encodeProjectType(latestProjectType),
            this.getTimeOfDay(now),
            this.getDayOfWeek(now)
        ];
    }

    /**
     * Fallback prediction when model is not trained
     */
    private fallbackPrediction(recentQuality: QualityPattern[]): PredictionOutput {
        if (recentQuality.length === 0) {
            return {
                daily: 75,
                weekly: 75,
                confidence: 0.3,
                riskFactors: { bugProbability: 20 }
            };
        }

        const avgQuality = recentQuality.reduce((sum, quality) => 
            sum + quality.qualityScore, 0) / recentQuality.length;

        const avgIssues = recentQuality.reduce((sum, quality) => 
            sum + quality.issuesFound, 0) / recentQuality.length;

        const bugProbability = Math.min(100, avgIssues * 15);

        return {
            daily: Math.round(avgQuality),
            weekly: Math.round(avgQuality),
            confidence: 0.5,
            riskFactors: { bugProbability }
        };
    }

    /**
     * Simple linear regression training using least squares
     */
    private trainLinearRegression(features: number[][], targets: number[]): void {
        const numFeatures = features[0].length;
        this.weights = new Array(numFeatures).fill(0);
        this.bias = 0;

        const learningRate = 0.01;
        const epochs = 100;

        for (let epoch = 0; epoch < epochs; epoch++) {
            for (let i = 0; i < features.length; i++) {
                const prediction = this.predictValue(features[i]);
                const error = targets[i] - prediction;

                // Update weights
                for (let j = 0; j < numFeatures; j++) {
                    this.weights[j] += learningRate * error * features[i][j];
                }
                this.bias += learningRate * error;
            }
        }
    }

    /**
     * Predict a single value using the trained model
     */
    private predictValue(features: number[]): number {
        if (this.weights.length === 0) return 75; // Default quality score

        let prediction = this.bias;
        for (let i = 0; i < features.length; i++) {
            prediction += this.weights[i] * features[i];
        }
        
        return Math.max(0, Math.min(100, prediction)); // Clamp to 0-100
    }

    /**
     * Calculate prediction confidence based on data amount
     */
    private calculatePredictionConfidence(dataPoints: number): number {
        if (dataPoints === 0) return 0.3;
        if (dataPoints < 10) return 0.5;
        if (dataPoints < 50) return 0.7;
        return 0.9;
    }

    /**
     * Encode project type as numerical value
     */
    private encodeProjectType(projectType: string): number {
        const typeMap: { [key: string]: number } = {
            'JavaScript': 1,
            'TypeScript': 2,
            'Python': 3,
            'Java': 4,
            'C++': 5,
            'C#': 6,
            'Go': 7,
            'Rust': 8,
            'Unknown': 0
        };
        return typeMap[projectType] || 0;
    }

    /**
     * Get time of day as normalized value (0-1)
     */
    private getTimeOfDay(timestamp: number): number {
        const date = new Date(timestamp);
        const hours = date.getHours();
        return hours / 24;
    }

    /**
     * Get day of week as normalized value (0-1)
     */
    private getDayOfWeek(timestamp: number): number {
        const date = new Date(timestamp);
        const day = date.getDay();
        return day / 7;
    }
}