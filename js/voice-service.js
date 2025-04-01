// 语音服务类
class VoiceService {
    constructor() {
        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.isListening = false;
        this.transcript = '';
        this.finalTranscript = '';
        this.onResultCallback = null;
        this.onEndCallback = null;
        this.currentUtterance = null; // 跟踪当前语音
        this.initSpeechRecognition();
    }

    // 初始化语音识别
    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            this.recognition = new SpeechRecognition();
        } else {
            console.error('浏览器不支持语音识别');
            return;
        }

        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'zh-CN';

        this.recognition.onresult = (event) => {
            let interim = '';
            
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    this.finalTranscript += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            
            this.transcript = this.finalTranscript + interim;
            
            if (this.onResultCallback) {
                this.onResultCallback(this.transcript, !!interim);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onEndCallback) {
                this.onEndCallback(this.finalTranscript);
            }
            this.finalTranscript = '';
            this.transcript = '';
        };

        this.recognition.onerror = (event) => {
            console.error('语音识别错误:', event.error);
            this.isListening = false;
        };
    }

    // 开始语音识别
    startListening(onResult, onEnd) {
        if (!this.recognition) {
            console.error('语音识别未初始化');
            return;
        }

        this.onResultCallback = onResult;
        this.onEndCallback = onEnd;
        this.finalTranscript = '';
        this.transcript = '';
        this.isListening = true;
        
        try {
            this.recognition.start();
        } catch (e) {
            console.error('启动语音识别失败:', e);
            this.isListening = false;
        }
    }

    // 停止语音识别
    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    }

    // 文字转语音
    speak(text, onEnd = null) {
        if (!this.synth) {
            console.error('浏览器不支持语音合成');
            return;
        }
        
        // 取消之前的语音
        this.stopSpeaking();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.95;     // 略微降低语速以提高清晰度
        utterance.pitch = 1.0;
        utterance.volume = 1.0;    // 确保音量足够
        
        // 添加错误处理
        utterance.onerror = (event) => {
            console.error('语音合成错误:', event);
            if (onEnd) {
                onEnd();  // 出错时也调用回调，确保UI状态正确
            }
        };
        
        // 添加结束回调
        if (onEnd) {
            utterance.onend = onEnd;
        }
        
        // 存储当前utterance以便于取消
        this.currentUtterance = utterance;
        
        // 确保语音合成服务已准备好
        if (this.synth.speaking) {
            this.synth.cancel();  // 确保先取消所有语音
            setTimeout(() => {
                this.synth.speak(utterance);
            }, 50);  // 短暂延迟后再开始新的语音
        } else {
            this.synth.speak(utterance);
        }
    }
    
    // 停止语音合成
    stopSpeaking() {
        if (this.synth) {
            this.synth.cancel();
            this.currentUtterance = null;
        }
    }
} 