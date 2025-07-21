import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ProjectMetrics {
    fileCount: number;
    totalLines: number;
    complexity: number;
    projectType: string;
    languages: string[];
    hasTests: boolean;
    hasDependencies: boolean;
    gitActivity: number;
}

export class ProjectAnalyzer {
    private cachedMetrics: ProjectMetrics | null = null;
    private lastAnalysisTime: number = 0;
    private cacheValidityMs = 5 * 60 * 1000; // 5 minutes

    /**
     * Analyze the current workspace to understand project characteristics
     */
    async analyzeCurrentProject(): Promise<ProjectMetrics> {
        const now = Date.now();
        
        // Return cached metrics if still valid
        if (this.cachedMetrics && (now - this.lastAnalysisTime) < this.cacheValidityMs) {
            return this.cachedMetrics;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return this.getDefaultMetrics();
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        
        try {
            const metrics = await this.performAnalysis(rootPath);
            this.cachedMetrics = metrics;
            this.lastAnalysisTime = now;
            return metrics;
        } catch (error) {
            console.error('Error analyzing project:', error);
            return this.getDefaultMetrics();
        }
    }


    /**
     * Analyze file to predict if it might trigger Cascade operations
     */
    async analyzeCascadePotential(filePath: string): Promise<{
        probability: number;
        reasons: string[];
        estimatedFiles: number;
    }> {
        const reasons: string[] = [];
        let probability = 0;
        let estimatedFiles = 1;

        try {
            const fileName = path.basename(filePath);
            const fileExtension = path.extname(filePath);
            const fileContent = await this.readFileContent(filePath);

            // High cascade potential files
            if (fileName === 'package.json') {
                probability += 0.8;
                reasons.push('Package.json changes often trigger dependency updates');
                estimatedFiles += 15;
            }

            if (fileName.includes('config') || fileName.includes('webpack') || fileName.includes('tsconfig')) {
                probability += 0.6;
                reasons.push('Configuration files affect multiple files');
                estimatedFiles += 8;
            }

            if (fileName.includes('types.ts') || fileName.includes('interfaces.ts')) {
                probability += 0.5;
                reasons.push('Type definitions affect multiple files');
                estimatedFiles += 10;
            }

            // Analyze imports/exports
            if (fileContent) {
                const importMatches = fileContent.match(/import.*from/g) || [];
                const exportMatches = fileContent.match(/export/g) || [];
                
                if (importMatches.length > 5) {
                    probability += 0.3;
                    reasons.push('File has many imports - changes may affect dependencies');
                    estimatedFiles += importMatches.length * 0.5;
                }

                if (exportMatches.length > 3) {
                    probability += 0.4;
                    reasons.push('File exports many items - changes may affect consumers');
                    estimatedFiles += exportMatches.length * 2;
                }

                // Check for common patterns that trigger cascades
                if (fileContent.includes('interface ') || fileContent.includes('type ')) {
                    probability += 0.3;
                    reasons.push('Type definitions can cascade to dependent files');
                }

                if (fileContent.includes('const enum') || fileContent.includes('enum ')) {
                    probability += 0.4;
                    reasons.push('Enum changes often cascade to usage sites');
                }
            }

            // File extension analysis
            const highCascadeExtensions = ['.ts', '.tsx', '.d.ts'];
            const mediumCascadeExtensions = ['.js', '.jsx', '.vue', '.svelte'];
            
            if (highCascadeExtensions.includes(fileExtension)) {
                probability += 0.2;
                reasons.push('TypeScript files have higher cascade potential');
            } else if (mediumCascadeExtensions.includes(fileExtension)) {
                probability += 0.1;
                reasons.push('JavaScript files may affect dependent files');
            }

        } catch (error) {
            console.error('Error analyzing cascade potential:', error);
        }

        return {
            probability: Math.min(probability, 1.0),
            reasons,
            estimatedFiles: Math.round(estimatedFiles)
        };
    }

    /**
     * Get project complexity breakdown
     */
    async getComplexityBreakdown(): Promise<{
        overall: number;
        factors: Array<{
            factor: string;
            score: number;
            weight: number;
            description: string;
        }>;
    }> {
        const metrics = await this.analyzeCurrentProject();
        
        const factors = [
            {
                factor: 'File Count',
                score: this.normalizeFileCount(metrics.fileCount),
                weight: 0.15,
                description: `${metrics.fileCount} files in project`
            },
            {
                factor: 'Lines of Code',
                score: this.normalizeLineCount(metrics.totalLines),
                weight: 0.10,
                description: `${metrics.totalLines} total lines`
            },
            {
                factor: 'Language Complexity',
                score: this.getLanguageComplexity(metrics.languages),
                weight: 0.25,
                description: `Languages: ${metrics.languages.join(', ')}`
            },
            {
                factor: 'Dependencies',
                score: metrics.hasDependencies ? 0.8 : 0.2,
                weight: 0.15,
                description: metrics.hasDependencies ? 'Has external dependencies' : 'No dependencies detected'
            },
            {
                factor: 'Testing Setup',
                score: metrics.hasTests ? 0.6 : 0.9,
                weight: 0.10,
                description: metrics.hasTests ? 'Has test files' : 'No test files detected'
            },
            {
                factor: 'Git Activity',
                score: this.normalizeGitActivity(metrics.gitActivity),
                weight: 0.15,
                description: `Git activity score: ${metrics.gitActivity}`
            },
            {
                factor: 'Project Type',
                score: this.getProjectTypeComplexity(metrics.projectType),
                weight: 0.10,
                description: `Project type: ${metrics.projectType}`
            }
        ];

        const overall = factors.reduce((sum, factor) => 
            sum + (factor.score * factor.weight), 0);

        return {
            overall: Math.round(overall * 100) / 100,
            factors
        };
    }

    private async performAnalysis(rootPath: string): Promise<ProjectMetrics> {
        const [
            fileCount,
            totalLines,
            projectType,
            languages,
            hasTests,
            hasDependencies,
            gitActivity
        ] = await Promise.all([
            this.countFiles(rootPath),
            this.countTotalLines(rootPath),
            this.detectProjectType(rootPath),
            this.detectLanguages(rootPath),
            this.checkForTests(rootPath),
            this.checkForDependencies(rootPath),
            this.analyzeGitActivity(rootPath)
        ]);

        const complexity = this.calculateComplexity({
            fileCount,
            totalLines,
            projectType,
            languages,
            hasTests,
            hasDependencies,
            gitActivity
        });


        return {
            fileCount,
            totalLines,
            complexity,
            projectType,
            languages,
            hasTests,
            hasDependencies,
            gitActivity
        };
    }

    private async countFiles(rootPath: string): Promise<number> {
        try {
            const files = await this.getAllFiles(rootPath);
            return files.filter(file => !this.shouldIgnoreFile(file)).length;
        } catch {
            return 0;
        }
    }

    private async countTotalLines(rootPath: string): Promise<number> {
        try {
            const files = await this.getAllFiles(rootPath);
            let totalLines = 0;

            for (const file of files) {
                if (!this.shouldIgnoreFile(file)) {
                    const content = await this.readFileContent(file);
                    if (content) {
                        totalLines += content.split('\n').length;
                    }
                }
            }

            return totalLines;
        } catch {
            return 0;
        }
    }

    private async detectProjectType(rootPath: string): Promise<string> {
        const packageJsonPath = path.join(rootPath, 'package.json');
        
        try {
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                
                // Check dependencies for framework detection
                const allDeps = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies
                };

                if (allDeps.react) return 'React';
                if (allDeps.vue) return 'Vue.js';
                if (allDeps.angular || allDeps['@angular/core']) return 'Angular';
                if (allDeps.next) return 'Next.js';
                if (allDeps.nuxt) return 'Nuxt.js';
                if (allDeps.express) return 'Express.js';
                if (allDeps.typescript) return 'TypeScript';
                
                return 'Node.js';
            }

            // Check for other indicators
            if (fs.existsSync(path.join(rootPath, 'requirements.txt'))) return 'Python';
            if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) return 'Rust';
            if (fs.existsSync(path.join(rootPath, 'go.mod'))) return 'Go';
            if (fs.existsSync(path.join(rootPath, 'pom.xml'))) return 'Java';

        } catch (error) {
            console.error('Error detecting project type:', error);
        }

        return 'Unknown';
    }

    private async detectLanguages(rootPath: string): Promise<string[]> {
        try {
            const files = await this.getAllFiles(rootPath);
            const extensions = new Set<string>();

            files.forEach(file => {
                if (!this.shouldIgnoreFile(file)) {
                    const ext = path.extname(file);
                    if (ext) {
                        extensions.add(ext);
                    }
                }
            });

            const languageMap: Record<string, string> = {
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.tsx': 'TypeScript',
                '.jsx': 'JavaScript',
                '.py': 'Python',
                '.java': 'Java',
                '.cpp': 'C++',
                '.c': 'C',
                '.cs': 'C#',
                '.go': 'Go',
                '.rs': 'Rust',
                '.php': 'PHP',
                '.rb': 'Ruby',
                '.swift': 'Swift',
                '.kt': 'Kotlin',
                '.html': 'HTML',
                '.css': 'CSS',
                '.scss': 'SCSS',
                '.less': 'LESS',
                '.vue': 'Vue',
                '.svelte': 'Svelte'
            };

            const languages = Array.from(extensions)
                .map(ext => languageMap[ext])
                .filter(lang => lang !== undefined);

            return languages.length > 0 ? languages : ['Unknown'];
        } catch {
            return ['Unknown'];
        }
    }

    private async checkForTests(rootPath: string): Promise<boolean> {
        try {
            const files = await this.getAllFiles(rootPath);
            return files.some(file => 
                file.includes('test') || 
                file.includes('spec') || 
                file.includes('__tests__')
            );
        } catch {
            return false;
        }
    }

    private async checkForDependencies(rootPath: string): Promise<boolean> {
        const dependencyFiles = [
            'package.json',
            'requirements.txt',
            'Cargo.toml',
            'go.mod',
            'pom.xml',
            'composer.json'
        ];

        return dependencyFiles.some(file => 
            fs.existsSync(path.join(rootPath, file))
        );
    }

    private async analyzeGitActivity(rootPath: string): Promise<number> {
        try {
            const gitPath = path.join(rootPath, '.git');
            if (!fs.existsSync(gitPath)) {
                return 0.5; // Not a git repo
            }

            // Simple heuristic based on file modification times
            const files = await this.getAllFiles(rootPath);
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            
            let recentFiles = 0;
            for (const file of files.slice(0, 100)) { // Sample first 100 files
                try {
                    const stats = fs.statSync(file);
                    if (now - stats.mtime.getTime() < oneWeek) {
                        recentFiles++;
                    }
                } catch {
                    // Ignore errors for individual files
                }
            }

            return Math.min(recentFiles / 10, 1.0); // Normalize to 0-1
        } catch {
            return 0.5;
        }
    }

    private calculateComplexity(factors: {
        fileCount: number;
        totalLines: number;
        projectType: string;
        languages: string[];
        hasTests: boolean;
        hasDependencies: boolean;
        gitActivity: number;
    }): number {
        let complexity = 0;

        // File count contribution (0-0.3)
        complexity += Math.min(factors.fileCount / 100, 0.3);

        // Lines of code contribution (0-0.2)
        complexity += Math.min(factors.totalLines / 10000, 0.2);

        // Language complexity (0-0.25)
        complexity += this.getLanguageComplexity(factors.languages) * 0.25;

        // Project type complexity (0-0.15)
        complexity += this.getProjectTypeComplexity(factors.projectType) * 0.15;

        // Dependencies add complexity (0-0.1)
        if (factors.hasDependencies) {
            complexity += 0.1;
        }

        return Math.min(complexity, 1.0);
    }

    private getLanguageComplexity(languages: string[]): number {
        const complexityMap: Record<string, number> = {
            'TypeScript': 0.9,
            'C++': 0.95,
            'Java': 0.8,
            'C#': 0.8,
            'JavaScript': 0.6,
            'Python': 0.5,
            'Go': 0.7,
            'Rust': 0.9,
            'HTML': 0.2,
            'CSS': 0.3,
            'Unknown': 0.5
        };

        const avgComplexity = languages.reduce((sum, lang) => 
            sum + (complexityMap[lang] || 0.5), 0) / languages.length;

        return avgComplexity;
    }

    private getProjectTypeComplexity(projectType: string): number {
        const complexityMap: Record<string, number> = {
            'React': 0.8,
            'Angular': 0.9,
            'Vue.js': 0.7,
            'Next.js': 0.8,
            'TypeScript': 0.7,
            'Node.js': 0.6,
            'Python': 0.5,
            'Java': 0.8,
            'Unknown': 0.5
        };

        return complexityMap[projectType] || 0.5;
    }


    private async getAllFiles(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        
        try {
            const items = fs.readdirSync(dirPath);
            
            for (const item of items) {
                if (this.shouldIgnoreDir(item)) continue;
                
                const fullPath = path.join(dirPath, item);
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    const subFiles = await this.getAllFiles(fullPath);
                    files.push(...subFiles);
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Ignore errors and continue
        }
        
        return files;
    }

    private shouldIgnoreDir(dirName: string): boolean {
        const ignoreDirs = [
            'node_modules',
            '.git',
            'dist',
            'build',
            'coverage',
            '__pycache__',
            '.vscode',
            '.idea'
        ];
        
        return ignoreDirs.includes(dirName) || dirName.startsWith('.');
    }

    private shouldIgnoreFile(filePath: string): boolean {
        const ignoreExtensions = ['.log', '.tmp', '.cache'];
        const ignoreFiles = ['package-lock.json', 'yarn.lock'];
        
        const fileName = path.basename(filePath);
        const extension = path.extname(filePath);
        
        return ignoreExtensions.includes(extension) || 
               ignoreFiles.includes(fileName) ||
               fileName.startsWith('.');
    }

    private async readFileContent(filePath: string): Promise<string | null> {
        try {
            // Only read text files, skip large files
            const stats = fs.statSync(filePath);
            if (stats.size > 1024 * 1024) { // Skip files larger than 1MB
                return null;
            }

            return fs.readFileSync(filePath, 'utf8');
        } catch {
            return null;
        }
    }

    private normalizeFileCount(count: number): number {
        // Normalize file count to 0-1 scale
        return Math.min(count / 200, 1.0);
    }

    private normalizeLineCount(lines: number): number {
        // Normalize line count to 0-1 scale
        return Math.min(lines / 50000, 1.0);
    }

    private normalizeGitActivity(activity: number): number {
        // Already normalized in analyzeGitActivity
        return activity;
    }

    private getDefaultMetrics(): ProjectMetrics {
        return {
            fileCount: 1,
            totalLines: 100,
            complexity: 0.5,
            projectType: 'Unknown',
            languages: ['Unknown'],
            hasTests: false,
            hasDependencies: false,
            gitActivity: 0.5
        };
    }
}