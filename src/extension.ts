import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerTextEditorCommand('uxn-exec.run', (editor) => {
			UxnPanel.createOrShow(context.extensionUri, editor.document);
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(UxnPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(state);
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				UxnPanel.revive(webviewPanel, context.extensionUri, state.documentUri);
			}
		});
	}
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')]
	};
}

class UxnPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: UxnPanel | undefined;

	public static readonly viewType = 'uxn';

	private readonly _document: vscode.TextDocument;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
		const column = 2;

		// If we already have a panel, show it.
		if (UxnPanel.currentPanel) {
			UxnPanel.currentPanel.dispose();
			UxnPanel.currentPanel = undefined;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			UxnPanel.viewType,
			`uxn - ${document.uri.path}`,
			column || vscode.ViewColumn.One,
			getWebviewOptions(extensionUri),
		);

		UxnPanel.currentPanel = new UxnPanel(panel, extensionUri, document);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, documentUri: vscode.Uri) {
		const document = vscode.workspace.textDocuments.find((d) => d.uri.path === documentUri.path);
		if(!document) {
			setTimeout(() => {
				UxnPanel.currentPanel?.dispose();
			}, 200)
			return;
		}
		UxnPanel.currentPanel = new UxnPanel(panel, extensionUri, document);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
		this._panel = panel;
		this._document = document;
		this._extensionUri = extensionUri;

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);


		let timer: NodeJS.Timeout | undefined;
		vscode.workspace.onDidChangeTextDocument((e) => {
			if(e.document.uri.path !== this._document.uri.path) {
				return;
			}
			if(timer) {
				clearTimeout(timer);
				timer = undefined;
			};
			timer = setTimeout(() => { this._update(); timer = undefined; }, 3000);
		});

		this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
		this._panel.webview.postMessage({ command: 'init', code: this._document.getText(), documentUri: this._document.uri });
	}

	private _update() {
		this.run(this._document.getText());
	}

	public run(code: string) {
		this._panel.webview.postMessage({ command: 'run', code });
	}

	public dispose() {
		UxnPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
		);

		const nonce = getNonce();
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src *; style-src 'unsafe-inline'  ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>UXN</title>
				<style>
					body { 
						font-family:monospace; overflow:hidden; height:100vh; padding:15px; margin:0; 
						display: flex; 
						align-items: start; 
						justify-content: center; 
						flex-wrap: wrap;
						gap: 8px;
					}
					div#term { width:100%; background:#000; padding:10px; color:white; height:55px; overflow:scroll; white-space:pre; display:none }
					div#stack { width:100%; height:25px; background:#72dec2; padding:10px; margin-bottom:20px;font-weight:bold; display:none }
					#screen { 
						image-rendering: pixelated; image-rendering: crisp-edges; cursor: none; touch-action: none; margin-bottom: 15px;
						flex-grow: 1;
						flex-shrink: 0;
						max-width: max-content;
						max-height: max-content;
					}
					#screen #bgcanvas { position: relative; display:block; left: 0; top: 0; z-index: 0; border: 2px solid #000 }
					#screen #fgcanvas { position: absolute; left: 2px; top: 2px; z-index: 1 }

					#console {
						flex-grow: 1;

						display: flex;
						align-items: start;
						gap: 8px;

						height: 100%;
					}

					#console>div {
						flex-grow: 1;
						padding: 4px;
						height: 100%;
					}

					#console>div>span {
						font-weight: bold;    
						color: var(--vscode-breadcrumb-foreground);
					}

					#console #console_std {
					}

					#console_err { 
						color: var(--vscode-errorForeground);
					}

					#console input {
						color: var(--vscode-input-foreground);
						border: 1px solid var(--vscode-input-border);
						background-color: var(--vscode-input-background);
					}
				</style>
			</head>
			<body>
				<div id="screen" style="position: relative;">
					<canvas id="bgcanvas" width="100" height="100"></canvas>
					<canvas id="fgcanvas" width="100" height="100"></canvas>
				</div>
				<div id="console">
					<div>
						<span>standard output</span>
						<pre id='console_std'></pre>
						<input type="text" id="console_input" placeholder="Console">
					</div>
					<div>
						<span>error output</span>
						<pre id='console_err'></pre>
					</div>
				</div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}