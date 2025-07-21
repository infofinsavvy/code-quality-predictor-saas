import { QualityPattern } from '../AnalysisEngine';

export interface TimeSeriesPrediction {
    daily: number;
    weekly: number;
    trend: 'improving' | 'declining' | 'stable';
    seasonality: number;
    confidence: number;
}

export class TimeSeriesModel {
    private trendCoefficient: number = 0;
    private seasonalFactors: number[] = [];
    private isInitialized: boolean = false;

    /**
     * Train the time series model with quality history
     */
    train(qualityHistory: QualityPattern[]): void {
        if (qualityHistory.length < 7) {
            console.log('Insufficient data for time series analysis');
            return;
        }

        this.analyzeTrend(qualityHistory);
        this.analyzeSeasonality(qualityHistory);
        this.isInitialized = true;
    }

    /**
     * Predict future quality trends
     */
    predict(qualityHistory: QualityPattern[]): TimeSeriesPrediction {
        if (!this.isInitialized || qualityHistory.length === 0) {
            return this.defaultPrediction();
        }

        const recentQuality = qualityHistory.slice(-7); // Last week
        const avgQuality = recentQuality.reduce((sum, q) => sum + q.qualityScore, 0) / recentQuality.length;
        
        // Apply trend
        const dailyPrediction = avgQuality + this.trendCoefficient;
        const weeklyPrediction = avgQuality + (this.trendCoefficient * 7);

        // Determine trend direction
        let trend: 'improving' | 'declining' | 'stable' = 'stable';
        if (this.trendCoefficient > 2) trend = 'improving';
        else if (this.trendCoefficient < -2) trend = 'declining';

        const confidence = this.calculateConfidence(qualityHistory.length);

        return {
            daily: Math.max(0, Math.min(100, Math.round(dailyPrediction))),
            weekly: Math.max(0, Math.min(100, Math.round(weeklyPrediction))),
            trend,
            seasonality: this.calculateSeasonality(),
            confidence
        };
    }

    /**
     * Analyze quality trend over time
     */
    private analyzeTrend(qualityHistory: QualityPattern[]): void {
        if (qualityHistory.length < 2) {
            this.trendCoefficient = 0;
            return;
        }

        // Simple linear trend calculation
        const n = qualityHistory.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        qualityHistory.forEach((quality, index) => {
            sumX += index;
            sumY += quality.qualityScore;
            sumXY += index * quality.qualityScore;
            sumXX += index * index;
        });

        // Calculate slope (trend coefficient)
        this.trendCoefficient = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }

    /**
     * Analyze seasonal patterns in quality
     */
    private analyzeSeasonality(qualityHistory: QualityPattern[]): void {
        // Simple weekly seasonality (7 day cycle)
        this.seasonalFactors = new Array(7).fill(0);
        const dailyCounts = new Array(7).fill(0);

        qualityHistory.forEach(quality => {
            const dayOfWeek = new Date(quality.timestamp).getDay();
            this.seasonalFactors[dayOfWeek] += quality.qualityScore;
            dailyCounts[dayOfWeek]++;
        });

        // Calculate average for each day of week
        this.seasonalFactors = this.seasonalFactors.map((sum, index) => 
            dailyCounts[index] > 0 ? sum / dailyCounts[index] : 75
        );
    }

    /**
     * Calculate seasonal effect for current time
     */
    private calculateSeasonality(): number {
        if (this.seasonalFactors.length === 0) return 0;
        
        const today = new Date().getDay();
        const avgSeasonal = this.seasonalFactors.reduce((sum, factor) => sum + factor, 0) / 7;
        
        return this.seasonalFactors[today] - avgSeasonal;
    }

    /**
     * Calculate prediction confidence
     */
    private calculateConfidence(dataPoints: number): number {
        if (dataPoints < 7) return 0.3;
        if (dataPoints < 30) return 0.6;
        if (dataPoints < 90) return 0.8;
        return 0.9;
    }

    /**
     * Default prediction when model is not initialized
     */
    private defaultPrediction(): TimeSeriesPrediction {
        return {
            daily: 75,
            weekly: 75,
            trend: 'stable',
            seasonality: 0,
            confidence: 0.3
        };
    }

    /**
     * Get current trend direction as string
     */
    getTrendDirection(): string {
        if (this.trendCoefficient > 2) return 'Quality is improving';
        if (this.trendCoefficient < -2) return 'Quality is declining';
        return 'Quality is stable';
    }

    /**
     * Get seasonal insights
     */
    getSeasonalInsights(): string[] {
        if (this.seasonalFactors.length === 0) {
            return ['Not enough data for seasonal analysis'];
        }

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const avgQuality = this.seasonalFactors.reduce((sum, factor) => sum + factor, 0) / 7;
        
        const insights: string[] = [];
        
        this.seasonalFactors.forEach((factor, index) => {
            if (factor > avgQuality + 5) {
                insights.push(`${dayNames[index]} tends to have higher quality code`);
            } else if (factor < avgQuality - 5) {
                insights.push(`${dayNames[index]} tends to have lower quality code`);
            }
        });

        return insights.length > 0 ? insights : ['No significant seasonal patterns detected'];
    }
}