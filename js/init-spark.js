// init-spark.js
// 初始化星火API配置

document.addEventListener('DOMContentLoaded', () => {
    // 从.env文件中获取配置
    // 注意：在实际生产环境中，这些值应该从服务器端获取，而不是直接嵌入到前端代码中
    const appId = '3993bebc';
    const apiKey = 'b1ac6aed76cef76575745f348445afdc';
    const apiSecret = 'MGJhNmNhNThlNzQyZmM5MTY5OTRlZjZl';
    const uid = 'SMTLITE';
    const url = 'wss://spark-api.xf-yun.com/v1.1/chat';
    const domain = 'lite';
    
    // 初始化星火API
    window.sparkAPI.init({
        appId,
        apiKey,
        apiSecret,
        uid,
        url,
        domain
    });
    
    console.log('星火API配置已初始化');
}); 