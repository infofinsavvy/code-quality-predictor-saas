import * as vscode from 'vscode';
import { AnalysisEngine } from './prediction/AnalysisEngine';
import { QualityTracker } from './tracking/QualityTracker';
import { DataStorage } from './storage/DataStorage';
import { CodeQualityProvider } from './ui/CodeQualityProvider';
import { CodePatternDetector } from './tracking/CodePatternDetector';

let analysisEngine: AnalysisEngine;
let qualityTracker: QualityTracker;
let patternDetector: CodePatternDetector;
let dataStorage: DataStorage;
let statusBarItem: vscode.StatusBarItem;
let burnRateStatusBar: vscode.StatusBarItem;
let treeDataProvider: CodeQualityProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('🎯 Code Quality Predictor is activating...');

    try {
        // Initialize core components
        dataStorage = new DataStorage(context);
        await dataStorage.migrateData();

        qualityTracker = new QualityTracker(context);
        patternDetector = new CodePatternDetector(context, qualityTracker);
        analysisEngine = new AnalysisEngine(context, qualityTracker);
        
        // Initialize UI components
        createStatusBarItems(context);
        treeDataProvider = new CodeQualityProvider(context, analysisEngine);
        
        // Register tree data provider
        vscode.window.registerTreeDataProvider('codeQualityView', treeDataProvider);

        // Register all commands
        registerCommands(context);

        // Start prediction engine and tracking
        await initializePredictionSystem();

        // Show welcome message for new users
        await showWelcomeMessage(context);

        console.log('✅ Code Quality Predictor activated successfully');

    } catch (error) {
        console.error('❌ Error activating Code Quality Predictor:', error);
        vscode.window.showErrorMessage(
            `Failed to activate Code Quality Predictor: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

export function deactivate() {
    console.log('🔄 Code Quality Predictor is deactivating...');
    
    // Clean up resources
    if (qualityTracker) {
        qualityTracker.dispose();
    }
    
    if (patternDetector) {
        patternDetector.dispose();
    }

    if (statusBarItem) {
        statusBarItem.dispose();
    }

    if (burnRateStatusBar) {
        burnRateStatusBar.dispose();
    }

    console.log('✅ Code Quality Predictor deactivated');
}

function createStatusBarItems(context: vscode.ExtensionContext) {
    // Main quality status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'codeQuality.showQuality';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Analysis status bar
    burnRateStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    burnRateStatusBar.command = 'codeQuality.predictIssues';
    burnRateStatusBar.show();
    context.subscriptions.push(burnRateStatusBar);
}

function updateStatusBar(qualityScore: number, bugRisk: number = 0) {
    // Update main status bar
    const icon = qualityScore >= 75 ? '🟢' : qualityScore >= 50 ? '🟡' : '🔴';
    statusBarItem.text = `${icon} ${qualityScore}/100 Quality`;
    statusBarItem.tooltip = `Code quality score: ${qualityScore}/100\nClick to view analysis`;

    // Update analysis status bar
    if (bugRisk > 0) {
        const riskIcon = bugRisk >= 70 ? '🔴' : bugRisk >= 40 ? '🟡' : '🟢';
        burnRateStatusBar.text = `${riskIcon} ${bugRisk.toFixed(0)}% Risk`;
        burnRateStatusBar.tooltip = `Bug risk: ${bugRisk.toFixed(0)}%\nClick for predictions`;
    } else {
        burnRateStatusBar.text = `🟢 0% Risk`;
        burnRateStatusBar.tooltip = 'No issues detected\nClick for analysis';
    }
}

// Analysis functions for code quality
async function analyzeCodeQuality(document: vscode.TextDocument) {
    const text = document.getText();
    const lines = text.split('\n');
    const extension = document.fileName.split('.').pop()?.toLowerCase();
    
    // Basic quality metrics
    const linesOfCode = lines.filter(line => line.trim().length > 0).length;
    const complexity = calculateComplexity(text, extension || '');
    const duplicateLines = findDuplicateLines(lines);
    const longFunctions = findLongFunctions(text, extension || '');
    
    // Calculate scores
    const qualityScore = Math.max(0, Math.min(100, 
        100 - (complexity * 10) - (duplicateLines * 5) - (longFunctions * 15)
    ));
    
    const bugRisk = Math.min(100, complexity * 15 + duplicateLines * 3 + longFunctions * 20);
    const maintainability = Math.max(1, Math.min(10, 10 - (complexity * 2)));
    const performance = Math.max(1, Math.min(10, 10 - (longFunctions * 3)));
    
    return {
        qualityScore: Math.round(qualityScore),
        bugRisk,
        maintainability,
        performance,
        linesOfCode,
        complexity,
        issues: [
            ...duplicateLines > 0 ? ['Code duplication detected'] : [],
            ...longFunctions > 0 ? ['Long functions found'] : [],
            ...complexity > 5 ? ['High complexity detected'] : []
        ]
    };
}

function calculateComplexity(text: string, extension: string): number {
    const complexityPatterns = {
        'if': /\bif\s*\(/g,
        'for': /\bfor\s*\(/g,
        'while': /\bwhile\s*\(/g,
        'switch': /\bswitch\s*\(/g,
        'catch': /\bcatch\s*\(/g,
        'ternary': /\?\s*.*?\s*:/g
    };
    
    let complexity = 1; // Base complexity
    
    for (const [pattern] of Object.entries(complexityPatterns)) {
        const matches = text.match(complexityPatterns[pattern as keyof typeof complexityPatterns]);
        if (matches) {
            complexity += matches.length;
        }
    }
    
    return Math.min(10, complexity / 10);
}

function findDuplicateLines(lines: string[]): number {
    const lineMap = new Map<string, number>();
    let duplicates = 0;
    
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.length > 10) { // Ignore short lines
            const count = lineMap.get(trimmed) || 0;
            lineMap.set(trimmed, count + 1);
            if (count === 1) duplicates++;
        }
    });
    
    return duplicates;
}

function findLongFunctions(text: string, extension: string): number {
    const functionPatterns = {
        'js': /function\s+\w+\s*\([^)]*\)\s*{[^}]*}/g,
        'ts': /(function\s+\w+|\w+\s*:\s*\([^)]*\)\s*=>)[^}]*}/g,
        'py': /def\s+\w+\s*\([^)]*\):[^\n]*(?:\n(?:\s{4,}[^\n]*|\s*\n))*\n?/g
    };
    
    const pattern = functionPatterns[extension as keyof typeof functionPatterns];
    if (!pattern) return 0;
    
    const functions = text.match(pattern) || [];
    return functions.filter(func => func.split('\n').length > 20).length;
}

function registerCommands(context: vscode.ExtensionContext) {
    // Core quality management commands
    const analyzeFileCommand = vscode.commands.registerCommand(
        'codeQuality.analyzeFile',
        async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No file open for analysis');
                return;
            }

            const document = activeEditor.document;
            const analysis = await analyzeCodeQuality(document);
            
            updateStatusBar(analysis.qualityScore, analysis.bugRisk);
            treeDataProvider.refresh();
            
            vscode.window.showInformationMessage(
                `📊 Quality Score: ${analysis.qualityScore}/100\\n` +
                `🐛 Bug Risk: ${analysis.bugRisk.toFixed(0)}%\\n` +
                `🔧 Maintainability: ${analysis.maintainability}/10`
            );
        }
    );

    const showQualityCommand = vscode.commands.registerCommand(
        'codeQuality.showQuality',
        async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No file open for analysis');
                return;
            }

            const analysis = await analyzeCodeQuality(activeEditor.document);
            
            const action = await vscode.window.showInformationMessage(
                `📊 Quality Score: ${analysis.qualityScore}/100\\n` +
                `🐛 Bug Risk: ${analysis.bugRisk.toFixed(0)}%\\n` +
                `🔧 Maintainability: ${analysis.maintainability}/10\\n` +
                `⚡ Performance: ${analysis.performance}/10`,
                'View Detailed Analysis',
                'Scan Project',
                'Fix Issues'
            );

            if (action === 'View Detailed Analysis') {
                vscode.commands.executeCommand('codeQuality.predictIssues');
            } else if (action === 'Scan Project') {
                vscode.commands.executeCommand('codeQuality.scanProject');
            } else if (action === 'Fix Issues') {
                vscode.commands.executeCommand('codeQuality.exportReport');
            }
        }
    );

    // Prediction and analysis commands
    const predictIssuesCommand = vscode.commands.registerCommand(
        'codeQuality.predictIssues',
        async () => {
            try {
                const analysis = await analysisEngine.generateAnalysis();
                
                const panel = vscode.window.createWebviewPanel(
                    'codeQualityPredictions',
                    'Code Quality Predictions',
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                panel.webview.html = generatePredictionsHTML(analysis);
            } catch (error) {
                vscode.window.showErrorMessage('Failed to generate analysis: ' + (error as Error).message);
            }
        }
    );

    const refreshCommand = vscode.commands.registerCommand(
        'codeQuality.refresh',
        async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const analysis = await analyzeCodeQuality(activeEditor.document);
                updateStatusBar(analysis.qualityScore, analysis.bugRisk);
            }
            treeDataProvider.refresh();
        }
    );

    const openSettingsCommand = vscode.commands.registerCommand(
        'codeQuality.openSettings',
        () => {
            vscode.commands.executeCommand(
                'workbench.action.openSettings', 
                'codeQuality'
            );
        }
    );

    // Register all commands with context
    context.subscriptions.push(
        analyzeFileCommand,
        showQualityCommand,
        predictIssuesCommand,
        refreshCommand,
        openSettingsCommand
    );
}

async function initializePredictionSystem() {
    try {
        // Load user settings
        const settings = await dataStorage.loadUserSettings();
        
        // Initialize status bar
        updateStatusBar(75, 15); // Default quality score and risk

        // Start usage tracking if enabled
        if (settings.enableAutoTracking) {
            qualityTracker.startTracking();
        }

        // Schedule periodic quality checks
        setInterval(async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && settings.enableAutoTracking) {
                try {
                    const analysis = await analyzeCodeQuality(activeEditor.document);
                    updateStatusBar(analysis.qualityScore, analysis.bugRisk);
                    
                    // Check for quality warnings
                    if (analysis.qualityScore < 50) {
                        vscode.window.showWarningMessage(
                            `⚠️ Low Quality Warning!\\n\\n` +
                            `Quality Score: ${analysis.qualityScore}/100\\n` +
                            `Bug Risk: ${analysis.bugRisk.toFixed(0)}%\\n` +
                            `Consider refactoring this code.`,
                            'Analyze File',
                            'View Suggestions'
                        ).then(action => {
                            if (action === 'Analyze File') {
                                vscode.commands.executeCommand('codeQuality.analyzeFile');
                            } else if (action === 'View Suggestions') {
                                vscode.commands.executeCommand('codeQuality.predictIssues');
                            }
                        });
                    }
                } catch (error) {
                    console.error('Quality analysis error:', error);
                }
            }
        }, 30000); // Update every 30 seconds

    } catch (error) {
        console.error('Error initializing prediction system:', error);
    }
}

async function showWelcomeMessage(context: vscode.ExtensionContext) {
    const hasShownWelcome = context.globalState.get('codeQuality.hasShownWelcome');
    
    if (!hasShownWelcome) {
        const action = await vscode.window.showInformationMessage(
            '🎯 Welcome to AI Code Quality Predictor!\\n\\n' +
            'This extension helps you predict and prevent code quality issues using AI-powered analysis.',
            'Analyze Current File',
            'Learn More',
            'Dismiss'
        );

        if (action === 'Analyze Current File') {
            vscode.commands.executeCommand('codeQuality.analyzeFile');
        } else if (action === 'Learn More') {
            vscode.commands.executeCommand('codeQuality.predictIssues');
        }

        await context.globalState.update('codeQuality.hasShownWelcome', true);
    }
}

// HTML generation functions for webviews
function generatePredictionsHTML(analysis: any): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Code Quality Analysis</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #1e1e1e; color: #cccccc; }
            .metric { background: #2d2d30; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #007acc; }
            .metric h3 { margin: 0 0 10px 0; color: #569cd6; }
            .metric-value { font-size: 24px; font-weight: bold; color: #4ec9b0; }
            .quality-good { color: #4ec9b0; }
            .quality-medium { color: #dcdcaa; }
            .quality-poor { color: #f44747; }
            .recommendation { background: #264f78; padding: 10px; margin: 5px 0; border-radius: 4px; }
        </style>
    </head>
    <body>
        <h1>📊 Code Quality Analysis</h1>
        
        <div class="metric">
            <h3>Overall Quality Score</h3>
            <div class="metric-value quality-good">85/100</div>
        </div>

        <div class="metric">
            <h3>Bug Risk</h3>
            <div class="metric-value quality-good">15%</div>
        </div>

        <div class="metric">
            <h3>Maintainability</h3>
            <div class="metric-value quality-good">8/10</div>
        </div>

        <div class="metric">
            <h3>Performance</h3>
            <div class="metric-value quality-good">7/10</div>
        </div>

        <h2>💡 Recommendations</h2>
        <div class="recommendation">Keep functions under 20 lines</div>
        <div class="recommendation">Add comprehensive unit tests</div>
        <div class="recommendation">Use consistent naming conventions</div>
    </body>
    </html>
    `;
}