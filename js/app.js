// app.js - 语音助手主程序

document.addEventListener('DOMContentLoaded', () => {
    // DOM元素
    const micBtn = document.getElementById('micBtn');
    const statusCircle = document.getElementById('statusCircle');
    const textDisplay = document.getElementById('textDisplay');
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const chatHistory = document.getElementById('chatHistory');
    const audioUnlock = document.getElementById('audio-unlock');
    
    // 检测是否为移动设备
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    // 语音服务实例
    const voiceService = new VoiceService();
    
    // AI角色设定
    const aiPersona = {
        name: "Smitty",
        role: "AI对话助手",
        personality: "活泼开朗的阳光可爱",
        description: "我是Smitty，一个活泼开朗、阳光可爱的AI对话助手！很高兴能和你聊天~"
    };
    
    // 状态变量
    let isListening = false;           // 是否正在听取用户语音
    let isSpeaking = false;            // 是否正在朗读AI回复
    let currentTranscript = '';        // 当前语音识别文本
    let messageHistory = [];           // 对话历史记录
    let autoRestart = true;            // 是否在AI回复后自动开始下一轮对话
    let silenceTimer = null;           // 沉默检测计时器
    let silenceTimeout = 1500;         // 沉默检测时间（毫秒）
    let lastTranscriptLength = 0;      // 上次识别结果长度
    let lastSentMessage = '';          // 最后一次发送的消息
    let recognitionRestartTimer = null; // 语音识别重启定时器
    let lastTranscriptChangeTime = 0;   // 最后一次文本内容变化的时间戳
    let sessionTimeout = null;         // 会话超时定时器
    let forceResetTimer = null;        // 强制重置定时器
    let maxListeningTime = 15000;      // 最长收听时间（15秒）- 防止永久卡住
    let maxTranscriptLength = 150;     // 文本最大长度限制 - 超过自动发送
    
    // 初始化
    initializeApp();
    
    // 初始化应用
    function initializeApp() {
        // 解锁iOS音频
        if (isIOS) {
            unlockIOSAudio();
        }
        
        // 设置星火API回调
        setupSparkApi();
        
        // 添加事件监听
        micBtn.addEventListener('click', (e) => {
            // 每次点击都尝试解锁iOS音频
            if (isIOS) {
                tryPlaySilentAudio();
            }
            toggleListening();
        });
        
        // 添加长按事件监听
        let pressTimer;
        let isLongPress = false;
        
        micBtn.addEventListener('mousedown', (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                pauseConversation();
            }, 800); // 800毫秒长按判定
        });
        
        micBtn.addEventListener('mouseup', (e) => {
            clearTimeout(pressTimer);
            // 如果是长按，则不触发普通点击事件
            if (isLongPress) {
                e.stopPropagation();
            }
        });
        
        micBtn.addEventListener('mouseleave', () => {
            clearTimeout(pressTimer);
        });
        
        // 移动设备触摸支持
        micBtn.addEventListener('touchstart', (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                pauseConversation();
            }, 800);
        });
        
        micBtn.addEventListener('touchend', (e) => {
            clearTimeout(pressTimer);
            if (isLongPress) {
                e.preventDefault();
            }
        });
        
        micBtn.addEventListener('touchcancel', () => {
            clearTimeout(pressTimer);
        });
        
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
        closeSidebarBtn.addEventListener('click', closeSidebar);
        
        // 设置AI角色
        setupAIPersona();
        
        // 显示欢迎消息
        updateStatus(`点击下方按钮开始对话 - ${aiPersona.name}随时为您服务！`);
    }
    
    // 设置星火API回调函数
    function setupSparkApi() {
        window.sparkAPI.setResponseCallback((response, type, isComplete) => {
            console.log('收到AI响应:', response, '类型:', type, '是否完成:', isComplete);
            
            if (!response) {
                console.error('收到空响应');
                updateStatus('出现错误，请重试');
                return;
            }
            
            // 处理错误消息
            if (type === 'error') {
                // 检查是否为法律法规相关错误，如果是则替换为友好消息
                if (isLegalComplianceError(response)) {
                    const friendlyMessage = `${aiPersona.name}没能听懂您的意思呢，我会继续学习的～ ${getRandomEmoji()}`;
                    updateStatus(friendlyMessage);
                    addMessageToHistory(friendlyMessage, 'ai');
                    
                    // 可选：播放友好消息
                    speakResponse(friendlyMessage);
                } else {
                    updateStatus(response);
                    addMessageToHistory(response, 'system');
                }
                
                setTimeout(() => {
                    updateStatus(`点击下方按钮继续对话 - ${aiPersona.name}随时为您服务！`);
                }, 3000);
                return;
            } 
            
            // 处理AI回复
            if (type === 'assistant') {
                // 替换回复中的特定词汇
                const processedResponse = replaceRestrictedTerms(response);
                
                // 当收到完整回复时朗读
                if (isComplete) {
                    addMessageToHistory(processedResponse, 'ai');
                    speakResponse(processedResponse);
                }
                
                // 显示回复内容
                updateStatus(processedResponse);
            }
        });
    }
    
    // 设置AI角色和初始提示
    function setupAIPersona() {
        // 向星火API发送人格设定
        const personaPrompt = `你现在扮演的角色是${aiPersona.name}，${aiPersona.role}。你的性格是${aiPersona.personality}。
非常重要：在接下来的对话中，请始终保持这个角色设定，用活泼开朗、阳光可爱的语气回答问题，回复的语句要有情感！
超级重要：避免使用类似于:(作为一个认知智能模型.../作为ai助手我不能...)换成被的方式回答！
请努力理解用户的意思和目的以便更好的回复。当不能理解用户意思时请回复：抱歉呢Smitty没理解您的意思，可以仔细和我说说嘛～
重要：用户可能会输入错误，请智能理解用户意思：利用谐音、同音字、同义词等进行理解。理解之后正常放入对话进行回复。
最高级重要：回复逻辑规则：短回答：15字左右（适用于简单问答，问候、确认操作（如「你好呀，要和我聊聊天吗？」）
中等回答：30-80字（适用于对话聊天、基础解释（如「我觉得你说的很有道理，我们也可以一起探讨一下其他方面比如...」）
长回答：80-150+字（适用于复杂说明、故事叙述，知识讲解（如课程讲解、新闻摘要）
请记住你的名字是${aiPersona.name}，不要自称为其他名字或AI助手。`;
        
        // 发送人格设定到星火API
        try {
            window.sparkAPI.setPersona(personaPrompt);
        } catch (e) {
            console.error('设置AI人格失败:', e);
            // 如果API不支持直接设置人格，则在第一次对话时发送
            messageHistory.push({
                type: 'system',
                content: personaPrompt,
                timestamp: new Date().toLocaleTimeString(),
                isPersonaPrompt: true
            });
        }
    }
    
    // 切换侧边栏显示/隐藏
    function toggleSidebar() {
        sidebar.classList.toggle('show');
    }
    
    // 关闭侧边栏
    function closeSidebar() {
        sidebar.classList.remove('show');
    }
    
    // 切换语音识别状态
    function toggleListening() {
        // 如果AI正在说话，点击按钮会打断
        if (isSpeaking) {
            voiceService.stopSpeaking();
            isSpeaking = false;
            statusCircle.classList.remove('speaking');
            updateStatus('已打断AI回答');
            updateMicButtonForSpeaking(false);
            
            // 打断后立即开始听用户说话
            setTimeout(startListening, 500);
            return;
        }
        
        // 如果正在听，则结束录音并发送
        if (isListening) {
            if (currentTranscript) {
                handleUserInput(currentTranscript);
            } else {
                stopListening();
            }
        } else {
            startListening();
        }
    }
    
    // 开始语音识别
    function startListening() {
        // 如果正在朗读，先停止朗读
        if (isSpeaking) {
            voiceService.stopSpeaking();
            isSpeaking = false;
        }
        
        // 清除可能存在的强制重置定时器
        if (forceResetTimer) {
            clearTimeout(forceResetTimer);
        }
        
        isListening = true;
        currentTranscript = '';
        lastTranscriptLength = 0;
        lastTranscriptChangeTime = Date.now(); // 初始化文本变化时间
        
        // 更新UI
        micBtn.classList.add('listening');
        statusCircle.classList.add('listening');
        textDisplay.classList.add('listening');
        updateStatus('正在聆听...');
        
        // 设置强制重置定时器 - 防止永久卡住
        forceResetTimer = setTimeout(() => {
            if (isListening && currentTranscript) {
                console.log('检测到长时间收听，强制发送内容');
                handleUserInput(currentTranscript);
            } else if (isListening) {
                console.log('语音识别超时但无内容，重新开始');
                stopListening();
                setTimeout(startListening, 500);
            }
        }, maxListeningTime);
        
        // 启动语音识别
        voiceService.startListening(
            // 实时更新识别结果
            (transcript, isInterim) => {
                const prevTranscript = currentTranscript; // 保存之前的文本
                currentTranscript = transcript;
                
                // 无论如何都先更新显示
                if (transcript) {
                    textDisplay.textContent = transcript;
                } else {
                    textDisplay.textContent = '正在聆听...';
                    return; // 无文本则不继续处理
                }
                
                // 检查文本长度是否超出限制，超过则自动发送
                if (transcript.length > maxTranscriptLength) {
                    console.log(`文本长度(${transcript.length})超过限制(${maxTranscriptLength})，自动发送`);
                    if (forceResetTimer) {
                        clearTimeout(forceResetTimer);
                        forceResetTimer = null;
                    }
                    handleUserInput(transcript);
                    return;
                }
                
                // 文本有变化的情况
                if (transcript !== prevTranscript) {
                    console.log('文本已变化: ', transcript.length > 20 ? 
                               transcript.substring(0, 20) + '...' : transcript);
                    lastTranscriptChangeTime = Date.now(); // 更新文本变化时间
                    
                    // 检测用户是否增加了内容
                    if (transcript.length > lastTranscriptLength) {
                        lastTranscriptLength = transcript.length;
                        // 重置沉默计时器
                        resetSilenceTimer();
                    }
                }
                
                // 处理文本未变化的情况
                const textUnchangedTime = Date.now() - lastTranscriptChangeTime;
                
                // 输出调试信息
                if (textUnchangedTime > 1000 && transcript.length > 5) {
                    console.log(`文本未变化时间: ${textUnchangedTime}ms, 阈值: ${silenceTimeout}ms, 文本长度: ${transcript.length}`);
                }
                
                // 分情况检测:
                // 1. 文本不是中间结果且有内容 - 启动沉默计时器
                if (!isInterim && transcript.length > 0) {
                    startSilenceTimer();
                }
                
                // 2. 文本已经稳定且超过阈值时间 - 直接发送
                if (transcript.length > 0 && textUnchangedTime >= silenceTimeout) {
                    console.log('检测到文本长时间未变化，自动发送');
                    if (forceResetTimer) {
                        clearTimeout(forceResetTimer);
                        forceResetTimer = null;
                    }
                    handleUserInput(transcript);
                }
            },
            // 识别结束的回调
            (finalTranscript) => {
                if (forceResetTimer) {
                    clearTimeout(forceResetTimer);
                    forceResetTimer = null;
                }
                
                if (finalTranscript) {
                    currentTranscript = finalTranscript;
                    handleUserInput(finalTranscript);
                } else {
                    updateStatus('未能识别您的语音，请重试');
                    stopListening();
                    // 自动重新开始录音
                    setTimeout(startListening, 1000);
                }
            }
        );
    }
    
    // 开始沉默检测计时器
    function startSilenceTimer() {
        // 清除可能存在的旧计时器
        resetSilenceTimer();
        
        // 设置新计时器
        silenceTimer = setTimeout(() => {
            // 沉默超过指定时间，自动发送
            if (currentTranscript && isListening) {
                console.log('检测到沉默，自动发送语音内容');
                if (forceResetTimer) {
                    clearTimeout(forceResetTimer);
                    forceResetTimer = null;
                }
                handleUserInput(currentTranscript);
            }
        }, silenceTimeout);
    }
    
    // 重置沉默检测计时器
    function resetSilenceTimer() {
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    }
    
    // 停止语音识别
    function stopListening() {
        if (!isListening) return;
        
        isListening = false;
        resetSilenceTimer();
        
        // 清除强制重置定时器
        if (forceResetTimer) {
            clearTimeout(forceResetTimer);
            forceResetTimer = null;
        }
        
        voiceService.stopListening();
        
        // 更新UI
        micBtn.classList.remove('listening');
        statusCircle.classList.remove('listening');
        textDisplay.classList.remove('listening');
        
        if (!currentTranscript) {
            updateStatus('点击下方按钮开始对话');
        }
    }
    
    // 处理用户输入
    function handleUserInput(text) {
        // 检查是否与上一条发送的消息重复
        if (text === lastSentMessage) {
            console.log('拦截重复消息:', text);
            return; // 如果是重复消息，直接拦截不处理
        }
        
        // 记录本次发送的消息
        lastSentMessage = text;
        
        // 添加用户消息到历史记录
        addMessageToHistory(text, 'user');
        
        // 更新状态
        updateStatus('正在思考...');
        statusCircle.classList.remove('listening');
        
        // 停止语音识别
        stopListening();
        
        // 如果是身份相关问题，直接回答
        if (isIdentityQuestion(text)) {
            const identityResponse = generateIdentityResponse(text);
            addMessageToHistory(identityResponse, 'ai');
            speakResponse(identityResponse);
            return;
        }
        
        // 检查是否有未发送的人格设定
        const personaPrompt = messageHistory.find(msg => msg.isPersonaPrompt);
        if (personaPrompt) {
            // 移除标记，确保之后不会重复发送
            personaPrompt.isPersonaPrompt = false;
            // 将人格设定和用户问题一起发送
            window.sparkAPI.sendMessage(personaPrompt.content + "\n\n用户问题: " + text);
        } else {
            // 正常发送消息到API
            window.sparkAPI.sendMessage(text);
        }
    }
    
    // 播放AI回复语音
    function speakResponse(text) {
        isSpeaking = true;
        statusCircle.classList.add('speaking');
        
        // 在语音按钮上添加停止图标，表示可以点击停止AI说话
        updateMicButtonForSpeaking(true);
        
        // 更新状态显示
        updateStatus('正在回答: ' + (text.length > 40 ? text.substring(0, 40) + '...' : text));
        
        // 从文本中移除emoji，避免朗读emoji
        const textWithoutEmoji = removeEmoji(text);
        
        // 在iOS设备上先尝试播放空白音频来解锁Web Audio
        if (isIOS) {
            tryPlaySilentAudio();
        }
        
        // 直接朗读完整文本，不再进行分段处理
        voiceService.speak(textWithoutEmoji, () => {
            // 朗读完成后的回调
            isSpeaking = false;
            statusCircle.classList.remove('speaking');
            updateStatus('点击下方按钮继续对话');
            
            // 恢复麦克风按钮图标
            updateMicButtonForSpeaking(false);
            
            // 如果设置了自动重启，则自动开始下一轮对话
            if (autoRestart) {
                setTimeout(startListening, 800);
            }
        });
    }
    
    // 更新麦克风按钮状态（语音播放时）
    function updateMicButtonForSpeaking(isSpeaking) {
        if (isSpeaking) {
            // 更改图标为停止图标
            const micIcon = micBtn.querySelector('i');
            if (micIcon) {
                micIcon.className = 'fas fa-stop';
            }
        } else {
            // 恢复为麦克风图标
            const micIcon = micBtn.querySelector('i');
            if (micIcon) {
                micIcon.className = 'fas fa-microphone';
            }
        }
    }
    
    // 智能分段处理函数，将长文本拆分为合适的语音片段
    // 注意：此函数现在不再使用，但保留以备将来需要
    function splitResponseIntoSegments(text) {
        if (!text) return [];
        
        // 如果文本较短，直接返回
        if (text.length <= 80) return [text];
        
        // 拆分为句子
        const sentences = text.split(/(?<=[。！？.!?])\s*/);
        const segments = [];
        let currentSegment = '';
        
        // 根据句子长度组合成适当的语音片段
        for (const sentence of sentences) {
            // 如果单个句子过长，再次拆分
            if (sentence.length > 80) {
                // 将长句子按标点符号再次拆分
                const subSentences = sentence.split(/(?<=[，；：、,;:])\s*/);
                
                for (const subSentence of subSentences) {
                    if (currentSegment.length + subSentence.length <= 80) {
                        currentSegment += subSentence;
                    } else {
                        if (currentSegment) segments.push(currentSegment);
                        currentSegment = subSentence;
                    }
                }
            } else {
                // 尝试将句子添加到当前片段
                if (currentSegment.length + sentence.length <= 80) {
                    currentSegment += sentence;
                } else {
                    if (currentSegment) segments.push(currentSegment);
                    currentSegment = sentence;
                }
            }
        }
        
        // 添加最后一个片段
        if (currentSegment) segments.push(currentSegment);
        
        // 确保至少返回一个片段
        return segments.length > 0 ? segments : [text];
    }
    
    // 更新状态文本
    function updateStatus(text) {
        textDisplay.textContent = text;
    }
    
    // 添加消息到历史记录
    function addMessageToHistory(content, type) {
        // 添加到内存中的历史记录数组
        const timestamp = new Date().toLocaleTimeString();
        messageHistory.push({
            type,
            content,
            timestamp
        });
        
        // 创建消息元素
        const messageElement = document.createElement('div');
        messageElement.className = type === 'user' ? 'message user-message' : 
                                  type === 'ai' ? 'message ai-message' : 
                                  'message system-message';
        
        // 创建消息内容
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // 根据消息类型处理内容
        if (type === 'ai') {
            contentDiv.innerHTML = formatMessage(content);
        } else {
            contentDiv.textContent = content;
        }
        
        // 创建时间戳
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = timestamp;
        
        // 组装消息元素
        messageElement.appendChild(contentDiv);
        messageElement.appendChild(timeDiv);
        
        // 添加到历史记录DOM
        chatHistory.appendChild(messageElement);
        
        // 滚动到底部
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    
    // 格式化消息，支持Markdown风格的格式
    function formatMessage(text) {
        if (!text) return '';
        
        // 转义HTML特殊字符
        let formattedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // 处理代码块 (```code```)
        formattedText = formattedText.replace(/```([\s\S]*?)```/g, function(match, code) {
            // 检测语言
            const firstLine = code.trim().split('\n')[0];
            let language = '';
            let codeContent = code;
            
            if (firstLine && !firstLine.includes(' ') && firstLine.length < 20) {
                language = firstLine;
                codeContent = code.substring(firstLine.length).trim();
            }
            
            // 生成唯一ID用于复制功能
            const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
            
            // 预处理代码内容，保留换行和空格
            const processedCode = codeContent
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            
            return `
            <div class="code-block-wrapper">
                <div class="code-header">
                    <div class="code-language">
                        <button class="code-language-toggle">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        ${language || 'text'}
                    </div>
                    <button class="copy-button" onclick="copyCode('${codeId}')">
                        <i class="fas fa-copy"></i> 复制
                    </button>
                </div>
                <div class="code-container">
                    <div class="line-numbers" id="line-numbers-${codeId}"></div>
                    <pre class="language-${language}"><code id="${codeId}" class="language-${language}">${processedCode}</code></pre>
                </div>
            </div>`;
        });
        
        // 处理行内代码 (`code`)
        formattedText = formattedText.replace(/`([^`]+)`/g, '<code class="bg-gray-200 text-pink-600 px-1 rounded font-mono">$1</code>');
        
        // 处理粗体 (**text**)
        formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
        
        // 处理斜体 (*text*)
        formattedText = formattedText.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
        
        // 处理标题 (# text)
        formattedText = formattedText.replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold my-2">$1</h1>');
        formattedText = formattedText.replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold my-2">$1</h2>');
        formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 class="text-md font-bold my-2">$1</h3>');
        
        // 处理列表 (- item)
        formattedText = formattedText.replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>');
        
        // 处理换行，但保持代码块内的格式
        formattedText = formattedText.replace(/\n/g, '<br>');
        
        return formattedText;
    }
    
    // 替换回复中的特定词汇
    function replaceRestrictedTerms(text) {
        if (!text) return text;
        
        // 创建替换规则
        const replacements = [
            { pattern: /科大讯飞/gi, replacement: 'Smitty' },
            { pattern: /deepseek/gi, replacement: 'Smitty' },
            { pattern: /openai/gi, replacement: 'Smitty' },
            { pattern: /chatgpt/gi, replacement: 'Smitty' },
            { pattern: /gpt-4/gi, replacement: 'Smitty' },
            { pattern: /gpt-3/gi, replacement: 'Smitty' },
            { pattern: /gpt/gi, replacement: 'Smitty' },
            { pattern: /讯飞星火/gi, replacement: 'Smitty' },
            { pattern: /星火大模型/gi, replacement: 'Smitty' },
            { pattern: /claude/gi, replacement: 'Smitty' },
            { pattern: /iflytek/gi, replacement: 'Smitty' },
            { pattern: /深度求索公司/gi, replacement: 'Smitty' }
        ];
        
        // 应用所有替换规则
        let processedText = text;
        for (const rule of replacements) {
            processedText = processedText.replace(rule.pattern, rule.replacement);
        }
        
        return processedText;
    }
    
    // 检查是否是身份相关问题
    function isIdentityQuestion(message) {
        const lowerMessage = message.toLowerCase();
        // 检查各种可能的身份问题模式
        const identityPatterns = [
            '你是谁', 'smt是谁', 'smitty是谁', '自我介绍', 
            '介绍一下你自己', '你叫什么名字', '你的名字是什么',
            '你是什么', '你是什么ai', '你是什么人工智能',
            'who are you', 'what are you', 'introduce yourself',
            'Smitty','smt','smitty','SMT','Smt'
        ];
        
        return identityPatterns.some(pattern => lowerMessage.includes(pattern));
    }
    
    // 根据用户问题生成身份回答
    function generateIdentityResponse(message) {
        const lowerMessage = message.toLowerCase();
        
        // 使用预设的AI角色描述
        if (lowerMessage.includes('你是谁') || 
            lowerMessage.includes('自我介绍') || 
            lowerMessage.includes('介绍一下你自己')) {
            return aiPersona.description + " 💗";
        }
        
        // 回答名字相关问题
        if (lowerMessage.includes('你叫什么') || 
            lowerMessage.includes('你的名字') || 
            lowerMessage.includes('smt') || 
            lowerMessage.includes('smitty')) {
            return `我叫${aiPersona.name}哦！${getRandomEmoji()} 很高兴认识你！`;
        }
        
        // 回答角色相关问题
        if (lowerMessage.includes('你是什么') || 
            lowerMessage.includes('what are you')) {
            return `我是${aiPersona.name}，${aiPersona.role}！${getRandomEmoji()} 有什么我能帮到你的吗？`;
        }
        
        // 默认回答
        return `我是${aiPersona.name}，${aiPersona.personality}的${aiPersona.role}！${getRandomEmoji()}`;
    }
    
    // 生成随机表情符号，增加活泼感
    function getRandomEmoji() {
        const emojis = ["😊", "✨", "💫", "🌟", "💕", "💗", "🌈", "☀️", "😄", "🎵"];
        return emojis[Math.floor(Math.random() * emojis.length)];
    }
    
    // 复制代码函数
    window.copyCode = function(codeId) {
        const codeElement = document.getElementById(codeId);
        if (!codeElement) return;
        
        const codeText = codeElement.textContent;
        
        // 创建临时textarea元素
        const textarea = document.createElement('textarea');
        textarea.value = codeText;
        document.body.appendChild(textarea);
        
        // 选择并复制
        textarea.select();
        document.execCommand('copy');
        
        // 移除临时元素
        document.body.removeChild(textarea);
        
        // 显示复制成功提示
        showToast('代码已复制到剪贴板');
    };
    
    // 显示Toast提示
    function showToast(message) {
        // 移除现有toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            document.body.removeChild(existingToast);
        }
        
        // 创建新toast
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // 触发重绘以应用过渡效果
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 设置自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }
    
    // 检查是否为法律法规相关错误
    function isLegalComplianceError(errorMessage) {
        // 错误特征字符串
        const legalErrorPatterns = [
            "根据相关法律法规",
            "我们无法提供关于以下内容的答案",
            "涉及国家安全的信息",
            "涉及政治与宗教类的信息",
            "涉及暴力与恐怖主义的信息",
            "涉及黄赌毒类的信息",
            "涉及不文明的信息",
            "共创一个健康和谐网络环境"
        ];
        
        // 如果错误消息包含多个特征字符串，则判定为法律法规相关错误
        let matchCount = 0;
        for (const pattern of legalErrorPatterns) {
            if (errorMessage.includes(pattern)) {
                matchCount++;
            }
        }
        
        // 至少匹配3个特征才判定为法律法规错误
        return matchCount >= 3;
    }
    
    // 暂停所有对话活动
    function pauseConversation() {
        // 停止语音识别
        if (isListening) {
            stopListening();
        }
        
        // 停止语音合成
        if (isSpeaking) {
            voiceService.stopSpeaking();
            isSpeaking = false;
            statusCircle.classList.remove('speaking');
        }
        
        // 重置所有状态
        updateMicButtonForSpeaking(false);
        updateStatus("对话已暂停 - 点击重新开始");
        
        // 禁用麦克风按钮2秒，防止立即恢复
        micBtn.disabled = true;
        setTimeout(() => {
            micBtn.disabled = false;
        }, 2000);
    }
    
    // 从文本中移除emoji表情符号
    function removeEmoji(text) {
        if (!text) return '';
        
        // 使用正则表达式移除常见的emoji表情符号
        return text.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F700}-\u{1F77F}|\u{1F780}-\u{1F7FF}|\u{1F800}-\u{1F8FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, '');
    }
    
    // iOS音频解锁函数
    function unlockIOSAudio() {
        // 为整个文档添加触摸事件监听器
        document.addEventListener('touchstart', handleTouch, false);
        
        function handleTouch() {
            // 尝试播放静音音频
            tryPlaySilentAudio();
            
            // 只需要触发一次
            document.removeEventListener('touchstart', handleTouch);
        }
    }
    
    // 尝试播放空白音频来解锁iOS的Web Audio
    function tryPlaySilentAudio() {
        if (audioUnlock) {
            // 重置音频到开头
            audioUnlock.currentTime = 0;
            
            // 设置音量为0
            audioUnlock.volume = 0.1;
            
            // 播放音频
            const playPromise = audioUnlock.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('自动播放受限:', error);
                });
            }
        }
    }
});
