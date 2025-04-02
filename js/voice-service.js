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
        this.isMobile = false;
        this.isIOS = false;
        this.initSpeechRecognition();
    }

    // 初始化语音识别
    initSpeechRecognition() {
        // 检测设备类型
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        
        // 检查浏览器支持
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            this.recognition = new SpeechRecognition();
        } else {
            console.error('浏览器不支持语音识别');
            return;
        }

        // 设置识别参数
        this.recognition.continuous = !this.isMobile; // 移动端不使用持续模式，避免资源占用
        this.recognition.interimResults = true;
        this.recognition.lang = 'zh-CN';
        this.recognition.maxAlternatives = 1;

        // 移动端特殊处理
        if (this.isMobile) {
            // iOS设备需要较短的识别时间
            this.recognition.onnomatch = () => {
                console.log('未匹配到语音');
                if (this.onEndCallback) {
                    this.onEndCallback('');
                }
            };
        }

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
            
            // 处理特定错误
            if (event.error === 'not-allowed') {
                alert('请允许网站访问麦克风以启用语音功能');
            } else if (event.error === 'no-speech') {
                console.log('未检测到语音');
            }
            
            this.isListening = false;
            
            // 在错误情况下也调用结束回调
            if (this.onEndCallback) {
                this.onEndCallback('');
            }
        };
    }

    // 开始语音识别
    startListening(onResult, onEnd) {
        if (!this.recognition) {
            console.error('语音识别未初始化');
            if (onEnd) onEnd(''); // 确保回调被调用
            return;
        }

        this.onResultCallback = onResult;
        this.onEndCallback = onEnd;
        this.finalTranscript = '';
        this.transcript = '';
        
        try {
            // 移动设备特殊处理
            if (this.isMobile) {
                // 为移动设备设置较短的超时
                this.recognition.continuous = false;
                
                // iOS设备可能需要重新创建识别实例
                if (this.isIOS && this._needsRestart) {
                    this.recognition.stop();
                    this.initSpeechRecognition();
                    this._needsRestart = false;
                }
            }
            
            this.recognition.start();
            this.isListening = true;
            console.log('语音识别已启动');
            
            // 设置iOS设备的重启标志
            if (this.isIOS) {
                this._needsRestart = true;
            }
        } catch (e) {
            console.error('启动语音识别失败:', e);
            this.isListening = false;
            if (onEnd) onEnd(''); // 确保回调被调用
            
            // 尝试自动重启
            if (e.name === 'InvalidStateError') {
                console.log('Recognition already started, attempting to restart...');
                setTimeout(() => {
                    this.recognition.stop();
                    setTimeout(() => this.startListening(onResult, onEnd), 200);
                }, 200);
            }
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
            if (onEnd) onEnd();  // 确保回调被调用，即使没有语音功能
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
        
        // 移动设备上的语音合成处理
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        // 确保语音合成服务已准备好
        if (this.synth.speaking) {
            this.synth.cancel();  // 确保先取消所有语音
            
            // 在移动设备上增加延迟时间
            setTimeout(() => {
                this.synth.speak(utterance);
                
                // 移动设备上的额外处理
                if (isMobile) {
                    // 在iOS上触发用户交互后立即播放一次
                    this._forceAudioContext();
                }
            }, isMobile ? 150 : 50);  // 移动设备上使用更长的延迟
        } else {
            this.synth.speak(utterance);
            
            // 移动设备上的额外处理
            if (isMobile) {
                // 在iOS上触发用户交互后立即播放一次
                this._forceAudioContext();
            }
        }
    }
    
    // 停止语音合成
    stopSpeaking() {
        if (this.synth) {
            this.synth.cancel();
            this.currentUtterance = null;
        }
    }
    
    // 强制激活移动设备的音频上下文（尤其是iOS设备）
    _forceAudioContext() {
        try {
            // 创建一个短暂的音频上下文来解锁音频
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const audioCtx = new AudioContext();
                const oscillator = audioCtx.createOscillator();
                oscillator.frequency.value = 0; // 0频率无声音
                oscillator.connect(audioCtx.destination);
                oscillator.start(0);
                oscillator.stop(0.001); // 立即停止
            }
        } catch (e) {
            console.warn('无法初始化音频上下文:', e);
        }
    }
} 