import * as vscode from 'vscode';
import { QualityPattern } from '../prediction/AnalysisEngine';

export interface StoredData {
    qualityHistory: QualityPattern[];
    userSettings: UserSettings;
    modelData: ModelData;
    sessionData: SessionData[];
}

export interface UserSettings {
    qualityThreshold: number;
    notificationThreshold: number;
    enableAutoTracking: boolean;
    enablePredictions: boolean;
    analysisDepth: 'fast' | 'thorough' | 'deep';
    lastSyncTime: number;
}

export interface ModelData {
    regressionWeights: number[];
    regressionBias: number;
    timeSeriesData: any;
    lastTrainingTime: number;
    trainingDataCount: number;
}

export interface SessionData {
    id: string;
    startTime: number;
    endTime: number;
    qualityScore: number;
    linesAnalyzed: number;
    filesModified: string[];
    projectType: string;
    complexity: number;
}

export class DataStorage {
    private readonly STORAGE_KEY = 'codeQuality';
    private readonly MAX_HISTORY_ENTRIES = 1000;
    private readonly MAX_SESSION_ENTRIES = 100;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Save quality history to persistent storage
     */
    async saveQualityHistory(qualityHistory: QualityPattern[]): Promise<void> {
        try {
            // Limit history size
            const limitedHistory = qualityHistory.slice(-this.MAX_HISTORY_ENTRIES);
            
            await this.context.globalState.update(
                `${this.STORAGE_KEY}.qualityHistory`,
                limitedHistory
            );
        } catch (error) {
            console.error('Failed to save quality history:', error);
        }
    }

    /**
     * Load quality history from persistent storage
     */
    async loadQualityHistory(): Promise<QualityPattern[]> {
        try {
            const history = this.context.globalState.get<QualityPattern[]>(
                `${this.STORAGE_KEY}.qualityHistory`
            );
            return history || [];
        } catch (error) {
            console.error('Failed to load quality history:', error);
            return [];
        }
    }

    /**
     * Save user settings
     */
    async saveUserSettings(settings: UserSettings): Promise<void> {
        try {
            await this.context.globalState.update(
                `${this.STORAGE_KEY}.userSettings`,
                settings
            );
        } catch (error) {
            console.error('Failed to save user settings:', error);
        }
    }

    /**
     * Load user settings with defaults
     */
    async loadUserSettings(): Promise<UserSettings> {
        try {
            const settings = this.context.globalState.get<UserSettings>(
                `${this.STORAGE_KEY}.userSettings`
            );
            
            // Return defaults if no settings found
            return {
                qualityThreshold: 75,
                notificationThreshold: 50,
                enableAutoTracking: true,
                enablePredictions: true,
                analysisDepth: 'thorough',
                lastSyncTime: 0,
                ...settings
            };
        } catch (error) {
            console.error('Failed to load user settings:', error);
            return {
                qualityThreshold: 75,
                notificationThreshold: 50,
                enableAutoTracking: true,
                enablePredictions: true,
                analysisDepth: 'thorough',
                lastSyncTime: 0
            };
        }
    }

    /**
     * Save model training data
     */
    async saveModelData(modelData: ModelData): Promise<void> {
        try {
            await this.context.globalState.update(
                `${this.STORAGE_KEY}.modelData`,
                modelData
            );
        } catch (error) {
            console.error('Failed to save model data:', error);
        }
    }

    /**
     * Load model training data
     */
    async loadModelData(): Promise<ModelData | null> {
        try {
            return this.context.globalState.get<ModelData>(
                `${this.STORAGE_KEY}.modelData`
            ) || null;
        } catch (error) {
            console.error('Failed to load model data:', error);
            return null;
        }
    }

    /**
     * Save session data
     */
    async saveSessionData(sessionData: SessionData[]): Promise<void> {
        try {
            const limitedSessions = sessionData.slice(-this.MAX_SESSION_ENTRIES);
            
            await this.context.globalState.update(
                `${this.STORAGE_KEY}.sessionData`,
                limitedSessions
            );
        } catch (error) {
            console.error('Failed to save session data:', error);
        }
    }

    /**
     * Load session data
     */
    async loadSessionData(): Promise<SessionData[]> {
        try {
            return this.context.globalState.get<SessionData[]>(
                `${this.STORAGE_KEY}.sessionData`
            ) || [];
        } catch (error) {
            console.error('Failed to load session data:', error);
            return [];
        }
    }

    /**
     * Clear all stored data
     */
    async clearAllData(): Promise<void> {
        try {
            await this.context.globalState.update(`${this.STORAGE_KEY}.qualityHistory`, undefined);
            await this.context.globalState.update(`${this.STORAGE_KEY}.userSettings`, undefined);
            await this.context.globalState.update(`${this.STORAGE_KEY}.modelData`, undefined);
            await this.context.globalState.update(`${this.STORAGE_KEY}.sessionData`, undefined);
        } catch (error) {
            console.error('Failed to clear data:', error);
        }
    }

    /**
     * Migrate data from old format (if needed)
     */
    async migrateData(): Promise<void> {
        try {
            // Check if old WindsuCredit data exists
            const oldSettings = this.context.globalState.get('windsuCredit.userSettings');
            if (oldSettings) {
                // Clear old data
                await this.context.globalState.update('windsuCredit.userSettings', undefined);
                await this.context.globalState.update('windsuCredit.usageHistory', undefined);
                await this.context.globalState.update('windsuCredit.modelData', undefined);
                console.log('Migrated from old WindsuCredit data format');
            }
        } catch (error) {
            console.error('Failed to migrate data:', error);
        }
    }

    /**
     * Export all data for backup
     */
    async exportAllData(): Promise<StoredData> {
        const qualityHistory = await this.loadQualityHistory();
        const userSettings = await this.loadUserSettings();
        const modelData = await this.loadModelData();
        const sessionData = await this.loadSessionData();

        return {
            qualityHistory,
            userSettings,
            modelData: modelData || {
                regressionWeights: [],
                regressionBias: 0,
                timeSeriesData: null,
                lastTrainingTime: 0,
                trainingDataCount: 0
            },
            sessionData
        };
    }

    /**
     * Import data from backup
     */
    async importAllData(data: StoredData): Promise<void> {
        await this.saveQualityHistory(data.qualityHistory);
        await this.saveUserSettings(data.userSettings);
        await this.saveModelData(data.modelData);
        await this.saveSessionData(data.sessionData);
    }
}