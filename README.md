# 🎯 AI Code Quality Predictor

**AI-Powered Code Quality Analysis and Bug Prediction**

Never ship buggy code again! This VS Code extension uses machine learning to predict code quality issues, detect potential bugs, and provide intelligent recommendations for improving your codebase.

## 🎯 Core Features

### 🔮 **Smart Quality Analysis**
- **Real-time Quality Scoring**: Analyzes code patterns and assigns quality scores (0-100)
- **Bug Risk Assessment**: Predicts the likelihood of bugs in your code
- **Security Vulnerability Detection**: Identifies potential security issues
- **Performance Issue Prediction**: Spots code that might impact performance

### 📊 **Advanced Analytics**
- **Complexity Analysis**: Tracks cyclomatic and cognitive complexity
- **Code Pattern Recognition**: Identifies problematic patterns and anti-patterns
- **Technical Debt Tracking**: Monitors accumulation of technical debt
- **Maintainability Scoring**: Predicts how difficult code will be to maintain

### 🚨 **Intelligent Alerts**
- **Predictive Warnings**: Get notified before quality issues become problems
- **Priority-based Issues**: High, medium, and low priority issue classification
- **Smart Thresholds**: Dynamic alerts based on your coding patterns
- **Real-time Feedback**: Instant quality feedback as you code

### 📈 **Local-Only Operation**
- **No API Required**: Works entirely offline with local analysis
- **Privacy First**: All analysis stays on your machine
- **Fast Performance**: Instant analysis without network calls
- **Secure**: No code sent to external servers

## 🚀 Quick Start

### Installation

#### For VS Code:
```bash
# Install from VSIX
code --install-extension code-quality-predictor-2.0.0.vsix
```

#### For Windsurf IDE:
```bash
# Uninstall previous version if it exists
windsurf --uninstall-extension FinsavvyAI.code-quality-predictor

# Install from VSIX
windsurf --install-extension code-quality-predictor-2.0.0.vsix
```

**Note**: If you get a "command already exists" error, restart your IDE after uninstalling the previous version.

### Initial Setup
1. **Open a File**: Open any code file to begin analysis
2. **Enable Auto-Analysis**: Extension automatically analyzes your code
3. **View Quality Score**: Check the status bar for your quality score

## 📋 Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Code Quality: Analyze Current File` | Analyze the currently open file | `Ctrl+Shift+P` |
| `Code Quality: Scan Entire Project` | Analyze all files in the project | |
| `Code Quality: Predict Issues` | Show detailed predictions and analysis | |
| `Code Quality: Analyze Code Patterns` | Analyze recurring code patterns | |
| `Code Quality: Track Code Complexity` | Monitor complexity metrics | |
| `Code Quality: Export Quality Report` | Generate detailed quality report | |
| `Code Quality: Show Quality History` | View quality trends over time | |

## 🧪 Analysis Models

### Quality Scoring
```typescript
// The extension analyzes multiple factors:
- Code complexity (cyclomatic & cognitive)
- Function length and structure
- Code duplication patterns
- Security vulnerability patterns
- Performance anti-patterns
- Maintainability indicators
```

### AI-Based Predictions
- **Bug Risk Prediction**: Machine learning models predict bug likelihood
- **Complexity Analysis**: Identifies overly complex code structures
- **Pattern Recognition**: Detects code smells and anti-patterns
- **Security Analysis**: Identifies potential security vulnerabilities

## 📊 Status Bar Indicators

```
[🟢 85/100 Quality] [🟢 15% Risk]
     ↑                    ↑
Quality Score        Bug Risk Level
```

### Color Coding
- 🟢 **Green**: High quality (75+ score), Low risk (<30%)
- 🟡 **Yellow**: Medium quality (50-74 score), Medium risk (30-60%)
- 🔴 **Red**: Poor quality (<50 score), High risk (>60%)

## ⚙️ Configuration

