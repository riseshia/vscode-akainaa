// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

type DecorationTemplate = {
    decorationType: vscode.TextEditorDecorationType,
    decoration: { range: vscode.Range }[],
};

type ExecutedCount = number;
type CoverageData = { lines: (ExecutedCount | null)[] };
type CoverageResult = { [filePath: string]: CoverageData };

const decorationTypes: vscode.TextEditorDecorationType[] = [1, 2, 3, 4, 5, 6, 7, 8].map(i => (
    vscode.window.createTextEditorDecorationType({
        backgroundColor: `rgba(255, 0, 0, ${i * 0.1})`,
        isWholeLine: true
    })
));

const snapshotMaxSize = 20;
const coverageSnapshots: CoverageResult[] = [];

const lowerMaxExecuted = 5;
const coverageFilePathFromPrj = 'tmp/coverage.json';

function loadCoverageFile(): CoverageResult | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {return null;}
    
    const prjDir = workspaceFolders[0].uri.fsPath + '/';

    const coverageFilePath = path.join(workspaceFolders[0].uri.fsPath, coverageFilePathFromPrj);
    if (!fs.existsSync(coverageFilePath)) {return null;}

    const coverageResult: CoverageResult = JSON.parse(fs.readFileSync(coverageFilePath, 'utf8'));

    const newCoverageResult: CoverageResult = {};
    for (const filePath in coverageResult) {
        const newFilePath = filePath.startsWith('/') ? filePath : prjDir + filePath;
        newCoverageResult[newFilePath] = coverageResult[filePath];
    }

    return newCoverageResult;
}

function updateSnapshots() {
    const coverageResult = loadCoverageFile();
    if (!coverageResult) {return;}

    coverageSnapshots.push(coverageResult);
    if (coverageSnapshots.length > snapshotMaxSize) {
        coverageSnapshots.shift();
    }
}

function resetSnapshots() {
    coverageSnapshots.splice(0, coverageSnapshots.length);
}

function getCoverageData(): CoverageResult | null {
    if (coverageSnapshots.length === 0) {return null;}

    const result: CoverageResult = {};

    for (let i = coverageSnapshots.length - 1; i >= 0; i--) {
        const snapshot = coverageSnapshots[i];

        for (const filePath in snapshot) {
            if (!result[filePath]) {
                result[filePath] = structuredClone(snapshot[filePath]);
            } else {
                const coverageData = snapshot[filePath];

                // if size is different, consider file is changed and ignore this coverage data
                if (coverageData.lines.length !== result[filePath].lines.length) {
                    // do nothing
                } else {
                    const lines = snapshot[filePath].lines;
                    const mergedLines = result[filePath].lines;

                    const lineLen = lines.length;
                    for (let i = 0; i < lineLen; i++) {
                        if (lines[i] === null || mergedLines[i] === null) {
                            mergedLines[i] = lines[i];
                        } else {
                            mergedLines[i]! += lines[i]!;
                        }
                    }
                }
            }
        }
    }
    return result;
}

function updateCoverage() {
    updateSnapshots();
    updateDecorations();
}

function updateDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const coverageData = getCoverageData();
    if (!coverageData) {return;}

    const filePath = editor.document.fileName;
    const fileCoverageData = coverageData[filePath];
    if (!fileCoverageData) {return;}
    
    const fileCoverage = fileCoverageData.lines;

    let decorations: DecorationTemplate[] = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({
        decorationType: decorationTypes[i],
        decoration: [],
    }));

    const maxExecuted = Math.max(...fileCoverage.filter(count => count !== null), lowerMaxExecuted) + 1;

    for (let lineNumber = 0; lineNumber < fileCoverage.length; lineNumber++) {
        const count = fileCoverage[lineNumber];
        if (!count) {continue;}
        if (count === 0) {continue;}

        const opacityLevel = Math.floor(count * 8 / maxExecuted);

        const line = editor.document.lineAt(lineNumber);

        const decoration = { range: line.range };
        decorations[opacityLevel].decoration.push(decoration);
    }

    decorations.forEach(({ decorationType, decoration }) => {
        editor.setDecorations(decorationType, decoration);
    });
}

function watchCoverageFile(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {return null;}
    const coverageFilePath = workspaceFolders[0].uri.fsPath + '/tmp/coverage.json';
    const coverageWatcher = vscode.workspace.createFileSystemWatcher(coverageFilePath);
    

    coverageWatcher.onDidChange(() => updateCoverage());
    coverageWatcher.onDidCreate(() => updateCoverage());
    coverageWatcher.onDidDelete(() => updateCoverage());

    context.subscriptions.push(coverageWatcher);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('akainaa is now active!');

	const disposable = vscode.commands.registerCommand('akainaa.resetCoverage', () => {
        resetSnapshots();
        updateDecorations();
	});

	context.subscriptions.push(disposable);

    vscode.window.onDidChangeActiveTextEditor(updateDecorations, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(updateDecorations, null, context.subscriptions);

    updateSnapshots();
    if (vscode.window.activeTextEditor) {
        updateDecorations();
    }
	watchCoverageFile(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
