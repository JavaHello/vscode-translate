'use strict';

import * as http from 'http';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as querystring from 'querystring';

class TextFilter {

	public static  COMPILE:RegExp = /[A-Z]{1}[a-z]+/g;
	public static  COMPILE_CHAR:RegExp = /[-_\n\r\t*]/g;
	public static  COMPILE_SPAN:RegExp = /[\ ]+/g;
	
	public static filter(q:string):string {
		q = q.replace(TextFilter.COMPILE, (e) => {
            return ' ' + e;
        });
		q = q.replace(TextFilter.COMPILE_CHAR, ' ');
        q = q.replace(TextFilter.COMPILE_SPAN, ' ');
		return q;
	}
}

export class Translate {

    public static API_URL = 'http://openapi.youdao.com/api?';
    public static r1:string = "";
    out:vscode.OutputChannel;
    appKey:string = '';
    appSecret:string = '';

    constructor(out:vscode.OutputChannel) {
        this.out = out;
    }

    public static ErrorCode: { [key: string]: string } = {
        '101': '缺少必填的参数',
        '102': '不支持的语言类型',
        '103': '翻译文本过长',
        '104': '不支持的API类型',
        '105': '不支持的签名类型',
        '106': '不支持的响应类型',
        '107': '不支持的传输加密类型',
        '108': 'appKey无效',
        '109': 'batchLog格式不正确',
        '110': '无相关服务的有效实例',
        '111': '开发者账号无效',
        '113': 'q不能为空',
        '201': '解密失败，可能为DES,BASE64,URLDecode的错误',
        '202': '签名检验失败',
        '203': '访问IP地址不在可访问IP列表',
        '205': '请求的接口与应用的平台类型不一致',
        '301': '辞典查询失败',
        '302': '翻译查询失败',
        '303': '服务端的其它异常',
        '401': '账户已经欠费',
        '411': '访问频率受限,请稍后访问',
        '412': '长请求过于频繁，请稍后访问',
    };

    public static Lang: { [key: string]: string } = {
        'zh-CHS': '中文',
        'ja': '日文',
        'EN': '英文',
        'ko': '韩文',
        'fr': '法文',
        'ru': '俄文',
        'pt': '葡萄牙文',
        'es': '西班牙文',
        'vi': '越南文',
    };



    public static ReqData = {
        'q': 'Hello World!',
        'from': Translate.Lang.EN,
        'to': Translate.Lang["zh-CHS"],
        'appKey': '',
        'salt': '',
        'sign': '',
    };

    md5(content: string): string {
        let md5 = crypto.createHash('md5');
        md5.update(content);
        let req = md5.digest('hex');
        return req;
    }
    sign(a: { [key: string]: string }, s: string) {
        let signStr = a.appKey + a.q + a.salt + s;
        a.sign = this.md5(signStr).toUpperCase();
    }


    guid(): string {
        let a = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            let r = Math.random() * 16 | 0;
            let v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        return a;
    }

    fy(q: string) {
        Translate.ReqData.q = TextFilter.filter(q);
        Translate.ReqData.salt = this.guid();
        Translate.ReqData.appKey = this.appKey;
        this.sign(Translate.ReqData, this.appSecret);
        let reqUrl = Translate.API_URL + querystring.stringify(Translate.ReqData);
        //console.log(reqUrl)
        http.get(reqUrl, (res) => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'];

            let error;
            if (statusCode !== 200) {
                error = new Error('请求失败。\n' +
                    `状态码: ${statusCode}`);
            } else if (contentType === undefined || !/^application\/json/.test(contentType)) {
                error = new Error('无效的 content-type.\n' +
                    `期望 application/json 但获取的是 ${contentType}`);
            }
            if (error) {
                console.error(error.message);
                vscode.window.showInformationMessage(`错误: ${error.message}`);
                // 消耗响应数据以释放内存
                res.resume();
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData: {
                        errorCode: string,
                        errorMsg: string,
                        translation: string,
                        web: Array<any>,
                    } = JSON.parse(rawData);
                    if (parsedData.errorCode !== '0') {
                        let msg = Translate.ErrorCode[parsedData.errorCode];
                        parsedData.errorMsg = msg !== undefined ? msg : '';
                        vscode.window.showInformationMessage(parsedData.errorMsg);
                    } else {
                        let showMsg:string = '';
                        showMsg += '原    文: ' + Translate.ReqData.q;
                        showMsg += '\n翻译结果: ' + parsedData.translation;
                        showMsg += "\n词    义: ";
                        for (let v in parsedData.web) {
                            showMsg += "\n    " + parsedData.web[v].key + ": " + parsedData.web[v].value;
                        }
                        this.out.appendLine(showMsg);
                        
                        // vscode.window.showInformationMessage(showMsg)
                    }
                } catch (e) {
                    console.error(e.message);
                    vscode.window.showInformationMessage(e.message);
                }
            });
        }).on('error', (e) => {
            console.error(`错误: ${e.message}`);
            vscode.window.showInformationMessage(`错误: ${e.message}`);
        });
    }

    translate(): void {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        let settings = vscode.workspace.getConfiguration();
        //let settings = vscode.workspace.getConfiguration('cpplint');
        this.appSecret = settings.get('translate.youdao.appSecret', '');
        this.appKey = settings.get('translate.youdao.appKey', '');
        if(this.appSecret && this.appKey) {
            let selection = editor.selection;
            let content = editor.document.getText(selection);
            if(content) {
                this.fy(content);
            }
        } else {
            vscode.window.showErrorMessage("需要配置有道翻译 appKey 和 appSecret !");
        }
        
    }
}