```json
{
  "codeQuality.qualityThreshold": 75,
  "codeQuality.notifyOnLowQuality": true,
  "codeQuality.bugRiskThreshold": 30,
  "codeQuality.autoAnalyzeOnSave": true,
  "codeQuality.analysisDepth": "thorough",
  "codeQuality.enableSecurityAnalysis": true,
  "codeQuality.enablePerformanceAnalysis": true,
  "codeQuality.debugMode": false
}
```

## 🎛️ Advanced Features

### Project Analysis
The extension automatically analyzes your project to assess overall quality:

- **Codebase Health**: Overall project quality assessment
- **Hotspot Detection**: Identifies files most likely to have bugs
- **Dependency Analysis**: Analyzes code coupling and dependencies
- **Test Coverage Suggestions**: Recommends areas needing more tests

### Smart Issue Detection
Automatically detects various types of issues:

```typescript
// Patterns that trigger quality warnings:
- High cyclomatic complexity (>10)
- Long functions (>50 lines)
- Deep nesting levels (>4)
- Code duplication
- Security vulnerabilities
- Performance bottlenecks
```

### Quality Improvement Tips
AI-powered suggestions to improve code quality:

- **Refactoring Recommendations**: Specific suggestions for code improvements
- **Pattern Improvements**: Better ways to implement common patterns
- **Security Hardening**: Security best practices
- **Performance Optimization**: Performance improvement suggestions

## 📈 Analytics Dashboard

Access detailed analytics through the sidebar panel:

### Quality Tab
- Current file quality score
- Bug risk assessment
- Issue breakdown by category
- Improvement recommendations

### Predictions Tab
- AI-generated quality forecasts
- Bug likelihood predictions
- Maintenance difficulty estimates
- Security risk assessments

### History Tab
- Quality trends over time
- Historical analysis data
- Pattern evolution
- Improvement tracking

## 🔧 Development & Testing

### Local Development
```bash
# Clone the repository
git clone https://github.com/FinsavvyAI/code-quality-predictor

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run in development mode
npm run watch

# Run tests
npm test

# Package extension
npm run package
```

### Testing the Analysis
```bash
# Generate test data for ML model training
Command Palette → "Code Quality: Generate Test Data"

# Enable debug mode for detailed logging
Settings → codeQuality.debugMode: true

# View analysis accuracy metrics
Command Palette → "Code Quality: Show Debug Info"
```

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the Repository**: Create your own fork of the project
2. **Create a Feature Branch**: `git checkout -b feature/analysis-improvements`
3. **Make Changes**: Add new analysis models or features
4. **Test Thoroughly**: Ensure all existing functionality works
5. **Submit PR**: Create a pull request with detailed description

### Areas for Contribution
- **New Analysis Models**: Improve accuracy with better algorithms
- **Language Support**: Add support for more programming languages
- **Performance Optimization**: Make analysis faster
- **UI/UX Improvements**: Enhance the user interface

## 📚 Technical Architecture

### Core Components
```
src/
├── prediction/          # AI analysis engine
│   ├── models/         # Quality prediction models
│   ├── training/       # Model training logic
│   └── inference/      # Real-time analysis
├── tracking/           # Quality tracking system
├── ui/                 # VS Code UI components
├── storage/            # Local data persistence
└── analytics/          # Analysis and reporting
```

### Data Flow
1. **Code Analysis**: Extension monitors code changes
2. **Quality Assessment**: AI models analyze code patterns
3. **Prediction Generation**: Real-time quality predictions
4. **Issue Detection**: Identifies potential problems
5. **User Alerts**: Intelligent notifications and recommendations

## 🛡️ Privacy & Security

- **Local-Only Processing**: All analysis remains on your machine
- **No External APIs**: No code sent to servers
- **Encrypted Storage**: Local data is encrypted at rest
- **Open Source**: Full transparency of analysis methods

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/FinsavvyAI/code-quality-predictor/issues)
- **Discussions**: [GitHub Discussions](https://github.com/FinsavvyAI/code-quality-predictor/discussions)
- **Email**: support@finsavvy.ai

---

**Made with ❤️ by FinsavvyAI** | **Powered by AI Analysis** | **Privacy-First Design**