'use strict';
import * as vscode from 'vscode';
import {Translate} from './translate';

export function activate(context: vscode.ExtensionContext) {
    let out:vscode.OutputChannel;
    let disposable = vscode.commands.registerCommand('extension.translate', () => {
        if(!out) {
            out = vscode.window.createOutputChannel("翻译");
            out.show();
        }
        new Translate(out).translate();
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
}